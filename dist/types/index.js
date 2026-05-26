"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MppVerificationError = exports.MppCaptureError = exports.MppError = exports.ChargeOptions = exports.Amount = exports.GRANTEX_TOKEN_HEADER = exports.PAYMENT_RECEIPT_PREFIX = exports.PAYMENT_HEADER_PREFIX = void 0;
/** Prefix used for MPP Payment credentials in HTTP auth headers. */
exports.PAYMENT_HEADER_PREFIX = "Payment ";
/** Prefix used for encoded seller payment receipts. */
exports.PAYMENT_RECEIPT_PREFIX = "Payment ";
/** Header name used to pass an optional Grantex grant token to sellers. */
exports.GRANTEX_TOKEN_HEADER = "X-Grantex-Token";
/** Money amount expressed in the smallest unit for the currency, e.g. paise for INR. */
class Amount {
    value;
    currency;
    constructor(
    /** Integer amount in the smallest unit for the currency. */
    value, 
    /** ISO 4217 currency code, for example `INR`. */
    currency) {
        this.value = value;
        this.currency = currency;
    }
}
exports.Amount = Amount;
/** Payment challenge/capture context for a seller-protected resource. */
class ChargeOptions {
    amount;
    resource;
    description;
    merchantOrderReference;
    metadata;
    challengeExpirySeconds;
    constructor(
    /** Capture amount requested for the resource. */
    amount, 
    /** Protected resource identifier or route path. */
    resource, 
    /** Human-readable charge description. */
    description, 
    /** Seller order reference used for reconciliation. */
    merchantOrderReference, 
    /** Additional metadata for challenge/capture context. */
    metadata, 
    /** Per-charge challenge expiry override in seconds. */
    challengeExpirySeconds) {
        this.amount = amount;
        this.resource = resource;
        this.description = description;
        this.merchantOrderReference = merchantOrderReference;
        this.metadata = metadata;
        this.challengeExpirySeconds = challengeExpirySeconds;
    }
}
exports.ChargeOptions = ChargeOptions;
/** Error type raised for non-2xx MPP service responses. */
class MppError extends Error {
    code;
    httpStatus;
    details;
    constructor(code, message, httpStatus, details) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
        this.details = details;
        this.name = "MppError";
    }
    static fromResponse(status, body) {
        const record = asRecord(body) ?? {};
        const error = asRecord(record.error) ?? record;
        return new MppError(String(error.code ?? "MPP_INTERNAL_ERROR"), String(error.message ?? `HTTP ${status}`), status, asRecord(error.additional_error_details));
    }
}
exports.MppError = MppError;
/** Error wrapper used when seller debit/capture fails. */
class MppCaptureError extends Error {
    captureError;
    constructor(message, captureError) {
        super(message);
        this.captureError = captureError;
        this.name = "MppCaptureError";
    }
}
exports.MppCaptureError = MppCaptureError;
/** Error type reserved for local Payment credential verification failures. */
class MppVerificationError extends Error {
    constructor(message) {
        super(message);
        this.name = "MppVerificationError";
    }
}
exports.MppVerificationError = MppVerificationError;
function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
