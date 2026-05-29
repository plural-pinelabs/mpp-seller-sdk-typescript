import { CaptureResult, PAYMENT_RECEIPT_PREFIX, ReceiptContext, ReceiptData } from "../types";
import { encodeJson } from "./base64url";

/** Build structured receipt data from a successful capture result. */
export function buildReceiptData(
  captureResult: CaptureResult,
  challengeId: string,
  context: ReceiptContext = {},
): ReceiptData {
  const receipt: ReceiptData = {
    status: "success",
    timestamp: captureResult.settled_at || new Date().toISOString(),
    reference: captureResult.capture_id,
    challengeId,
    orderId: captureResult.order_id || null,
    merchantOrderReference: captureResult.merchant_order_reference || null,
    settlement: {
      amount: (captureResult.amount.value / 100).toFixed(2),
      currency: captureResult.amount.currency,
    },
  };
  const paymentGateway = context.paymentGateway ?? captureResult.payment_gateway;
  const paymentMethod = context.paymentMethod ?? captureResult.payment_method;
  if (paymentGateway) {
    receipt.paymentGateway = paymentGateway;
  }
  if (paymentMethod) {
    receipt.paymentMethod = paymentMethod;
  }
  return receipt;
}

/** Encode capture receipt data as `Payment <base64url>`. */
export function buildReceiptHeader(
  captureResult: CaptureResult,
  challengeId: string,
  context: ReceiptContext = {},
): string {
  return `${PAYMENT_RECEIPT_PREFIX}${encodeJson(buildReceiptData(captureResult, challengeId, context))}`;
}

/** Build a failure receipt object for adapters that need explicit failure data. */
export function buildFailureReceiptData(challengeId: string, context: ReceiptContext = {}): ReceiptData {
  const receipt: ReceiptData = {
    status: "failure",
    timestamp: new Date().toISOString(),
    reference: "",
    challengeId,
    settlement: { amount: "0.00", currency: "INR" },
  };
  if (context.paymentGateway) {
    receipt.paymentGateway = context.paymentGateway;
  }
  if (context.paymentMethod) {
    receipt.paymentMethod = context.paymentMethod;
  }
  return receipt;
}
