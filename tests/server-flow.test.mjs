import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  Amount,
  CHALLENGE_HMAC_KEY_PREFIX,
  ChargeOptions,
  P3PError,
  P3PEnvironment,
  GRANTEX_TOKEN_HEADER,
  PaymentGateway,
  PaymentMethod,
  PineLabsOnlineP3P,
  buildRequestHash,
  buildReceiptHeader,
  createHostedGrantexClient,
  decidePayment,
  deriveChallengeHmacKey,
} from "../dist/index.js";

function response(status, body, headers = {}) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function config(fetchImpl, availablePaymentMethods = [PaymentMethod.RESERVE_PAY, PaymentMethod.OTM]) {
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
        payment_method_reference_id: "auth_123",
        mobile_number: "9876543210",
        payment_method: PaymentMethod.RESERVE_PAY,
      },
    }),
  ).toString("base64url")}`;

  const verification = await p3p.verifyCredential(credentialHeader);
  assert.equal(verification.valid, true);
  assert.equal(verification.credential.payload.customer_reference, undefined);
  assert.equal(verification.credential.payload.payment_method_reference_id, "auth_123");
  assert.equal(verification.credential.payload.mobile_number, "9876543210");
  assert.equal(verification.credential.payload.payment_method, PaymentMethod.RESERVE_PAY);
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
        payment_method: PaymentMethod.RESERVE_PAY,
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
    PaymentMethod.RESERVE_PAY,
    PaymentMethod.OTM,
  ]);

  const decoded = JSON.parse(Buffer.from(result.encoded, "base64url").toString("utf8"));
  assert.equal("paymentGateway" in decoded, false);
  assert.deepEqual(decoded.request.availablePaymentMethods, [
    PaymentMethod.RESERVE_PAY,
    PaymentMethod.OTM,
  ]);
});

test("server verifies OTM payment method when advertised", async () => {
  const p3p = PineLabsOnlineP3P.create(config(globalThis.fetch, [PaymentMethod.OTM]));
  const generated = await p3p.generateChallenge(
    new ChargeOptions(new Amount(100, "INR"), "/api/otm"),
  );
  const credentialHeader = `Payment ${Buffer.from(
    JSON.stringify({
      challenge: generated.challenge,
      source: "client-client",
      payload: {
        type: "token",
        token: "P3P_TOK_OTM",
        payment_method: PaymentMethod.OTM,
      },
    }),
  ).toString("base64url")}`;

  const verification = await p3p.verifyCredential(credentialHeader);

  assert.equal(generated.challenge.request.availablePaymentMethods[0], PaymentMethod.OTM);
  assert.equal(verification.valid, true);
  assert.equal(verification.credential.payload.payment_method, PaymentMethod.OTM);
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
      assert.equal(body.payment_method, PaymentMethod.OTM);
      assert.equal(body.payment_method_reference_id, "mnd_test");
      assert.equal(body.challenge_id, generated.challenge.id);
      assert.deepEqual(body.payment_amount, { value: 100, currency: "INR" });
      assert.equal("Request-Hash" in init.headers, false);
      return response(200, {
        data: {
          type: "RESERVE_PAY",
          payment_method: PaymentMethod.RESERVE_PAY,
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
        payment_method_reference_id: "mnd_test",
        mobile_number: "9876543210",
        payment_method: PaymentMethod.OTM,
      },
    }),
  ).toString("base64url")}`;

  const decision = await decidePayment({
    credentialHeader,
    config: config(fetchImpl),
    chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  });

  assert.equal(decision.action, "proceed");
  assert.equal(decision.captureResult.payment_method, PaymentMethod.RESERVE_PAY);
  assert.equal(decision.headers["Payment-Receipt"].startsWith("Payment "), true);
  const decodedReceipt = JSON.parse(
    Buffer.from(decision.headers["Payment-Receipt"].slice("Payment ".length), "base64url").toString("utf8"),
  );
  assert.equal("method" in decodedReceipt, false);
  assert.equal(decodedReceipt.paymentGateway, PaymentGateway.PineLabsOnline);
  assert.equal(decodedReceipt.paymentMethod, PaymentMethod.RESERVE_PAY);
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

