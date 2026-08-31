"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReceiptData = buildReceiptData;
exports.buildReceiptHeader = buildReceiptHeader;
exports.buildFailureReceiptData = buildFailureReceiptData;
const types_1 = require("../types");
const base64url_1 = require("./base64url");
/** Build structured receipt data from a successful capture result. */
function buildReceiptData(captureResult, challengeId, context = {}) {
    const amount = asAmount(captureResult.amount);
    const receipt = {
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
function buildReceiptHeader(captureResult, challengeId, context = {}) {
    return `${types_1.PAYMENT_RECEIPT_PREFIX}${(0, base64url_1.encodeJson)(buildReceiptData(captureResult, challengeId, context))}`;
}
/** Build a failure receipt object for adapters that need explicit failure data. */
function buildFailureReceiptData(challengeId, context = {}) {
    const receipt = {
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
function asAmount(value) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const record = value;
        const amountValue = Number(record.value);
        const currency = record.currency;
        if (Number.isFinite(amountValue) && typeof currency === "string") {
            return { value: amountValue, currency };
        }
    }
    return undefined;
}
