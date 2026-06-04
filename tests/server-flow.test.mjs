import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  Amount,
  CHALLENGE_HMAC_KEY_PREFIX,
  ChargeOptions,
  P3PError,
  P3PEnvironment,
  PaymentGateway,
  PaymentMethod,
  PineLabsOnlineP3P,
  buildRequestHash,
  buildReceiptHeader,
  decidePayment,
  deriveChallengeHmacKey,
} from "../dist/index.js";

function response(status, body, headers = {}) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function config(fetchImpl, availablePaymentMethods = [PaymentMethod.UPI_RESERVE_PAY, PaymentMethod.Crypto]) {
  return {
    clientId: "server-client",
    clientSecret: "server-secret",
    realm: "Pine Labs Online P3P",
    env: P3PEnvironment.SANDBOX,
    paymentGateway: PaymentGateway.PineLabsOnline,
    availablePaymentMethods,
    fetch: fetchImpl,
  };
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

test("generates and verifies signed payment credentials", async () => {
  const p3p = PineLabsOnlineP3P.create(config(globalThis.fetch));
  const challenge = await p3p.generateChallenge(
    new ChargeOptions(new Amount(15000, "INR"), "/api/premium"),
  );

  const credentialHeader = `Payment ${Buffer.from(
    JSON.stringify({
      challenge: challenge.challenge,
      source: "client-client",
      payload: {
        type: "token",
        token: "P3P_TOK_123",
        customer_reference: "cust-ref-123",
        mobile_number: "9876543210",
        payment_method: PaymentMethod.UPI_RESERVE_PAY,
      },
    }),
  ).toString("base64url")}`;

  const verification = await p3p.verifyCredential(credentialHeader);
  assert.equal(verification.valid, true);
  assert.equal(verification.credential.payload.customer_reference, "cust-ref-123");
  assert.equal(verification.credential.payload.mobile_number, "9876543210");
  assert.equal(verification.credential.payload.payment_method, PaymentMethod.UPI_RESERVE_PAY);
});

test("server derives challenge HMAC key from clientSecret", async () => {
  assert.equal(CHALLENGE_HMAC_KEY_PREFIX, "p3p-challenge-v1:");
  assert.equal(deriveChallengeHmacKey("server-secret"), "p3p-challenge-v1:server-secret");

  const p3p = PineLabsOnlineP3P.create(config(globalThis.fetch));
  const generated = await p3p.generateChallenge(
    new ChargeOptions(new Amount(100, "INR"), "/api/premium"),
  );
  const credentialHeader = `Payment ${Buffer.from(
    JSON.stringify({
      challenge: generated.challenge,
      source: "client-client",
      payload: {
        type: "token",
        token: "P3P_TOK_123",
        payment_method: PaymentMethod.UPI_RESERVE_PAY,
      },
    }),
  ).toString("base64url")}`;

  const valid = await p3p.verifyCredential(credentialHeader);
  const invalid = await PineLabsOnlineP3P.create({
    ...config(globalThis.fetch),
    clientSecret: "different-server-secret",
  }).verifyCredential(credentialHeader);

  assert.equal(valid.valid, true);
  assert.equal(invalid.valid, false);
  assert.match(invalid.error, /HMAC verification failed/i);
});

test("generated 402 challenge omits deprecated gateway and advertises payment methods", async () => {
  const p3p = PineLabsOnlineP3P.create(config(globalThis.fetch));
  const result = await p3p.generateChallenge(
    new ChargeOptions(new Amount(15000, "INR"), "/api/premium"),
  );

  assert.equal(result.challenge.paymentGateway, undefined);
  assert.deepEqual(result.challenge.request.availablePaymentMethods, [
    PaymentMethod.UPI_RESERVE_PAY,
    PaymentMethod.Crypto,
  ]);

  const decoded = JSON.parse(Buffer.from(result.encoded, "base64url").toString("utf8"));
  assert.equal("paymentGateway" in decoded, false);
  assert.deepEqual(decoded.request.availablePaymentMethods, [
    PaymentMethod.UPI_RESERVE_PAY,
    PaymentMethod.Crypto,
  ]);
});

test("decidePayment returns a 402 challenge when no credential is present", async () => {
  const decision = await decidePayment({
    credentialHeader: undefined,
    config: config(globalThis.fetch),
    chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  });

  assert.equal(decision.action, "challenge");
  assert.equal(decision.status, 402);
  assert.equal(decision.headers["WWW-Authenticate"].startsWith("Payment "), true);
});

test("decidePayment captures payment through central auth and P3P debit", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/debit") {
      assert.equal(init.headers.Authorization, "Bearer server-access-token");
      assert.equal(init.headers["X-Customer-Key"], undefined);
      assert.equal("Merchant-ID" in init.headers, false);
      const body = JSON.parse(init.body);
      assert.deepEqual(body.customer, { mobile_number: "9876543210" });
      assert.equal(body.payment_token, "P3P_TOK_123");
      assert.equal(body.payment_method, PaymentMethod.Crypto);
      assert.equal(body.challenge_id, generated.challenge.id);
      assert.deepEqual(body.payment_amount, { value: 100, currency: "INR" });
      assert.equal("Request-Hash" in init.headers, false);
      return response(200, {
        data: {
          type: "RESERVE_PAY",
          payment_method: PaymentMethod.UPI_RESERVE_PAY,
          payment_method_reference_id: "mnd_test",
          payment_id: "pay_123",
          merchant_order_reference: init.headers["Idempotency-Key"],
          amount: { value: 100, currency: "INR" },
          status: "CONFIRMED",
          metadata: {
            external_capture_id: "cap_123",
            sbmd_data: { settled_at: "2030-01-01T00:00:00Z" },
          },
        },
      });
    }

    return response(404, { error: "not found" });
  };

  const p3p = PineLabsOnlineP3P.create(config(fetchImpl));
  const generated = await p3p.generateChallenge(
    new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  );
  const credentialHeader = `Payment ${Buffer.from(
    JSON.stringify({
      challenge: generated.challenge,
      source: "client-client",
      payload: {
        type: "token",
        token: "P3P_TOK_123",
        customer_reference: "cust-ref-123",
        mobile_number: "9876543210",
        payment_method: PaymentMethod.Crypto,
      },
    }),
  ).toString("base64url")}`;

  const decision = await decidePayment({
    credentialHeader,
    config: config(fetchImpl),
    chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  });

  assert.equal(decision.action, "proceed");
  assert.equal(decision.captureResult.payment_method, PaymentMethod.UPI_RESERVE_PAY);
  assert.equal(decision.headers["Payment-Receipt"].startsWith("Payment "), true);
  const decodedReceipt = JSON.parse(
    Buffer.from(decision.headers["Payment-Receipt"].slice("Payment ".length), "base64url").toString("utf8"),
  );
  assert.equal("method" in decodedReceipt, false);
  assert.equal(decodedReceipt.paymentGateway, PaymentGateway.PineLabsOnline);
  assert.equal(decodedReceipt.paymentMethod, PaymentMethod.UPI_RESERVE_PAY);
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/auth/v1/token", "/mpp/v1/debit"],
  );
});