test("server SDK preserves CREDIT_EMI in pre-authorization requests and responses", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/pre-authorize") {
      assert.equal(init.headers.Authorization, "Bearer server-access-token");
      assert.equal(init.headers["Idempotency-Key"], "preauth-key-123");
      assert.deepEqual(JSON.parse(init.body), {
        payment_method: "CREDIT_EMI",
        customer: {
          mobile_number: "9876543210",
        },
        amount: { value: 1000, currency: "INR" },
        validity_in_days: 7,
        description: "Postman E2E test",
        merchant_metadata: {
          offer_data: '{"entities":[{"entity_id":"6"}]}',
          p3p_offer_required: "true",
        },
      });
      return response(200, {
        data: {
          payment_method: "CREDIT_EMI",
          customer: {
            customer_id: "cust-v1-260602201109-aa-hotwA8",
            merchant_customer_reference: "98f20ed3-7efc-40c1-9db6-427a4b65261d",
            mobile_number: "9876543210",
          },
          order_id: "v1-260630132707-aa-XRPK0Q",
          redirect_url: "https://pluraluat.v2.pinepg.in/api/v3/checkout-bff/redirect/checkout?token=V3_test",
          status: "PENDING",
          amount: {
            value: 1000,
            currency: "INR",
          },
          validity_in_days: 7,
          expiry_at: "2026-07-07T13:27:07.837993Z",
        },
      });
    }

    return response(404, { error: "not found" });
  };

  const p3p = PineLabsOnlineP3P.create(config(fetchImpl, [PaymentMethod.CREDIT_EMI]));
  const preAuthorization = await p3p.createPreAuthorization({
    paymentMethod: PaymentMethod.CREDIT_EMI,
    mobileNumber: "9876543210",
    amount: new Amount(1000, "INR"),
    validityInDays: 7,
    description: "Postman E2E test",
    idempotencyKey: "preauth-key-123",
    merchantMetadata: {
      offer_data: { entities: [{ entity_id: "6" }] },
      p3p_offer_required: "true",
    },
  });

  assert.equal(preAuthorization.payment_method, PaymentMethod.CREDIT_EMI);
  assert.equal(preAuthorization.payment_method_reference_id, "v1-260630132707-aa-XRPK0Q");
  assert.equal(preAuthorization.customer.customer_id, "cust-v1-260602201109-aa-hotwA8");
  assert.equal(preAuthorization.customer.mobile_number, "9876543210");
  assert.equal(preAuthorization.challenge_url, "https://pluraluat.v2.pinepg.in/api/v3/checkout-bff/redirect/checkout?token=V3_test");
  assert.equal(preAuthorization.redirect_url, "https://pluraluat.v2.pinepg.in/api/v3/checkout-bff/redirect/checkout?token=V3_test");
  assert.equal(preAuthorization.status, "PENDING");
  assert.deepEqual(preAuthorization.amount, new Amount(1000, "INR"));
  assert.equal(preAuthorization.validity_in_days, 7);
  assert.equal(preAuthorization.expiry_at, "2026-07-07T13:27:07.837993Z");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/auth/v1/token", "/mpp/v1/pre-authorize"],
  );
});

test("server SDK omits CARD pre-authorization validity when not provided", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/pre-authorize") {
      assert.equal(init.headers.Authorization, "Bearer server-access-token");
      assert.equal(init.headers["Idempotency-Key"], "preauth-key-no-validity");
      assert.deepEqual(JSON.parse(init.body), {
        payment_method: "CARD",
        customer: {
          mobile_number: "9390012810",
        },
        amount: { value: 1000, currency: "INR" },
        description: "Postman E2E test",
      });
      return response(200, {
        data: {
          payment_method: "CARD",
          payment_method_reference_id: "v1-sub-260709082743-aa-FVIZ29",
          customer: {
            customer_id: "cust-v1-260709082742-aa-hqn13Y",
            merchant_customer_reference: "67ec95c2-3e35-4409-adc7-a679015ce524",
            mobile_number: "9390012810",
          },
          challenge_url: "https://pluraluat.v2.pinepg.in/api/v3/checkout-bff/redirect/checkout?flow=CARD&token=V3_test",
          status: "ACTIVE",
          amount: {
            value: 1000,
            currency: "INR",
          },
          validity_in_days: 4,
          expiry_at: "2026-07-13T08:27:43.657369Z",
        },
      });
    }

    return response(404, { error: "not found" });
  };

  const p3p = PineLabsOnlineP3P.create(config(fetchImpl, [PaymentMethod.CARD]));
  const preAuthorization = await p3p.createPreAuthorization({
    paymentMethod: PaymentMethod.CARD,
    mobileNumber: "9390012810",
    amount: new Amount(1000, "INR"),
    description: "Postman E2E test",
    idempotencyKey: "preauth-key-no-validity",
  });

  assert.equal(preAuthorization.payment_method, PaymentMethod.CARD);
  assert.equal(preAuthorization.payment_method_reference_id, "v1-sub-260709082743-aa-FVIZ29");
  assert.equal(preAuthorization.challenge_url, "https://pluraluat.v2.pinepg.in/api/v3/checkout-bff/redirect/checkout?flow=CARD&token=V3_test");
  assert.equal(preAuthorization.redirect_url, undefined);
  assert.equal(preAuthorization.validity_in_days, 4);
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/auth/v1/token", "/mpp/v1/pre-authorize"],
  );
});

