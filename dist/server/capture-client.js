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
        this.baseUrl = stripSlash(config.baseUrl ?? config_1.DEFAULT_BASE_URL);
        this.fetchImpl = config.fetch ?? globalThis.fetch?.bind(globalThis);
        if (!this.fetchImpl) {
            throw new Error("A fetch implementation is required.");
        }
        this.auth = new auth_manager_1.AuthManager(config, this.baseUrl, this.fetchImpl);
    }
    /** Call `/mpp/v1/debit` with idempotency and request-hash headers. */
    async capture(options) {
        const customerReference = resolveCustomerReference(options);
        const token = await this.auth.getAccessToken();
        const merchantOrderReference = options.merchantOrderReference ?? `mpr-${randomId().slice(0, 12)}`;
        const payload = {
            type: options.paymentType ?? "SBMD",
            customer_reference: customerReference,
            merchant_order_reference: merchantOrderReference,
            amount: String(options.amount.value),
            currency: options.amount.currency,
            payment_token: options.token,
        };
        const response = await (0, http_1.requestWithRetry)(this.fetchImpl, `${this.baseUrl}/mpp/v1/debit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "Idempotency-Key": options.idempotencyKey ?? randomId(),
                "Request-Hash": (0, request_hash_1.buildRequestHash)(payload),
            },
            body: JSON.stringify(payload),
        }, this.config);
        if (!response.ok) {
            const error = types_1.MppError.fromResponse(response.status, await (0, http_1.safeJson)(response));
            throw new types_1.MppCaptureError(`Capture failed: ${error.message}`, error);
        }
        const responsePayload = await response.json();
        const data = (0, parsers_1.asRecord)((0, parsers_1.asRecord)(responsePayload)?.data) ?? (0, parsers_1.asRecord)(responsePayload) ?? {};
        return (0, parsers_1.dictToCaptureResult)(data);
    }
}
exports.CaptureClient = CaptureClient;
function resolveCustomerReference(options) {
    const customerReference = (options.customerReference ?? options.metadata?.customer_reference ?? options.metadata?.customerReference ?? "").trim();
    if (!customerReference) {
        throw new types_1.MppCaptureError("CaptureOptions: customerReference is required for MPP V2 debit");
    }
    return customerReference;
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
