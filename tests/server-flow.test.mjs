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
          type: "SBMD",
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
  assert.equal(decision.headers["Payment-Receipt"].startsWith("Payment "), true);
  const decodedReceipt = JSON.parse(
    Buffer.from(decision.headers["Payment-Receipt"].slice("Payment ".length), "base64url").toString("utf8"),
  );
  assert.equal("method" in decodedReceipt, false);
  assert.equal(decodedReceipt.paymentGateway, PaymentGateway.PineLabsOnline);
  assert.equal(decodedReceipt.paymentMethod, PaymentMethod.Crypto);
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
        payment_method: "SBMD",
        customer: {
          mobile_number: "9876543210",
        },
        amount: { value: 500000, currency: "INR" },
        validity_in_days: 20,
        description: "P3P checkout /api/orders",
      });
      return response(200, {
        data: {
          type: "SBMD",
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

test("server SDK normalizes UAT debit response shape", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/debit") {
      return response(200, {
        type: "SBMD",
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

  assert.equal(capture.capture_id, "4d3b8b95-2a1c-4e6c-b15f-135b5fe00c70");
  assert.equal(capture.mandate_id, "v1-sub-260527235716-aa-TmOgVb");
  assert.equal(capture.customer_id, "cust-v1-260527235715-aa-IawrBS");
  assert.equal(capture.order_id, "v1-260528202422-aa-glLdyn");
  assert.equal(capture.order_status, "PROCESSED");
  assert.equal(capture.payment_id, "v1-260528202422-aa-glLdyn-up-a");
  assert.equal(capture.payment_status, "PROCESSED");
  assert.deepEqual(capture.amount, new Amount(300, "INR"));
  assert.equal(capture.merchant_order_reference, "4d3b8b95-2a1c-4e6c-b15f-135b5fe00c70");
  assert.equal(capture.receipt.reference, "4d3b8b95-2a1c-4e6c-b15f-135b5fe00c70");
  assert.equal(capture.receipt.external_payment_id, "v1-260528202422-aa-glLdyn-up-a");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/auth/v1/token", "/mpp/v1/debit"],
  );
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
