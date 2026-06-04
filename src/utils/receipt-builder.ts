import { CaptureResult, PAYMENT_RECEIPT_PREFIX, ReceiptContext, ReceiptData } from "../types";
import { encodeJson } from "./base64url";

/** Build structured receipt data from a successful capture result. */
export function buildReceiptData(
  captureResult: CaptureResult,
  challengeId: string,
  context: ReceiptContext = {},
): ReceiptData {
  const amount = asAmount(captureResult.amount);
  const receipt: ReceiptData = {
    status: "success",
    timestamp: String(captureResult.settled_at || "") || new Date().toISOString(),
    reference: String(captureResult.capture_id ?? captureResult.merchant_payment_debit_reference ?? ""),
    challengeId,
    orderId: String(captureResult.order_id ?? "") || null,
    merchantOrderReference: String(captureResult.merchant_order_reference ?? captureResult.merchant_payment_debit_reference ?? "") || null,
    settlement: amount ? {
      amount: (amount.value / 100).toFixed(2),
      currency: amount.currency,
    } : undefined,
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

function asAmount(value: unknown): { value: number; currency: string } | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const amountValue = Number(record.value);
    const currency = record.currency;
    if (Number.isFinite(amountValue) && typeof currency === "string") {
      return { value: amountValue, currency };
    }
  }
  return undefined;
}
