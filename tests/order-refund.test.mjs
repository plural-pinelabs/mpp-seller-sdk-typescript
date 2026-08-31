import assert from "node:assert/strict";
import test from "node:test";

import {
  Amount,
  P3PEnvironment,
  PaymentGateway,
  PaymentMethod,
  PineLabsOnlineP3P,
} from "../dist/index.js";

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("getOrder and createRefund use the pay API and return typed responses", async () => {
  const parentOrderId = "v1-260830170021-aa-2YQKQC";
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const path = new URL(String(input)).pathname;
    calls.push({ path, init });
    if (path === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "access", expires_in: 3600 } });
    }
    if (path === `/api/pay/v1/orders/${parentOrderId}`) {
      assert.equal(init.method, "GET");
      assert.equal(init.headers.Authorization, "Bearer access");
      return response(200, { data: {
        order_id: parentOrderId,
        merchant_order_reference: "merchant-order-1",
        type: "CHARGE",
        status: "PROCESSED",
        merchant_id: "111643",
        order_amount: { value: 14897000, currency: "INR" },
        pre_auth: true,
        purchase_details: {
          customer: {
            mobile_number: "9390012811",
            billing_address: { city: "MUMBAI", country: "INDIA" },
          },
          merchant_metadata: { source: "merchant" },
        },
        payments: [{
          id: "payment-1",
          status: "PROCESSED",
          payment_amount: { value: 14897000, currency: "INR" },
          payment_method: "CARD",
          payment_option: { card_data: { network_name: "VISA" } },
          acquirer_data: { rrn: "420123000239" },
        }],
        future_field: "retained",
      } });
    }
    if (path === `/api/pay/v1/refunds/${parentOrderId}`) {
      assert.equal(init.method, "POST");
      assert.ok(init.headers["Request-ID"]);
      assert.ok(!Number.isNaN(Date.parse(init.headers["Request-Timestamp"])));
      assert.deepEqual(JSON.parse(init.body), {
        merchant_order_reference: "refund-reference-123",
        order_amount: { value: 1100, currency: "INR" },
        merchant_metadata: { reason: "customer_request" },
      });
      return response(200, { data: {
        order_id: "refund-order-1",
        parent_order_id: parentOrderId,
        merchant_order_reference: "refund-reference-123",
        type: "REFUND",
        status: "PROCESSED",
        merchant_id: "111643",
        order_amount: { value: 1100, currency: "INR" },
        payments: [{
          id: "refund-payment-1",
          status: "PROCESSED",
          payment_amount: { value: 1100, currency: "INR" },
          payment_method: "CARD",
          acquirer_data: { acquirer_reference: "7285447904236780703954", is_aggregator: true },
        }],
      } });
    }
    return response(404, { code: "NOT_FOUND", message: path });
  };

  const sdk = PineLabsOnlineP3P.create({
    clientId: "client-id",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    paymentGateway: PaymentGateway.PineLabsOnline,
    availablePaymentMethods: [PaymentMethod.CARD],
    fetch: fetchImpl,
    maxRetries: 0,
  });

  const order = await sdk.getOrder(`  ${parentOrderId}  `);
  const refund = await sdk.createRefund(`  ${parentOrderId}  `, {
    merchantOrderReference: " refund-reference-123 ",
    orderAmount: new Amount(1100, " INR "),
    merchantMetadata: { reason: "customer_request" },
  });

  assert.equal(order.order_id, parentOrderId);
  assert.equal(order.order_amount.value, 14897000);
  assert.equal(order.purchase_details.customer.billing_address.city, "MUMBAI");
  assert.equal(order.payments[0].payment_option.card_data.network_name, "VISA");
  assert.equal(order.raw.future_field, "retained");
  assert.equal(refund.parent_order_id, parentOrderId);
  assert.equal(refund.order_id, "refund-order-1");
  assert.equal(refund.payments[0].acquirer_data.is_aggregator, true);
  assert.deepEqual(calls.map(({ path }) => path), [
    "/api/auth/v1/token",
    `/api/pay/v1/orders/${parentOrderId}`,
    `/api/pay/v1/refunds/${parentOrderId}`,
  ]);
});

test("getOrder and createRefund validate merchant input before network access", async () => {
  const sdk = PineLabsOnlineP3P.create({
    clientId: "client-id",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    paymentGateway: PaymentGateway.PineLabsOnline,
    availablePaymentMethods: [PaymentMethod.CARD],
    fetch: async () => { throw new Error("network must not be called"); },
  });

  await assert.rejects(() => sdk.getOrder("   "), /orderId is required/);
  await assert.rejects(
    () => sdk.createRefund("order-1", { merchantOrderReference: "", orderAmount: new Amount(100, "INR") }),
    /merchantOrderReference is required/,
  );
  await assert.rejects(
    () => sdk.createRefund("order-1", { merchantOrderReference: "refund-1", orderAmount: new Amount(0, "INR") }),
    /positive integer/,
  );
});