test("server SDK creates mandates without exposing token creation", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/pre-authorize") {
      assert.equal(init.headers.Authorization, "Bearer server-access-token");
      assert.equal(init.headers["X-Customer-Key"], undefined);
      assert.deepEqual(JSON.parse(init.body), {
        payment_method: "RESERVE_PAY",
        customer: {
          mobile_number: "9876543210",
        },
        amount: { value: 500000, currency: "INR" },
        validity_in_days: 20,
        description: "P3P checkout /api/orders",
      });
      return response(200, {
        data: {
          type: "RESERVE_PAY",
          payment_method_reference_id: "v1-sub-260528202124-aa-Upu5Jk",
          customer: {
            customer_id: "cust-v1-260528202100-aa-iDjsog",
            merchant_customer_reference: "cust-ref-123",
            mobile_number: "9876543210"
          },
          challenge_url: "upi://mandate?pa=setu.pluralcug@pineaxis&tr=mandate_mmznosggn910000",
          status: "PENDING",
          amount: { value: 500000, currency: "INR" },
          validity_in_days: 20,
          expiry_at: "2026-06-07T20:21:24.364301Z",
        },
      });
    }

    return response(404, { error: "not found" });
  };

  const p3p = PineLabsOnlineP3P.create(config(fetchImpl));
  const mandate = await p3p.createMandate({
    amount: new Amount(500000, "INR"),
    customerReference: "cust-ref-123",
    mobileNumber: "9876543210",
    description: "P3P checkout /api/orders",
    validityInDays: 20,
  });

  assert.equal(mandate.mandate_id, "v1-sub-260528202124-aa-Upu5Jk");
  assert.equal(mandate.customer_id, "cust-v1-260528202100-aa-iDjsog");
  assert.equal(mandate.customer_reference, "cust-ref-123");
  assert.equal(mandate.mobile_number, "9876543210");
  assert.equal(mandate.payment_status, "PENDING");
  assert.deepEqual(mandate.amount, new Amount(500000, "INR"));
  assert.equal(mandate.expires_at, "2026-06-07T20:21:24.364301Z");
  assert.equal(mandate.challenge.deep_link, "upi://mandate?pa=setu.pluralcug@pineaxis&tr=mandate_mmznosggn910000");
  assert.equal("createToken" in p3p, false);
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/auth/v1/token", "/mpp/v1/pre-authorize"],
  );
});

