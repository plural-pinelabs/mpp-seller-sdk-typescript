import assert from "node:assert/strict";
import test from "node:test";

test("seller package exposes modular entry points", async () => {
  const root = await import("../dist/index.js");
  const server = await import("../dist/server/index.js");
  const middleware = await import("../dist/server/middleware/index.js");
  const types = await import("../dist/types/index.js");
  const utils = await import("../dist/utils/index.js");
  const config = await import("../dist/config/index.js");

  assert.equal(typeof root.PluralMPP.create, "function");
  assert.equal(server.PluralMPP, root.PluralMPP);
  assert.equal(middleware.decidePayment, root.decidePayment);
  assert.equal(server.GrantTokenVerifier, root.GrantTokenVerifier);
  assert.equal(typeof utils.buildReceiptHeader, "function");
  assert.equal(config.MppEnvironment.PRODUCTION, "https://api.pluralpay.in");
  assert.equal(types.PAYMENT_HEADER_PREFIX, "Payment ");
});
