"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReceiptData = buildReceiptData;
exports.buildReceiptHeader = buildReceiptHeader;
exports.buildFailureReceiptData = buildFailureReceiptData;
const types_1 = require("../types");
const base64url_1 = require("./base64url");
/** Build structured receipt data from a successful capture result. */
function buildReceiptData(captureResult, challengeId) {
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
function buildReceiptHeader(captureResult, challengeId) {
    return `${types_1.PAYMENT_RECEIPT_PREFIX}${(0, base64url_1.encodeJson)(buildReceiptData(captureResult, challengeId))}`;
}
/** Build a failure receipt object for adapters that need explicit failure data. */
function buildFailureReceiptData(challengeId) {
    return {
        status: "failure",
        method: "plural",
        timestamp: new Date().toISOString(),
        reference: "",
        challengeId,
        settlement: { amount: "0.00", currency: "INR" },
    };
}
