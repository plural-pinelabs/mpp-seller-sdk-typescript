import assert from "node:assert/strict";
import test from "node:test";

test("seller package exposes modular entry points", async () => {
  const root = await import("../dist/index.js");
  const server = await import("../dist/server/index.js");
  const middleware = await import("../dist/server/middleware/index.js");
  const types = await import("../dist/types/index.js");
  const utils = await import("../dist/utils/index.js");
  const config = await import("../dist/config/index.js");

  assert.equal(typeof root.PluralP3P.create, "function");
  assert.equal(server.PluralP3P, root.PluralP3P);
  assert.equal(root.PluralMPP, undefined);
  assert.equal(middleware.decidePayment, root.decidePayment);
  assert.equal(typeof utils.buildReceiptHeader, "function");
  assert.equal(config.P3PEnvironment.PRODUCTION, "https://api.pluralpay.in");
  assert.equal(config.P3PEnvironmentDefaults[config.P3PEnvironment.SANDBOX].maxRetries, 2);
  assert.equal(config.P3PEnvironmentDefaults[config.P3PEnvironment.PRODUCTION].requestTimeoutMs, 10_000);
  assert.equal(root.P3PEnvironment, config.P3PEnvironment);
  assert.equal(config.MppEnvironment, undefined);
  assert.equal(types.PAYMENT_HEADER_PREFIX, "Payment ");
  assert.equal(types.PAYMENT_CREDENTIAL_HEADER, "P3P-Credential");
  assert.equal(root.PaymentGateway.PineLabsOnline, "PINE LABS ONLINE");
  assert.equal(root.PaymentMethod.UpiSbmd, "SBMD");
  assert.equal(root.PaymentMethod.Crypto, "CRYPTO");
});
