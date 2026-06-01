"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.P3PVerificationError = exports.P3PCaptureError = exports.P3PError = exports.ChargeOptions = exports.Amount = exports.PaymentMethod = exports.PaymentGateway = exports.PAYMENT_RECEIPT_PREFIX = exports.PAYMENT_HEADER_PREFIX = exports.PAYMENT_CREDENTIAL_HEADER = void 0;
exports.PAYMENT_CREDENTIAL_HEADER = "P3P-Credential";
exports.PAYMENT_HEADER_PREFIX = "Payment ";
exports.PAYMENT_RECEIPT_PREFIX = "Payment ";
/** Payment gateway used by seller challenges and buyer credentials. */
var PaymentGateway;
(function (PaymentGateway) {
    PaymentGateway["PineLabsOnline"] = "PINE LABS ONLINE";
})(PaymentGateway || (exports.PaymentGateway = PaymentGateway = {}));
/** Payment methods supported by the current P3P service payload contract. */
var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["UpiSbmd"] = "SBMD";
    PaymentMethod["Crypto"] = "CRYPTO";
})(PaymentMethod || (exports.PaymentMethod = PaymentMethod = {}));
/** Money amount expressed in the smallest unit for the currency, e.g. paise for INR. */
class Amount {
    value;
    currency;
    constructor(
    /** Amount in the smallest unit for the currency, e.g. paise for INR. */
    value, 
    /** ISO-style currency code expected by P3P, e.g. `INR` or `PATHUSD`. */
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
    /** Amount the seller requires before allowing the protected resource request. */
    amount, 
    /** Protected resource identifier embedded in the 402 challenge. */
    resource, 
    /** Optional description propagated to capture/debit metadata where supported. */
    description, 
    /** Optional stable seller order reference retained for compatibility; current debit sends it as the idempotency key when no explicit key is provided. */
    merchantOrderReference, 
    /** Optional metadata used by adapters and capture helpers. */
    metadata, 
    /** Optional per-challenge expiry override in seconds. */
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
/** Error type raised for non-2xx P3P service responses. */
class P3PError extends Error {
    code;
    httpStatus;
    details;
    constructor(code, message, httpStatus, details) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
        this.details = details;
        this.name = "P3PError";
    }
    static fromResponse(status, body) {
        const record = asRecord(body) ?? {};
        if (typeof record.error === "string") {
            return new P3PError(String(record.code ?? "MPP_ERROR"), record.error, status, asRecord(record.additional_error_details));
        }
        const error = asRecord(record.error) ?? record;
        return new P3PError(String(error.code ?? "MPP_INTERNAL_ERROR"), String(error.message ?? `HTTP ${status}`), status, asRecord(error.additional_error_details));
    }
}
exports.P3PError = P3PError;
/** Error wrapper used when seller debit/capture fails. */
class P3PCaptureError extends Error {
    captureError;
    constructor(message, captureError) {
        super(message);
        this.captureError = captureError;
        this.name = "P3PCaptureError";
    }
}
exports.P3PCaptureError = P3PCaptureError;
/** Error type reserved for local Payment credential verification failures. */
class P3PVerificationError extends Error {
    constructor(message) {
        super(message);
        this.name = "P3PVerificationError";
    }
}
exports.P3PVerificationError = P3PVerificationError;
function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
