import { CaptureResult, PAYMENT_RECEIPT_PREFIX, ReceiptData } from "../types";
import { encodeJson } from "./base64url";

/** Build structured receipt data from a successful capture result. */
export function buildReceiptData(captureResult: CaptureResult, challengeId: string): ReceiptData {
  return {
    status: "success",
    method: "plural",
    timestamp: captureResult.settled_at || new Date().toISOString(),
    reference: captureResult.capture_id,
    challengeId,
    settlement: {
      amount: (captureResult.amount.value / 100).toFixed(2),
      currency: captureResult.amount.currency,
    },
  };
}

/** Encode capture receipt data as `Payment <base64url>`. */
export function buildReceiptHeader(captureResult: CaptureResult, challengeId: string): string {
  return `${PAYMENT_RECEIPT_PREFIX}${encodeJson(buildReceiptData(captureResult, challengeId))}`;
}

/** Build a failure receipt object for adapters that need explicit failure data. */
export function buildFailureReceiptData(challengeId: string): ReceiptData {
  return {
    status: "failure",
    method: "plural",
    timestamp: new Date().toISOString(),
    reference: "",
    challengeId,
    settlement: { amount: "0.00", currency: "INR" },
  };
}
