"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = void 0;
const config_1 = require("../config");
const types_1 = require("../types");
const http_1 = require("../utils/http");
const parsers_1 = require("../utils/parsers");
const validation_1 = require("../utils/validation");
const auth_manager_1 = require("./auth-manager");
class ApiClient {
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
    /** Create an P3P mandate/pre-authorization and normalize the service response. */
    async createMandate(options) {
        (0, validation_1.validateCreateMandateOptions)(options);
        const mobileNumber = (0, validation_1.normalizeMobileNumber)(options.mobileNumber ?? "");
        const customerReference = options.customerReference ?? options.customerId ?? mobileNumber;
        const body = {
            payment_method: options.paymentMethod ?? this.config.availablePaymentMethods[0],
            customer: customerPayload(customerReference, mobileNumber),
            amount: amountPayload(options.amount),
            validity_in_days: options.validityInDays ?? 7,
        };
        if (options.description) {
            body.description = options.description;
        }
        const data = await this.request("POST", "/mpp/v1/pre-authorize", body, {
            "Idempotency-Key": options.idempotencyKey ?? randomId(),
        });
        return (0, parsers_1.parseMandate)(data);
    }
    /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
    async getMandate(mandateId) {
        if (!mandateId) {
            throw new Error("mandateId is required");
        }
        const data = await this.request("GET", `/mpp/v1/authorization/${encodeURIComponent(mandateId)}`);
        return (0, parsers_1.parseMandate)(data);
    }
    async request(method, path, body, extraHeaders = {}) {
        const token = await this.auth.getAccessToken();
        const response = await (0, http_1.requestWithRetry)(this.fetchImpl, `${this.baseUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
                ...(body !== undefined && method !== "GET" ? { "Content-Type": "application/json" } : {}),
                ...extraHeaders,
            },
            body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
        }, this.config);
        if (!response.ok) {
            throw types_1.P3PError.fromResponse(response.status, await (0, http_1.safeJson)(response));
        }
        const payload = await response.json();
        const record = (0, parsers_1.asRecord)(payload);
        return record && "data" in record ? record.data : payload;
    }
}
exports.ApiClient = ApiClient;
function randomId() {
    if (typeof globalThis.crypto?.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function stripSlash(value) {
    return value.replace(/\/$/, "");
}
function customerPayload(_customerReference, mobileNumber) {
    return {
        ...(mobileNumber ? { mobile_number: mobileNumber } : {}),
    };
}
function amountPayload(amount) {
    return { value: amount.value, currency: amount.currency };
}
