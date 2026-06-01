import { CaptureResult, ReceiptContext, ReceiptData } from "../types";
/** Build structured receipt data from a successful capture result. */
export declare function buildReceiptData(captureResult: CaptureResult, challengeId: string, context?: ReceiptContext): ReceiptData;
/** Encode capture receipt data as `Payment <base64url>`. */
export declare function buildReceiptHeader(captureResult: CaptureResult, challengeId: string, context?: ReceiptContext): string;
/** Build a failure receipt object for adapters that need explicit failure data. */
export declare function buildFailureReceiptData(challengeId: string, context?: ReceiptContext): ReceiptData;