test("server SDK returns raw UAT debit response fields", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/debit") {
      return response(200, {
        type: "RESERVE_PAY",
        payment_method_reference_id: "v1-sub-260527235716-aa-TmOgVb",
        customer: {
          customer_id: "cust-v1-260527235715-aa-IawrBS",
          merchant_customer_reference: "abcd0008",
          mobile_number: "9039498008",
        },
        merchant_payment_debit_reference: "4d3b8b95-2a1c-4e6c-b15f-135b5fe00c70",
        amount: {
          value: 300,
          currency: "INR",
        },
        status: "PROCESSED",
        payment_data: {
          order_id: "v1-260528202422-aa-glLdyn",
          order_status: "PROCESSED",
          sbmd_data: {
            upstream_payment_id: "v1-260528202422-aa-glLdyn-up-a",
            upstream_payment_status: "PROCESSED",
          },
        },
      });
    }

    return response(404, { error: "not found" });
  };

  const p3p = PineLabsOnlineP3P.create(config(fetchImpl));
  const capture = await p3p.capture({
    token: "P3P_TOK_123",
    amount: new Amount(300, "INR"),
    paymentMethod: PaymentMethod.UPI_RESERVE_PAY,
    customerReference: "abcd0008",
    mobileNumber: "9039498008",
    challengeId: "cid",
  });

  assert.equal(capture.type, "RESERVE_PAY");
  assert.equal(capture.payment_method_reference_id, "v1-sub-260527235716-aa-TmOgVb");
  assert.equal(capture.customer.customer_id, "cust-v1-260527235715-aa-IawrBS");
  assert.equal(capture.customer.merchant_customer_reference, "abcd0008");
  assert.equal(capture.merchant_payment_debit_reference, "4d3b8b95-2a1c-4e6c-b15f-135b5fe00c70");
  assert.deepEqual(capture.amount, { value: 300, currency: "INR" });
  assert.equal(capture.status, "PROCESSED");
  assert.equal(capture.payment_data.order_id, "v1-260528202422-aa-glLdyn");
  assert.equal(capture.payment_data.sbmd_data.upstream_payment_id, "v1-260528202422-aa-glLdyn-up-a");
  assert.equal(capture.payment_gateway, PaymentGateway.PineLabsOnline);
  assert.equal(capture.payment_method, undefined);
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/auth/v1/token", "/mpp/v1/debit"],
  );
});

