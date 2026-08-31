"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CaptureClient = void 0;
exports.isPendingDebitStatus = isPendingDebitStatus;
const config_1 = require("../config");
const types_1 = require("../types");
const http_1 = require("../utils/http");
const parsers_1 = require("../utils/parsers");
const validation_1 = require("../utils/validation");
const auth_manager_1 = require("./auth-manager");
class CaptureClient {
    config;
    baseUrl;
    fetchImpl;
    auth;
    constructor(config) {
        this.config = config;
        this.config = (0, config_1.withP3PEnvironmentDefaults)(config);
        this.baseUrl = stripSlash((0, config_1.resolveP3PBaseUrl)(this.config.env));
        this.fetchImpl = this.config.fetch ?? globalThis.fetch?.bind(globalThis);
        if (!this.fetchImpl) {
            throw new Error("A fetch implementation is required.");
        }
        this.auth = new auth_manager_1.AuthManager(this.config, this.baseUrl, this.fetchImpl);
    }
    /** Call `/mpp/v1/debit` with idempotency headers. */
    async capture(options) {
        if (!(0, validation_1.isSupportedPaymentMethod)(options.paymentMethod)) {
            throw new types_1.P3PCaptureError((0, validation_1.unsupportedPaymentMethodError)("CaptureOptions: paymentMethod", options.paymentMethod).message);
        }
        if (!Number.isInteger(options.amount.value) || options.amount.value <= 0) {
            throw new types_1.P3PCaptureError("CaptureOptions: amount.value must be a positive integer (paise)");
        }
        const mobileNumber = resolveMobileNumber(options);
        const paymentMethodReferenceId = resolvePaymentMethodReferenceId(options);
        if (options.paymentMethod === types_1.PaymentMethod.CREDIT_EMI && !paymentMethodReferenceId) {
            throw new types_1.P3PCaptureError("CaptureOptions: paymentMethodReferenceId is required for CREDIT_EMI");
        }
        const token = await this.auth.getAccessToken();
        const idempotencyKey = options.idempotencyKey ?? options.merchantOrderReference ?? randomId();
        const merchantOrderReference = options.merchantOrderReference?.trim() || idempotencyKey;
        const payload = {
            payment_method: options.paymentMethod,
            customer: { mobile_number: mobileNumber },
            merchant_order_reference: merchantOrderReference,
            payment_amount: { value: options.amount.value, currency: options.amount.currency },
            payment_token: options.token,
            challenge_id: resolveChallengeId(options),
            ...(paymentMethodReferenceId
                ? { payment_method_reference_id: paymentMethodReferenceId }
                : {}),
        };
        const maxRetries = this.config.maxRetries ?? 0;
        const initialRetryDelayMs = this.config.initialRetryDelayMs ?? 0;
        // The debit is POSTed exactly once. An in-flight async debit (HTTP 202) must
        // NEVER be re-POSTed with the same idempotency key: Pine rejects the resubmit
        // with 422. Instead we resolve the terminal status by polling the read-only
        // GET /mpp/v1/debit/{id} endpoint. Genuine transient failures (network errors,
        // HTTP 429, and 5xx) on the POST itself are still retried inside
        // requestWithRetry, so `maxRetries` keeps protecting the initial submit.
        const response = await (0, http_1.requestWithRetry)(this.fetchImpl, `${this.baseUrl}/mpp/v1/debit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify(payload),
        }, this.config);
        if (response.status === 202) {
            const data = normalizeCapturePayload(await (0, http_1.safeJson)(response));
            const retryAfter = retryDelayMs(response, initialRetryDelayMs);
            // Poll the read-only debit-status endpoint up to `maxRetries` times rather
            // than re-submitting the debit. With maxRetries === 0 no poll is attempted
            // and the pending result is returned immediately for out-of-band resolution.
            const resolved = await this.pollDebitStatus(idempotencyKey, retryAfter, maxRetries);
            if (resolved) {
                return resolved;
            }
            return {
                ...data,
                pending: true,
                idempotencyKey,
                message: "Debit is still processing.",
                retryAfter,
                payment_gateway: this.config.paymentGateway,
            };
        }
        if (!response.ok) {
            const error = types_1.P3PError.fromResponse(response.status, await (0, http_1.safeJson)(response));
            throw new types_1.P3PCaptureError(`Capture failed: ${error.message}`, error);
        }
        return {
            ...normalizeCapturePayload(await response.json()),
            payment_gateway: this.config.paymentGateway,
        };
    }
    /**
     * Resolve an in-flight async debit by polling `GET /mpp/v1/debit/{id}` up to
     * `maxPolls` times, waiting `delayMs` between polls, until the debit reaches a
     * terminal (non-pending) status. Returns the resolved `CaptureResult`, or
     * `undefined` when it is still pending after the budget is exhausted (or when
     * `maxPolls <= 0`).
     *
     * This never re-POSTs the debit and never throws: a transient status-check
     * failure simply ends polling and lets the caller resolve the pending debit
     * out-of-band (e.g. via a later `getDebitStatus` call), which is strictly safer
     * than resubmitting the debit.
     */
    async pollDebitStatus(idempotencyKey, delayMs, maxPolls) {
        for (let attempt = 0; attempt < maxPolls; attempt += 1) {
            await sleep(delayMs);
            let result;
            try {
                result = await this.getDebitStatus(idempotencyKey);
            }
            catch {
                return undefined;
            }
            if (!isPendingDebitStatus(result.status)) {
                return { ...result, idempotencyKey };
            }
        }
        return undefined;
    }
    /** Fetch the latest debit status through `GET /mpp/v1/debit/{id}`. */
    async getDebitStatus(idempotencyKey) {
        if (!idempotencyKey) {
            throw new Error("idempotencyKey is required");
        }
        const token = await this.auth.getAccessToken();
        const response = await (0, http_1.requestWithRetry)(this.fetchImpl, `${this.baseUrl}/mpp/v1/debit/${encodeURIComponent(idempotencyKey)}`, {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        }, this.config);
        if (!response.ok) {
            throw types_1.P3PError.fromResponse(response.status, await (0, http_1.safeJson)(response));
        }
        return {
            ...normalizeCapturePayload(await response.json()),
            payment_gateway: this.config.paymentGateway,
        };
    }
}
exports.CaptureClient = CaptureClient;
function normalizeCapturePayload(payload) {
    return (0, parsers_1.asRecord)((0, parsers_1.asRecord)(payload)?.data) ?? (0, parsers_1.asRecord)(payload) ?? {};
}
function resolveMobileNumber(options) {
    const mobileNumber = normalizeMobileNumber(options.mobileNumber ?? "");
    if (!mobileNumber) {
        throw new types_1.P3PCaptureError("CaptureOptions: mobileNumber is required for P3P V2 debit");
    }
    return mobileNumber;
}
function resolvePaymentMethodReferenceId(options) {
    return (options.paymentMethodReferenceId ?? options.metadata?.payment_method_reference_id ?? options.metadata?.paymentMethodReferenceId ?? "").trim() || undefined;
}
function resolveChallengeId(options) {
    const challengeId = (options.challengeId ?? "").trim();
    if (!challengeId) {
        throw new types_1.P3PCaptureError("CaptureOptions: challengeId is required for P3P V2 debit");
    }
    return challengeId;
}
function randomId() {
    if (typeof globalThis.crypto?.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function stripSlash(value) {
    return value.replace(/\/$/, "");
}
function normalizeMobileNumber(value) {
    const digits = value.trim().replace(/\D/g, "");
    if (digits.length > 10) {
        throw new types_1.P3PCaptureError(`CaptureOptions: mobileNumber must be at most 10 digits, got ${digits.length}`);
    }
    return digits;
}
function retryDelayMs(response, fallbackMs) {
    return (0, http_1.resolveRetryAfterDelayMs)(response.headers.get("Retry-After")) ?? fallbackMs;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function isPendingDebitStatus(status) {
    return types_1.PENDING_DEBIT_STATUSES.includes(String(status ?? "").trim().toUpperCase());
}
