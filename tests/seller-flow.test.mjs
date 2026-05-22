import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  Amount,
  ChargeOptions,
  PluralMPP,
  buildReceiptHeader,
  decidePayment,
} from "../dist/index.js";

function response(status, body, headers = {}) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function config(fetchImpl) {
  return {
    clientId: "seller-client",
    clientSecret: "seller-secret",
    challengeSecretKey: "shared-hmac-secret",
    realm: "Plural MPP",
    baseUrl: "https://api.test",
    fetch: fetchImpl,
  };
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function requestHash(value) {
  const body = JSON.stringify(value, Object.keys(value).sort());
  return createHash("sha256").update(body).digest("hex");
}

test("generates and verifies signed payment credentials", async () => {
  const mpp = PluralMPP.create(config(globalThis.fetch));
  const challenge = await mpp.generateChallenge(
    new ChargeOptions(new Amount(15000, "INR"), "/api/premium"),
  );

  const credentialHeader = `Payment ${Buffer.from(
    JSON.stringify({
      challenge: challenge.challenge,
      source: "buyer-client",
      payload: { type: "token", token: "MPP_TOK_123", customer_reference: "cust-ref-123" },
    }),
  ).toString("base64url")}`;

  const verification = await mpp.verifyCredential(credentialHeader);
  assert.equal(verification.valid, true);
  assert.equal(verification.credential.payload.customer_reference, "cust-ref-123");
});

test("decidePayment returns a 402 challenge when no credential is present", async () => {
  const decision = await decidePayment({
    authorizationHeader: undefined,
    config: config(globalThis.fetch),
    chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  });

  assert.equal(decision.action, "challenge");
  assert.equal(decision.status, 402);
  assert.equal(decision.headers["WWW-Authenticate"].startsWith("Payment "), true);
});

test("decidePayment captures payment through central auth and MPP debit", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "seller-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/debit") {
      assert.equal(init.headers.Authorization, "Bearer seller-access-token");
      assert.equal("Merchant-ID" in init.headers, false);
      const body = JSON.parse(init.body);
      assert.equal(body.customer_reference, "cust-ref-123");
      assert.equal(body.payment_token, "MPP_TOK_123");
      assert.equal(init.headers["Request-Hash"], requestHash(body));
      return response(200, {
        data: {
          type: "SBMD",
          authorization_id: "mnd_test",
          payment_id: "pay_123",
          merchant_order_reference: body.merchant_order_reference,
          amount: "100",
          currency: "INR",
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

  const mpp = PluralMPP.create(config(fetchImpl));
  const generated = await mpp.generateChallenge(
    new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  );
  const credentialHeader = `Payment ${Buffer.from(
    JSON.stringify({
      challenge: generated.challenge,
      source: "buyer-client",
      payload: { type: "token", token: "MPP_TOK_123", customer_reference: "cust-ref-123" },
    }),
  ).toString("base64url")}`;

  const decision = await decidePayment({
    authorizationHeader: credentialHeader,
    config: config(fetchImpl),
    chargeOptions: new ChargeOptions(new Amount(100, "INR"), "/rides/confirm"),
  });

  assert.equal(decision.action, "proceed");
  assert.equal(decision.headers["Payment-Receipt"].startsWith("Payment "), true);
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/auth/v1/token", "/mpp/v1/debit"],
  );
});

test("buildReceiptHeader encodes settlement data", () => {
  const header = buildReceiptHeader(
    {
      capture_id: "cap_1",
      object: "debit",
      mandate_id: "mnd_1",
      token_id: "MPP_TOK_1",
      customer_id: "cust_1",
      merchant_id: "",
      order_id: "ord_1",
      order_status: "CONFIRMED",
      payment_id: "pay_1",
      payment_status: "CONFIRMED",
      amount: new Amount(500, "INR"),
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
});