test("server SDK retries pending debit with the same idempotency key and honors Retry-After fallback", async () => {
  const calls = [];
  const delays = [];
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay = 0, ...args) => {
    delays.push(delay);
    callback(...args);
    return 0;
  };

  try {
    const fetchImpl = async (input, init = {}) => {
      const parsed = new URL(String(input));
      calls.push({ path: parsed.pathname, init });

      if (parsed.pathname === "/api/auth/v1/token") {
        return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
      }

      if (parsed.pathname === "/mpp/v1/debit") {
        const debitAttempt = calls.filter((call) => call.path === "/mpp/v1/debit").length;
        assert.equal(init.headers["Idempotency-Key"], "idem-retry-123");

        if (debitAttempt === 1) {
          return response(202, {
            merchant_payment_debit_reference: "debit-ref-123",
            amount: { value: 300, currency: "INR" },
            status: "PROCESSING",
          });
        }

        if (debitAttempt === 2) {
          return response(202, {
            merchant_payment_debit_reference: "debit-ref-123",
            amount: { value: 300, currency: "INR" },
            status: "PROCESSING",
          }, { "Retry-After": "3" });
        }

        return response(200, {
          merchant_payment_debit_reference: "debit-ref-123",
          amount: { value: 300, currency: "INR" },
          status: "PROCESSED",
          payment_data: {
            order_id: "ord_123",
            order_status: "PROCESSED",
          },
        });
      }

      return response(404, { error: "not found" });
    };

    const p3p = PineLabsOnlineP3P.create({
      ...config(fetchImpl),
      maxRetries: 2,
      initialRetryDelayMs: 11,
    });
    const capture = await p3p.capture({
      token: "P3P_TOK_123",
      amount: new Amount(300, "INR"),
      paymentMethod: PaymentMethod.UPI_RESERVE_PAY,
      customerReference: "abcd0008",
      mobileNumber: "9039498008",
      challengeId: "cid",
      idempotencyKey: "idem-retry-123",
    });

    assert.equal(capture.status, "PROCESSED");
    assert.equal(capture.merchant_payment_debit_reference, "debit-ref-123");
    assert.deepEqual(delays, [11, 3000]);
    assert.deepEqual(
      calls.map((call) => call.path),
      ["/api/auth/v1/token", "/mpp/v1/debit", "/mpp/v1/debit", "/mpp/v1/debit"],
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("server SDK returns a pending capture result after pending debit retries are exhausted", async () => {
  const calls = [];
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, _delay = 0, ...args) => {
    callback(...args);
    return 0;
  };

  try {
    const fetchImpl = async (input, init = {}) => {
      const parsed = new URL(String(input));
      calls.push({ path: parsed.pathname, init });

      if (parsed.pathname === "/api/auth/v1/token") {
        return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
      }

      if (parsed.pathname === "/mpp/v1/debit") {
        return response(202, {
          merchant_payment_debit_reference: "debit-ref-pending",
          amount: { value: 300, currency: "INR" },
          status: "PROCESSING",
        });
      }

      return response(404, { error: "not found" });
    };

    const p3p = PineLabsOnlineP3P.create({
      ...config(fetchImpl),
      maxRetries: 1,
      initialRetryDelayMs: 7,
    });
    const capture = await p3p.capture({
      token: "P3P_TOK_123",
      amount: new Amount(300, "INR"),
      paymentMethod: PaymentMethod.UPI_RESERVE_PAY,
      customerReference: "abcd0008",
      mobileNumber: "9039498008",
      challengeId: "cid",
      idempotencyKey: "idem-pending-123",
    });

    assert.equal(capture.status, "PROCESSING");
    assert.equal(capture.idempotencyKey, "idem-pending-123");
    assert.match(capture.message, /pending|processing/i);
    assert.deepEqual(
      calls.map((call) => call.path),
      ["/api/auth/v1/token", "/mpp/v1/debit", "/mpp/v1/debit"],
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("server SDK uses default pending retry budget and delay when config overrides are absent", async () => {
  const calls = [];
  const delays = [];
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay = 0, ...args) => {
    delays.push(delay);
    callback(...args);
    return 0;
  };

  try {
    const fetchImpl = async (input, init = {}) => {
      const parsed = new URL(String(input));
      calls.push({ path: parsed.pathname, init });

      if (parsed.pathname === "/api/auth/v1/token") {
        return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
      }

      if (parsed.pathname === "/mpp/v1/debit") {
        return response(202, {
          merchant_payment_debit_reference: "debit-ref-defaults",
          amount: { value: 300, currency: "INR" },
          status: "PROCESSING",
        });
      }

      return response(404, { error: "not found" });
    };

    const p3p = PineLabsOnlineP3P.create(config(fetchImpl));
    const capture = await p3p.capture({
      token: "P3P_TOK_123",
      amount: new Amount(300, "INR"),
      paymentMethod: PaymentMethod.UPI_RESERVE_PAY,
      customerReference: "abcd0008",
      mobileNumber: "9039498008",
      challengeId: "cid",
      idempotencyKey: "idem-defaults-123",
    });

    assert.equal(capture.status, "PROCESSING");
    assert.equal(calls.filter((call) => call.path === "/mpp/v1/debit").length, 3);
    assert.deepEqual(delays, [300, 300]);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("server SDK exposes getDebitStatus by idempotency key", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/debit/idem-status-123") {
      assert.equal(init.method, "GET");
      assert.equal(init.headers.Authorization, "Bearer server-access-token");
      return response(200, {
        payment_method: "RESERVE_PAY",
        merchant_payment_debit_reference: "idem-status-123",
        amount: { value: 300, currency: "INR" },
        status: "PROCESSED",
        payment_data: {
          order_id: "ord_status_123",
          order_status: "PROCESSED",
        },
      });
    }

    return response(404, { error: "not found" });
  };

  const p3p = PineLabsOnlineP3P.create(config(fetchImpl));
  const debitStatus = await p3p.getDebitStatus("idem-status-123");

  assert.equal(debitStatus.merchant_payment_debit_reference, "idem-status-123");
  assert.equal(debitStatus.status, "PROCESSED");
  assert.equal(debitStatus.payment_data.order_id, "ord_status_123");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/auth/v1/token", "/mpp/v1/debit/idem-status-123"],
  );
});

test("decidePayment returns 202 pending when debit remains in progress after retries", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, _delay = 0, ...args) => {
    callback(...args);
    return 0;
  };

  try {
    const fetchImpl = async (input, init = {}) => {
      const parsed = new URL(String(input));

      if (parsed.pathname === "/api/auth/v1/token") {
        return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
      }

      if (parsed.pathname === "/mpp/v1/debit") {
        return response(202, {
          merchant_payment_debit_reference: init.headers["Idempotency-Key"],
          amount: { value: 100, currency: "INR" },
          status: "PROCESSING",
        });
      }

      return response(404, { error: "not found" });
    };

    const serverConfig = {
      ...config(fetchImpl),
      maxRetries: 1,
      initialRetryDelayMs: 5,
    };
    const p3p = PineLabsOnlineP3P.create(serverConfig);
    const generated = await p3p.generateChallenge(
      new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
    );
    const credentialHeader = `Payment ${Buffer.from(
      JSON.stringify({
        challenge: generated.challenge,
        source: "client-client",
        payload: {
          type: "token",
          token: "P3P_TOK_123",
          customer_reference: "cust-ref-123",
          mobile_number: "9876543210",
          payment_method: PaymentMethod.UPI_RESERVE_PAY,
        },
      }),
    ).toString("base64url")}`;

    const decision = await decidePayment({
      credentialHeader,
      config: serverConfig,
      chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
    });

    assert.equal(decision.action, "pending");
    assert.equal(decision.status, 202);
    assert.equal(decision.captureResult.status, "PROCESSING");
    assert.ok(decision.captureResult.idempotencyKey);
    assert.deepEqual(decision.problemDetails, {
      status: "PENDING",
      idempotencyKey: decision.captureResult.idempotencyKey,
      message: "Debit is still processing.",
      debitStatus: "PROCESSING",
      retryAfter: 5,
    });
    assert.equal(decision.headers["Payment-Receipt"], undefined);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("buildReceiptHeader falls back to raw debit fields from the latest swagger shape", () => {
  const before = Date.now();
  const header = buildReceiptHeader({
    amount: { value: 300, currency: "INR" },
    merchant_payment_debit_reference: "debit-ref-123",
    payment_data: {
      order_id: "ord_raw_123",
      order_status: "PROCESSED",
    },
    status: "PROCESSED",
    settled_at: "",
    created_at: "2030-01-02T00:00:00Z",
    payment_gateway: PaymentGateway.PineLabsOnline,
    payment_method: PaymentMethod.UPI_RESERVE_PAY,
  }, "ch_raw_123");
  const after = Date.now();

  const decodedReceipt = JSON.parse(
    Buffer.from(header.slice("Payment ".length), "base64url").toString("utf8"),
  );
  assert.equal(decodedReceipt.reference, "debit-ref-123");
  assert.equal(decodedReceipt.orderId, null);
  assert.equal(decodedReceipt.merchantOrderReference, "debit-ref-123");
  assert.equal(typeof decodedReceipt.timestamp, "string");
  const timestamp = Date.parse(decodedReceipt.timestamp);
  assert.equal(Number.isFinite(timestamp), true);
  assert.equal(timestamp >= before && timestamp <= after + 1000, true);
  assert.deepEqual(decodedReceipt.settlement, { amount: "3.00", currency: "INR" });
});

test("decidePayment returns upstream capture code and message for 5xx debit failures", async () => {
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/debit") {
      return response(500, {
        code: "TOKEN_INVALID_OR_CONSUMED",
        message: "payment_token not found, expired, or already used",
      });
    }

    return response(404, { error: "not found" });
  };

  const serverConfig = config(fetchImpl);
  const p3p = PineLabsOnlineP3P.create(serverConfig);
  const generated = await p3p.generateChallenge(
    new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  );
  const credentialHeader = `Payment ${Buffer.from(
    JSON.stringify({
      challenge: generated.challenge,
      source: "client-client",
      payload: {
        type: "token",
        token: "P3P_TOK_123",
        customer_reference: "cust-ref-123",
        mobile_number: "9876543210",
        payment_method: PaymentMethod.UPI_RESERVE_PAY,
      },
    }),
  ).toString("base64url")}`;

  const decision = await decidePayment({
    credentialHeader,
    config: serverConfig,
    chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  });

  assert.equal(decision.action, "error");
  assert.equal(decision.status, 502);
  assert.equal(decision.headers["content-type"], "application/json");
  assert.deepEqual(decision.problemDetails, {
    code: "TOKEN_INVALID_OR_CONSUMED",
    message: "payment_token not found, expired, or already used",
  });
});

test("server config requires Pine client credentials", () => {
  assert.throws(
    () =>
      PineLabsOnlineP3P.create({
        env: P3PEnvironment.SANDBOX,
        paymentGateway: PaymentGateway.PineLabsOnline,
        availablePaymentMethods: [PaymentMethod.UPI_RESERVE_PAY],
        fetch: globalThis.fetch,
      }),
    /clientId and clientSecret/i,
  );
});

test("server config rejects static access tokens and requires client credentials", () => {
  assert.throws(
    () =>
      PineLabsOnlineP3P.create({
        accessToken: "Bearer configured-server-token",
        env: P3PEnvironment.SANDBOX,
        paymentGateway: PaymentGateway.PineLabsOnline,
        availablePaymentMethods: [PaymentMethod.UPI_RESERVE_PAY],
        fetch: globalThis.fetch,
      }),
    /clientId and clientSecret/i,
  );
});

test("server env selects sandbox URLs and sandbox retry defaults", async () => {
  const authCalls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    if (parsed.pathname === "/api/auth/v1/token") {
      authCalls.push({ host: parsed.host, init });
      return response(500, { code: "UPSTREAM_DOWN", message: "upstream unavailable" });
    }
    return response(404, { error: "not found" });
  };

  const p3p = PineLabsOnlineP3P.create({
    clientId: "server-client",
    clientSecret: "server-secret",
    env: P3PEnvironment.SANDBOX,
    paymentGateway: PaymentGateway.PineLabsOnline,
    availablePaymentMethods: [PaymentMethod.UPI_RESERVE_PAY],
    initialRetryDelayMs: 1,
    fetch: fetchImpl,
  });

  await assert.rejects(
    () =>
      p3p.createMandate({
        amount: new Amount(500000, "INR"),
        customerReference: "cust-ref-123",
      }),
    /upstream unavailable/i,
  );
  assert.deepEqual(authCalls.map((call) => call.host), [
    "pluraluat.v2.pinepg.in",
    "pluraluat.v2.pinepg.in",
    "pluraluat.v2.pinepg.in",
  ]);
});

test("buildRequestHash uses recursive canonical JSON", () => {
  const payload = {
    b: { y: 2, x: 1 },
    a: [{ d: 4, c: 3 }],
  };
  const expectedBody = '{"a":[{"c":3,"d":4}],"b":{"x":1,"y":2}}';
  const expected = createHash("sha256").update(expectedBody).digest("hex");

  assert.equal(buildRequestHash(payload), expected);
});

test("decidePayment rejects selected payment methods outside the signed challenge", async () => {
  const serverConfig = config(globalThis.fetch, [PaymentMethod.UPI_RESERVE_PAY]);
  const p3p = PineLabsOnlineP3P.create(serverConfig);
  const generated = await p3p.generateChallenge(
    new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  );
  const credentialHeader = `Payment ${Buffer.from(
    JSON.stringify({
      challenge: generated.challenge,
      source: "client-client",
      payload: {
        type: "token",
        token: "P3P_TOK_123",
        customer_reference: "cust-ref-123",
        payment_method: PaymentMethod.Crypto,
      },
    }),
  ).toString("base64url")}`;

  const decision = await decidePayment({
    credentialHeader,
    config: serverConfig,
    chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  });

  assert.equal(decision.action, "invalid");
  assert.equal(decision.status, 402);
  assert.match(decision.problemDetails.detail, /not accepted/i);
});

test("buildReceiptHeader encodes settlement data", () => {
  const header = buildReceiptHeader(
    {
      capture_id: "cap_1",
      object: "debit",
      mandate_id: "mnd_1",
      token_id: "P3P_TOK_1",
      customer_id: "cust_1",
      merchant_id: "",
      order_id: "ord_1",
      order_status: "CONFIRMED",
      payment_id: "pay_1",
      payment_status: "CONFIRMED",
      amount: new Amount(500, "INR"),
      payment_gateway: PaymentGateway.PineLabsOnline,
      payment_method: PaymentMethod.UPI_RESERVE_PAY,
      upi_txn_id: "",
      receipt: {},
      description: undefined,
      merchant_order_reference: "order-1",
      metadata: {},
      settled_at: "2030-01-01T00:00:00Z",
      created_at: "2030-01-01T00:00:00Z",
      raw: {},
    },
    "ch_1",
  );

  const decoded = JSON.parse(Buffer.from(header.slice("Payment ".length), "base64url").toString("utf8"));
  assert.equal(decoded.settlement.amount, "5.00");
  assert.equal(decoded.challengeId, "ch_1");
  assert.equal("method" in decoded, false);
  assert.equal(decoded.paymentGateway, PaymentGateway.PineLabsOnline);
  assert.equal(decoded.paymentMethod, PaymentMethod.UPI_RESERVE_PAY);
  assert.equal(decoded.orderId, "ord_1");
  assert.equal(decoded.merchantOrderReference, "order-1");
});

test("P3PError parses swagger error response shapes", () => {
  const topLevel = P3PError.fromResponse(400, {
    status: 400,
    code: "INVALID_REQUEST",
    message: "customer_reference is required",
  });
  assert.equal(topLevel.code, "INVALID_REQUEST");
  assert.equal(topLevel.message, "customer_reference is required");

  const errorMap = P3PError.fromResponse(400, { error: "missing request header" });
  assert.equal(errorMap.message, "missing request header");
});