test("server SDK builds CARD checkout redirect URL from configured environment when omitted", async () => {
  const cases = [
    {
      env: P3PEnvironment.SANDBOX,
      token: "V3_M5HqetW6Q4UACVb64QZjaV4t8ntf5Qef",
      expected: "https://pluraluat.v2.pinepg.in/api/v3/checkout-bff/redirect/checkout?token=V3_M5HqetW6Q4UACVb64QZjaV4t8ntf5Qef",
    },
    {
      env: P3PEnvironment.PRODUCTION,
      token: "V3_Uq4iDSRBSbuWRub9%2BfVUgAV5d0CvedJPswx9YbRG1",
      expected: "https://api.pluralpay.in/api/v3/checkout-bff/redirect/checkout?token=V3_Uq4iDSRBSbuWRub9%2BfVUgAV5d0CvedJPswx9YbRG1",
    },
  ];

  for (const testCase of cases) {
    const fetchImpl = async (input) => {
      const parsed = new URL(String(input));
      if (parsed.pathname === "/api/auth/v1/token") {
        return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
      }
      if (parsed.pathname === "/mpp/v1/pre-authorize") {
        return response(200, {
          data: {
            payment_method: "CARD",
            token: testCase.token,
            order_id: "v1-260706093744-aa-XRPK0Q",
            response_code: 200,
            response_message: "Order Creation Successful.",
            customer: { mobile_number: "9876543210" },
            amount: { value: 1000, currency: "INR" },
            status: "PENDING",
          },
        });
      }
      return response(404, { error: "not found" });
    };

    const p3p = PineLabsOnlineP3P.create({
      ...config(fetchImpl, [PaymentMethod.CARD]),
      env: testCase.env,
    });
    const preAuthorization = await p3p.createPreAuthorization({
      paymentMethod: PaymentMethod.CARD,
      mobileNumber: "9876543210",
      amount: new Amount(1000, "INR"),
    });

    assert.equal(preAuthorization.payment_method_reference_id, "v1-260706093744-aa-XRPK0Q");
    assert.equal(preAuthorization.redirect_url, testCase.expected);
    assert.equal(preAuthorization.challenge_url, testCase.expected);
  }
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
    paymentMethod: PaymentMethod.RESERVE_PAY,
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

test("server SDK sends CARD debit with pre-authorization reference", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/debit") {
      assert.equal(init.headers.Authorization, "Bearer server-access-token");
      assert.equal(init.headers["Idempotency-Key"], "debit-card-key-123");
      assert.deepEqual(JSON.parse(init.body), {
        payment_method: "CARD",
        customer: {
          mobile_number: "9876543210",
        },
        merchant_order_reference: "order-card-123",
        payment_amount: { value: 300, currency: "INR" },
        payment_token: "P3P_TOK_CARD_123",
        challenge_id: "ch_card_123",
        payment_method_reference_id: "auth_card_123",
      });
      return response(200, {
        data: {
          type: "CARD",
          payment_method: "CARD",
          payment_method_reference_id: "auth_card_123",
          merchant_payment_debit_reference: "debit-card-key-123",
          amount: { value: 300, currency: "INR" },
          status: "PROCESSED",
          payment_data: {
            order_id: "ord_card_123",
            order_status: "PROCESSED",
          },
        },
      });
    }

    return response(404, { error: "not found" });
  };

  const p3p = PineLabsOnlineP3P.create(config(fetchImpl, [PaymentMethod.CARD]));
  const capture = await p3p.capture({
    token: "P3P_TOK_CARD_123",
    amount: new Amount(300, "INR"),
    paymentMethod: PaymentMethod.CARD,
    paymentMethodReferenceId: "auth_card_123",
    mobileNumber: "9876543210",
    challengeId: "ch_card_123",
    merchantOrderReference: "order-card-123",
    idempotencyKey: "debit-card-key-123",
  });

  assert.equal(capture.payment_method, PaymentMethod.CARD);
  assert.equal(capture.payment_method_reference_id, "auth_card_123");
  assert.equal(capture.merchant_payment_debit_reference, "debit-card-key-123");
  assert.equal(capture.status, "PROCESSED");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/auth/v1/token", "/mpp/v1/debit"],
  );
});

test("server SDK sends CREDIT_EMI debit with pre-authorization reference", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });
    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }
    if (parsed.pathname === "/mpp/v1/debit") {
      const body = JSON.parse(init.body);
      assert.equal(body.payment_method, "CREDIT_EMI");
      assert.equal(body.payment_method_reference_id, "auth_credit_emi_123");
      return response(200, { data: {
        status: "PROCESSED",
        payment_method: "CREDIT_EMI",
        payment_method_reference_id: "auth_credit_emi_123",
        amount: { value: 14897000, currency: "INR" },
      } });
    }
    return response(404, { error: "not found" });
  };

  const p3p = PineLabsOnlineP3P.create(config(fetchImpl, [PaymentMethod.CREDIT_EMI]));
  const capture = await p3p.capture({
    token: "P3P_TOK_CREDIT_EMI_123",
    amount: new Amount(14897000, "INR"),
    paymentMethod: PaymentMethod.CREDIT_EMI,
    paymentMethodReferenceId: "auth_credit_emi_123",
    mobileNumber: "9390012811",
    challengeId: "ch_credit_emi_123",
    idempotencyKey: "debit-credit-emi-123",
  });

  assert.equal(capture.payment_method, PaymentMethod.CREDIT_EMI);
  assert.equal(capture.payment_method_reference_id, "auth_credit_emi_123");
  assert.deepEqual(calls.map((call) => call.path), ["/api/auth/v1/token", "/mpp/v1/debit"]);
});

