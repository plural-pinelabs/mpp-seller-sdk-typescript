import assert from "node:assert/strict";
import test from "node:test";

import { P3PEnvironment, PaymentGateway, PaymentMethod } from "../dist/index.js";
import { AuthManager } from "../dist/server/auth-manager.js";

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function config() {
  return {
    clientId: "server-client",
    clientSecret: "server-secret",
    realm: "Pine Labs Online P3P",
    env: P3PEnvironment.SANDBOX,
    paymentGateway: PaymentGateway.PineLabsOnline,
    availablePaymentMethods: [PaymentMethod.RESERVE_PAY, PaymentMethod.OTM],
    maxRetries: 0,
  };
}

test("server auth manager dedupes concurrent refreshes", async () => {
  const gate = deferred();
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    calls.push({ input: String(input), init });
    await gate.promise;
    return response(200, {
      data: {
        access_token: "server-access-token",
        expires_in: 300,
      },
    });
  };

  const auth = new AuthManager(config(), P3PEnvironment.SANDBOX, fetchImpl);
  const first = auth.getAccessToken();
  const second = auth.getAccessToken();

  await Promise.resolve();
  assert.equal(calls.length, 1);

  gate.resolve();
  const [tokenA, tokenB] = await Promise.all([first, second]);
  assert.equal(tokenA, "server-access-token");
  assert.equal(tokenB, "server-access-token");
  assert.equal(calls.length, 1);
});

test("server auth manager clears failed refresh and allows retry", async () => {
  let attempt = 0;
  const fetchImpl = async () => {
    attempt += 1;
    if (attempt === 1) {
      return response(500, {
        error: { code: "MPP_AUTHENTICATION_FAILED", message: "boom" },
      });
    }
    return response(200, {
      data: {
        access_token: "server-access-token",
        expires_in: 300,
      },
    });
  };

  const auth = new AuthManager(config(), P3PEnvironment.SANDBOX, fetchImpl);
  await assert.rejects(auth.getAccessToken(), /boom/);
  const token = await auth.getAccessToken();
  assert.equal(token, "server-access-token");
  assert.equal(attempt, 2);
});
