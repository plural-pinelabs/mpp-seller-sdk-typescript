"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CaptureClient = void 0;
const config_1 = require("../config");
const types_1 = require("../types");
const http_1 = require("../utils/http");
const parsers_1 = require("../utils/parsers");
const request_hash_1 = require("../utils/request-hash");
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
    /** Call `/mpp/v1/debit` with idempotency and request-hash headers. */
    async capture(options) {
        resolveCustomerReference(options);
        const mobileNumber = resolveMobileNumber(options);
        const token = await this.auth.getAccessToken();
        const idempotencyKey = options.idempotencyKey ?? options.merchantOrderReference ?? randomId();
        const payload = {
            type: options.paymentMethod,
            customer: { mobile_number: mobileNumber },
            payment_amount: { value: options.amount.value, currency: options.amount.currency },
            payment_token: options.token,
            challenge_id: resolveChallengeId(options),
        };
        const response = await (0, http_1.requestWithRetry)(this.fetchImpl, `${this.baseUrl}/mpp/v1/debit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "Idempotency-Key": idempotencyKey,
                "Request-Hash": (0, request_hash_1.buildRequestHash)(payload),
            },
            body: JSON.stringify(payload),
        }, this.config);
        if (!response.ok) {
            const error = types_1.P3PError.fromResponse(response.status, await (0, http_1.safeJson)(response));
            throw new types_1.P3PCaptureError(`Capture failed: ${error.message}`, error);
        }
        const responsePayload = await response.json();
        const data = (0, parsers_1.asRecord)((0, parsers_1.asRecord)(responsePayload)?.data) ?? (0, parsers_1.asRecord)(responsePayload) ?? {};
        const captureResult = (0, parsers_1.dictToCaptureResult)(data);
        captureResult.payment_gateway = this.config.paymentGateway;
        captureResult.payment_method = options.paymentMethod;
        return captureResult;
    }
}
exports.CaptureClient = CaptureClient;
function resolveCustomerReference(options) {
    const customerReference = (options.customerReference ?? options.metadata?.customer_reference ?? options.metadata?.customerReference ?? "").trim();
    if (!customerReference) {
        throw new types_1.P3PCaptureError("CaptureOptions: customerReference is required for P3P V2 debit");
    }
    return customerReference;
}
function resolveMobileNumber(options) {
    const mobileNumber = normalizeMobileNumber(options.mobileNumber ?? options.metadata?.mobile_number ?? options.metadata?.mobileNumber ?? "");
    if (!mobileNumber) {
        throw new types_1.P3PCaptureError("CaptureOptions: mobileNumber is required for P3P V2 debit");
    }
    return mobileNumber;
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
    return digits.length >= 10 ? digits.slice(-10) : digits;
}