test("server SDK rejects CREDIT_EMI debit without a pre-authorization reference", async () => {
  let networkCalled = false;
  const p3p = PineLabsOnlineP3P.create(config(async () => {
    networkCalled = true;
    return response(500, {});
  }, [PaymentMethod.CREDIT_EMI]));
  await assert.rejects(() => p3p.capture({
    token: "P3P_TOK_CREDIT_EMI_123",
    amount: new Amount(1000, "INR"),
    paymentMethod: PaymentMethod.CREDIT_EMI,
    mobileNumber: "9390012811",
    challengeId: "ch_credit_emi_123",
  }), /paymentMethodReferenceId is required for CREDIT_EMI/);
  assert.equal(networkCalled, false);
});

test("server SDK polls debit status after a pending (202) debit instead of re-POSTing", async () => {
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

      // The debit is POSTed exactly once; the async result is resolved by
      // polling the read-only GET /mpp/v1/debit/{id} endpoint.
      if (parsed.pathname === "/mpp/v1/debit") {
        assert.equal(init.method ?? "GET", "POST");
        assert.equal(init.headers["Idempotency-Key"], "idem-retry-123");
        return response(202, {
          merchant_payment_debit_reference: "debit-ref-123",
          amount: { value: 300, currency: "INR" },
          status: "PROCESSING",
        });
      }

      if (parsed.pathname === "/mpp/v1/debit/idem-retry-123") {
        assert.equal(init.method, "GET");
        assert.equal(init.headers.Authorization, "Bearer server-access-token");
        const statusPoll = calls.filter((call) => call.path === "/mpp/v1/debit/idem-retry-123").length;

        if (statusPoll === 1) {
          return response(200, {
            merchant_payment_debit_reference: "debit-ref-123",
            amount: { value: 300, currency: "INR" },
            status: "PROCESSING",
          });
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
      paymentMethod: PaymentMethod.RESERVE_PAY,
      customerReference: "abcd0008",
      mobileNumber: "9039498008",
      challengeId: "cid",
      idempotencyKey: "idem-retry-123",
    });

    assert.equal(capture.status, "PROCESSED");
    assert.equal(capture.merchant_payment_debit_reference, "debit-ref-123");
    // The 202 carried no Retry-After, so polling falls back to initialRetryDelayMs.
    assert.deepEqual(delays, [11, 11]);
    // Debit POSTed once; then GET-polled until the status became terminal.
    assert.deepEqual(
      calls.map((call) => call.path),
      [
        "/api/auth/v1/token",
        "/mpp/v1/debit",
        "/mpp/v1/debit/idem-retry-123",
        "/mpp/v1/debit/idem-retry-123",
      ],
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

      // The status poll keeps reporting PROCESSING, so the debit stays pending.
      if (parsed.pathname === "/mpp/v1/debit/idem-pending-123") {
        assert.equal(init.method, "GET");
        return response(200, {
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
      paymentMethod: PaymentMethod.RESERVE_PAY,
      customerReference: "abcd0008",
      mobileNumber: "9039498008",
      challengeId: "cid",
      idempotencyKey: "idem-pending-123",
    });

    assert.equal(capture.status, "PROCESSING");
    assert.equal(capture.idempotencyKey, "idem-pending-123");
    assert.match(capture.message, /pending|processing/i);
    // Debit POSTed once, then polled once (maxRetries === 1) before giving up.
    assert.deepEqual(
      calls.map((call) => call.path),
      ["/api/auth/v1/token", "/mpp/v1/debit", "/mpp/v1/debit/idem-pending-123"],
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

      if (parsed.pathname === "/mpp/v1/debit/idem-defaults-123") {
        return response(200, {
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
      paymentMethod: PaymentMethod.RESERVE_PAY,
      customerReference: "abcd0008",
      mobileNumber: "9039498008",
      challengeId: "cid",
      idempotencyKey: "idem-defaults-123",
    });

    assert.equal(capture.status, "PROCESSING");
    // Debit POSTed once; default maxRetries (2) drives two status polls.
    assert.equal(calls.filter((call) => call.path === "/mpp/v1/debit").length, 1);
    assert.equal(calls.filter((call) => call.path === "/mpp/v1/debit/idem-defaults-123").length, 2);
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

test("server SDK exposes getMandateBalance by authorization id", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, search: parsed.search, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/balance") {
      assert.equal(parsed.searchParams.get("authorization_id"), "auth_123");
      assert.equal(parsed.searchParams.get("phone_number"), "9876543210");
      assert.equal(parsed.searchParams.get("type"), null);
      return response(200, {
        data: {
          payment_method: "RESERVE_PAY",
          payment_method_reference_id: "auth_123",
          merchant_id: "MERCHANT_123",
          customer: {
            mobile_number: "9876543210",
            merchant_customer_reference: "cust_123",
            bank_account_number: "XXXX1234",
          },
          status: "ACTIVE",
          amount: { value: 50000, currency: "INR" },
          description: "Subscription mandate",
          validity_in_days: 365,
          expiry_at: "2027-06-05T10:30:00Z",
          challenge_url: "upi://mandate?id=auth_123",
          external_reference_id: "ext_123",
          created_at: "2026-06-05T10:30:00Z",
          balance_details: {
            amount_debited: { value: 10000, currency: "INR" },
            amount_remaining: { value: 40000, currency: "INR" },
          },
        },
      });
    }

    return response(404, { error: "not found" });
  };

  const p3p = PineLabsOnlineP3P.create(config(fetchImpl));
  const result = await p3p.getMandateBalance({
    authorizationId: "auth_123",
    phoneNumber: "9876543210",
    paymentMethod: PaymentMethod.RESERVE_PAY,
  });

  assert.equal(result.payment_method, PaymentMethod.RESERVE_PAY);
  assert.equal(result.payment_method_reference_id, "auth_123");
  assert.equal(result.customer.mobile_number, "9876543210");
  assert.equal(result.balance_details.amount_remaining.value, 40000);
  assert.equal(result.raw.external_reference_id, "ext_123");
  assert.deepEqual(
    calls.map((call) => `${call.path}${call.search}`),
    ["/api/auth/v1/token", "/mpp/v1/balance?authorization_id=auth_123&phone_number=9876543210"],
  );
});

test("server SDK exposes getMandateBalance by phone number and RESERVE_PAY", async () => {
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/balance") {
      assert.equal(parsed.searchParams.get("phone_number"), "9876543210");
      assert.equal(parsed.searchParams.get("type"), "RESERVE_PAY");
      assert.equal(parsed.searchParams.get("authorization_id"), null);
      return response(200, {
        data: {
          payment_method: "RESERVE_PAY",
          payment_method_reference_id: "auth_reserve_pay_123",
          merchant_id: "MERCHANT_123",
          customer: {
            mobile_number: "9876543210",
          },
          status: "PENDING",
          created_at: "2026-06-05T10:30:00Z",
        },
      });
    }

    return response(404, { error: "not found" });
  };

  const p3p = PineLabsOnlineP3P.create(config(fetchImpl));
  const result = await p3p.getMandateBalance({
    phoneNumber: "9876543210",
    paymentMethod: PaymentMethod.RESERVE_PAY,
  });

  assert.equal(result.payment_method, PaymentMethod.RESERVE_PAY);
  assert.equal(result.status, "PENDING");
});

test("server SDK rejects OTM for mandate balance lookup before network", async () => {
  let calls = 0;
  const p3p = PineLabsOnlineP3P.create(config(async () => {
    calls += 1;
    return response(500, {});
  }));

  await assert.rejects(
    () => p3p.getMandateBalance({
      authorizationId: "auth_123",
      phoneNumber: "9876543210",
      paymentMethod: PaymentMethod.OTM,
    }),
    /OTM is not supported for mandate balance lookup/,
  );
  assert.equal(calls, 0);
});

test("server SDK validates getMandateBalance lookup combinations", async () => {
  const p3p = PineLabsOnlineP3P.create(config(async () => response(500, {})));

  await assert.rejects(
    () => p3p.getMandateBalance({ phoneNumber: "9876543210" }),
    /paymentMethod is required/,
  );
  await assert.rejects(
    () => p3p.getMandateBalance({ paymentMethod: PaymentMethod.RESERVE_PAY }),
    /phoneNumber is required when authorizationId is absent/,
  );
  await assert.rejects(
    () => p3p.getMandateBalance({ phoneNumber: "9876543210", paymentMethod: PaymentMethod.Crypto }),
    /PaymentMethod\.Crypto is currently not supported in SDKs/,
  );
});

test("server SDK exposes revokeMandate", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/revoke") {
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), {
        payment_method: "RESERVE_PAY",
        payment_method_reference_id: "auth_123",
        customer: {
          mobile_number: "9876543210",
        },
      });
      return response(201, {
        data: {
          payment_method: "RESERVE_PAY",
          payment_method_reference_id: "auth_123",
          revoke_reference_id: "rvk_123",
          status: "CREATED",
        },
      });
    }

    return response(404, { error: "not found" });
  };

  const p3p = PineLabsOnlineP3P.create(config(fetchImpl));
  const result = await p3p.revokeMandate({
    paymentMethod: PaymentMethod.RESERVE_PAY,
    paymentMethodReferenceId: "auth_123",
    customer: { mobileNumber: "9876543210" },
  });

  assert.equal(result.payment_method, PaymentMethod.RESERVE_PAY);
  assert.equal(result.revoke_reference_id, "rvk_123");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/auth/v1/token", "/mpp/v1/revoke"],
  );
});

test("server SDK validates revokeMandate lookup combinations", async () => {
  const p3p = PineLabsOnlineP3P.create(config(async () => response(500, {})));

  await assert.rejects(
    () => p3p.revokeMandate({ paymentMethod: PaymentMethod.RESERVE_PAY }),
    /paymentMethodReferenceId or customer lookup is required/,
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
          payment_method_reference_id: "auth_123",
          mobile_number: "9876543210",
          payment_method: PaymentMethod.RESERVE_PAY,
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
    payment_method: PaymentMethod.RESERVE_PAY,
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
        payment_method_reference_id: "auth_123",
        mobile_number: "9876543210",
        payment_method: PaymentMethod.RESERVE_PAY,
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
        availablePaymentMethods: [PaymentMethod.RESERVE_PAY],
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
        availablePaymentMethods: [PaymentMethod.RESERVE_PAY],
        fetch: globalThis.fetch,
      }),
    /clientId and clientSecret/i,
  );
});

test("server config rejects CRYPTO as currently unsupported", () => {
  assert.throws(
    () =>
      PineLabsOnlineP3P.create({
        clientId: "server-client",
        clientSecret: "server-secret",
        env: P3PEnvironment.SANDBOX,
        paymentGateway: PaymentGateway.PineLabsOnline,
        availablePaymentMethods: [PaymentMethod.Crypto],
        fetch: globalThis.fetch,
      }),
    /PaymentMethod\.Crypto is currently not supported in SDKs/,
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
    availablePaymentMethods: [PaymentMethod.RESERVE_PAY],
    initialRetryDelayMs: 1,
    fetch: fetchImpl,
  });

  await assert.rejects(
    () =>
      p3p.createMandate({
        amount: new Amount(500000, "INR"),
        customerReference: "cust-ref-123",
        mobileNumber: "9876543210",
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
  const serverConfig = config(globalThis.fetch, [PaymentMethod.RESERVE_PAY]);
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

test("decidePayment enforces missing Grantex grant before capture", async () => {
  const serverConfig = {
    ...config(async () => {
      throw new Error("capture should not run when grant is missing");
    }),
    grantex: {
      jwksUri: "https://auth.grantex.dev/.well-known/jwks.json",
      requiredScopes: ["mpp:payment:initiate"],
      enforceGrant: true,
      hosted: { apiKey: "gx_test" },
    },
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
        mobile_number: "9876543210",
        payment_method: PaymentMethod.RESERVE_PAY,
      },
    }),
  ).toString("base64url")}`;

  const decision = await decidePayment({
    credentialHeader,
    config: serverConfig,
    chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  });

  assert.equal(GRANTEX_TOKEN_HEADER, "X-Grantex-Token");
  assert.equal(decision.action, "grant_required");
  assert.equal(decision.status, 403);
  assert.equal(decision.grantResult.valid, false);
  assert.equal(decision.headers["WWW-Authenticate"], undefined);
});

test("decidePayment verifies Grantex grant before capture", async () => {
  let verifierCalls = 0;
  const budgetCalls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }
    if (parsed.pathname === "/mpp/v1/debit") {
      assert.equal(init.headers.Authorization, "Bearer server-access-token");
      return response(200, {
        data: {
          payment_method: PaymentMethod.RESERVE_PAY,
          payment_id: "pay_123",
          merchant_order_reference: init.headers["Idempotency-Key"],
          amount: { value: 100, currency: "INR" },
          status: "CONFIRMED",
          metadata: { external_capture_id: "cap_123", sbmd_data: { settled_at: "2030-01-01T00:00:00Z" } },
        },
      });
    }
    return response(404, { error: "not found" });
  };
  const serverConfig = {
    ...config(fetchImpl),
    grantex: {
      requiredScopes: ["mpp:payment:initiate"],
      enforceGrant: true,
      hosted: {
        apiKey: "gx_test",
        sdkFactory: () => ({
          budgets: {
            debit: async (body) => {
              budgetCalls.push(body);
              return { grantId: body.grantId, remaining: 900, transactionId: "txn_budget" };
            },
          },
        }),
      },
      verifier: {
        async verify(token) {
          verifierCalls += 1;
          assert.equal(token, "grant_token_123");
          return {
            valid: true,
            grant: {
              tokenId: "tok_grant",
              grantId: "grnt_123",
              principalId: "user_123",
              agentDid: "did:web:agent",
              developerId: "dev_123",
              scopes: ["mpp:*"],
              issuedAt: 1,
              expiresAt: 2,
            },
          };
        },
      },
    },
  };
  const p3p = PineLabsOnlineP3P.create(serverConfig);
  const generated = await p3p.generateChallenge(new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"));
  const credentialHeader = `Payment ${Buffer.from(
    JSON.stringify({
      challenge: generated.challenge,
      source: "client-client",
      payload: {
        type: "token",
        token: "P3P_TOK_123",
        mobile_number: "9876543210",
        payment_method: PaymentMethod.RESERVE_PAY,
      },
    }),
  ).toString("base64url")}`;

  const decision = await decidePayment({
    credentialHeader,
    grantexTokenHeader: "grant_token_123",
    config: serverConfig,
    chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  });

  assert.equal(decision.action, "proceed");
  assert.equal(decision.grantResult.valid, true);
  assert.equal(decision.grantResult.grant.grantId, "grnt_123");
  assert.equal(verifierCalls, 1);
  assert.equal(budgetCalls.length, 1);
  assert.equal(budgetCalls[0].grantId, "grnt_123");
  assert.equal(budgetCalls[0].amount, 1);
});

test("decidePayment allows enforced custom Grantex verifier without hosted api key", async () => {
  let verifierCalls = 0;
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "server-access-token", expires_in: 3600 } });
    }
    if (parsed.pathname === "/mpp/v1/debit") {
      assert.equal(init.headers.Authorization, "Bearer server-access-token");
      return response(200, {
        data: {
          payment_method: PaymentMethod.RESERVE_PAY,
          payment_id: "pay_local_grant",
          merchant_order_reference: init.headers["Idempotency-Key"],
          amount: { value: 100, currency: "INR" },
          status: "CONFIRMED",
        },
      });
    }
    return response(404, { error: "not found" });
  };
  const serverConfig = {
    ...config(fetchImpl),
    grantex: {
      requiredScopes: ["mpp:payment:initiate"],
      enforceGrant: true,
      verifier: {
        async verify(token) {
          verifierCalls += 1;
          assert.equal(token, "local_grant_token");
          return {
            valid: true,
            grant: {
              tokenId: "tok_local_grant",
              grantId: "grnt_local",
              principalId: "user_123",
              agentDid: "did:web:agent",
              developerId: "dev_123",
              scopes: ["mpp:payment:initiate"],
              issuedAt: 1,
              expiresAt: 2,
            },
          };
        },
      },
    },
  };
  const p3p = PineLabsOnlineP3P.create(serverConfig);
  const generated = await p3p.generateChallenge(new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"));
  const credentialHeader = `Payment ${Buffer.from(
    JSON.stringify({
      challenge: generated.challenge,
      source: "client-client",
      payload: {
        type: "token",
        token: "P3P_TOK_123",
        mobile_number: "9876543210",
        payment_method: PaymentMethod.RESERVE_PAY,
      },
    }),
  ).toString("base64url")}`;

  const decision = await decidePayment({
    credentialHeader,
    grantexTokenHeader: "local_grant_token",
    config: serverConfig,
    chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  });

  assert.equal(decision.action, "proceed");
  assert.equal(decision.grantResult.valid, true);
  assert.equal(verifierCalls, 1);
});

test("hosted Grantex creates authorization, exchanges code, and manages budgets", async () => {
  const calls = [];
  const hosted = createHostedGrantexClient({
    apiKey: "gx_test",
    baseUrl: "https://api.grantex.dev",
    sdkFactory: () => ({
      authorize: async (body) => {
        calls.push(["authorize", body]);
        return {
          authRequestId: "areq_123",
          consentUrl: "https://consent.grantex.dev/authorize?req=123",
          agentId: body.agentId,
          principalId: body.userId,
          scopes: body.scopes,
          expiresAt: "2030-01-01T00:00:00Z",
          status: "pending",
        };
      },
      tokens: {
        exchange: async (body) => {
          calls.push(["exchange", body]);
          return {
            grantToken: "grant.jwt",
            grantId: "grnt_123",
            refreshToken: "rt_123",
            scopes: ["mpp:payment:initiate"],
            expiresAt: "2030-01-01T00:00:00Z",
          };
        },
      },
      budgets: {
        allocate: async (body) => {
          calls.push(["allocate", body]);
          return {
            id: "bdg_1",
            grantId: body.grantId,
            initialBudget: body.initialBudget,
            remainingBudget: body.initialBudget,
            currency: body.currency ?? "INR",
            createdAt: "2030-01-01T00:00:00Z",
          };
        },
        debit: async (body) => {
          calls.push(["debit", body]);
          return { grantId: body.grantId, remaining: 900, transactionId: "txn_1" };
        },
        balance: async (grantId) => {
          calls.push(["balance", grantId]);
          return { id: "bdg_1", grantId, initialBudget: 1000, remainingBudget: 900, currency: "INR" };
        },
        transactions: async (grantId) => {
          calls.push(["transactions", grantId]);
          return {
            total: 1,
            transactions: [{ id: "txn_1", grantId, amount: 100, description: "P3P debit", balanceAfter: 900 }],
          };
        },
      },
    }),
  });

  const auth = await hosted.createAuthorization({
    userId: "user_123",
    agentId: "ag_123",
    scopes: ["mpp:payment:initiate", "mpp:payment:max_txn_paise:25000"],
    redirectUri: "https://merchant.example/grantex/callback",
    expiresIn: "30d",
  });
  const token = await hosted.exchangeCode({ code: "code_123", agentId: "ag_123" });
  const allocation = await hosted.allocateBudget({ grantId: "grnt_123", initialBudget: 1000, currency: "INR" });
  const debit = await hosted.debitBudget({ grantId: "grnt_123", amount: 100, description: "P3P debit" });
  const balance = await hosted.getBudgetBalance("grnt_123");
  const transactions = await hosted.listBudgetTransactions("grnt_123");

  assert.equal(auth.consentUrl.includes("consent.grantex.dev"), true);
  assert.equal(token.grantId, "grnt_123");
  assert.equal(allocation.remainingBudget, 1000);
  assert.equal(debit.remaining, 900);
  assert.equal(balance.remainingBudget, 900);
  assert.equal(transactions.total, 1);
  assert.deepEqual(calls.map((call) => call[0]), ["authorize", "exchange", "allocate", "debit", "balance", "transactions"]);
});

test("decidePayment checks Grantex grant and budget before creating a challenge", async () => {
  const budgetCalls = [];
  const serverConfig = {
    ...config(globalThis.fetch),
    grantex: {
      requiredScopes: ["mpp:payment:initiate"],
      enforceGrant: true,
      hosted: {
        apiKey: "gx_test",
        sdkFactory: () => ({
          budgets: {
            balance: async (grantId) => {
              budgetCalls.push(["balance", grantId]);
              return { id: "bdg_1", grantId, initialBudget: 10, remainingBudget: 9, currency: "INR" };
            },
            debit: async (body) => {
              budgetCalls.push(["debit", body]);
              return { grantId: body.grantId, remaining: 8, transactionId: "txn_budget" };
            },
          },
        }),
      },
      verifier: {
        async verify() {
          return {
            valid: true,
            grant: {
              tokenId: "tok_grant",
              grantId: "grnt_123",
              principalId: "user_123",
              agentDid: "did:web:agent",
              developerId: "dev_123",
              scopes: ["mpp:payment:initiate", "mpp:payment:max_txn_paise:1000"],
              issuedAt: 1,
              expiresAt: 2,
            },
          };
        },
      },
    },
  };

  const decision = await decidePayment({
    grantexTokenHeader: "grant_token_123",
    config: serverConfig,
    chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm", "Ride booking"),
  });

  assert.equal(decision.action, "challenge");
  assert.equal(decision.status, 402);
  assert.equal(budgetCalls.length, 1);
  assert.deepEqual(budgetCalls[0], ["balance", "grnt_123"]);
});

test("decidePayment rejects over-cap Grantex grants before creating a challenge", async () => {
  const serverConfig = {
    ...config(globalThis.fetch),
    grantex: {
      requiredScopes: ["mpp:payment:initiate"],
      enforceGrant: true,
      hosted: { apiKey: "gx_test" },
      verifier: {
        async verify() {
          return {
            valid: true,
            grant: {
              tokenId: "tok_grant",
              grantId: "grnt_123",
              principalId: "user_123",
              agentDid: "did:web:agent",
              developerId: "dev_123",
              scopes: ["mpp:payment:initiate", "mpp:payment:max_txn_paise:99"],
              issuedAt: 1,
              expiresAt: 2,
            },
          };
        },
      },
    },
  };

  const decision = await decidePayment({
    grantexTokenHeader: "grant_token_123",
    config: serverConfig,
    chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  });

  assert.equal(decision.action, "grant_invalid");
  assert.equal(decision.status, 403);
  assert.match(decision.problemDetails.detail, /exceeds/i);
  assert.equal(decision.headers["WWW-Authenticate"], undefined);
});

test("decidePayment rejects exhausted hosted Grantex budget before creating a challenge", async () => {
  const serverConfig = {
    ...config(globalThis.fetch),
    grantex: {
      requiredScopes: ["mpp:payment:initiate"],
      enforceGrant: true,
      hosted: {
        apiKey: "gx_test",
        sdkFactory: () => ({
          budgets: {
            balance: async (grantId) => {
              return { id: "bdg_1", grantId, initialBudget: 10, remainingBudget: 0.99, currency: "INR" };
            },
          },
        }),
      },
      verifier: {
        async verify() {
          return {
            valid: true,
            grant: {
              tokenId: "tok_grant",
              grantId: "grnt_123",
              principalId: "user_123",
              agentDid: "did:web:agent",
              developerId: "dev_123",
              scopes: ["mpp:payment:initiate"],
              issuedAt: 1,
              expiresAt: 2,
            },
          };
        },
      },
    },
  };

  const decision = await decidePayment({
    grantexTokenHeader: "grant_token_123",
    config: serverConfig,
    chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  });

  assert.equal(decision.action, "grant_invalid");
  assert.equal(decision.status, 403);
  assert.equal(decision.problemDetails.type, "urn:ietf:rfc:9725:error:budget-exceeded");
  assert.equal(decision.headers["WWW-Authenticate"], undefined);
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
      payment_method: PaymentMethod.RESERVE_PAY,
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
  assert.equal(decoded.paymentMethod, PaymentMethod.RESERVE_PAY);
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
