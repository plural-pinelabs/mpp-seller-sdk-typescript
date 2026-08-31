"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = void 0;
const config_1 = require("../config");
const types_1 = require("../types");
const http_1 = require("../utils/http");
const parsers_1 = require("../utils/parsers");
const order_parsers_1 = require("../utils/order-parsers");
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
        const data = await this.createPreAuthorizationRequest(options);
        return (0, parsers_1.parseMandate)(data);
    }
    /** Create a card/mandate pre-authorization and return the service contract shape. */
    async createPreAuthorization(options) {
        const data = await this.createPreAuthorizationRequest(options);
        return (0, parsers_1.parsePreAuthorization)(data);
    }
    async createPreAuthorizationRequest(options) {
        (0, validation_1.validateCreateMandateOptions)(options);
        const mobileNumber = (0, validation_1.normalizeMobileNumber)(options.mobileNumber ?? "");
        const paymentMethod = options.paymentMethod ?? this.config.availablePaymentMethods[0];
        const body = {
            payment_method: paymentMethod,
            customer: customerPayload(mobileNumber),
            amount: amountPayload(options.amount),
        };
        if (options.validityInDays !== undefined) {
            body.validity_in_days = options.validityInDays;
        }
        if (options.description) {
            body.description = options.description;
        }
        const paymentMethodOptions = options.paymentMethodOptions ?? options.payment_method_options;
        if (paymentMethodOptions !== undefined) {
            body.payment_method_options = paymentMethodOptions;
        }
        const merchantMetadata = options.merchantMetadata ?? options.merchant_metadata;
        if (merchantMetadata !== undefined) {
            body.merchant_metadata = merchantMetadataPayload(merchantMetadata);
        }
        const data = await this.request("POST", "/mpp/v1/pre-authorize", body, {
            "Idempotency-Key": options.idempotencyKey ?? randomId(),
        });
        return isRedirectPaymentMethod(paymentMethod) ? withCheckoutRedirectUrl(data, this.baseUrl) : data;
    }
    /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
    async getMandate(mandateId) {
        if (!mandateId) {
            throw new Error("mandateId is required");
        }
        const data = await this.request("GET", `/mpp/v1/authorization/${encodeURIComponent(mandateId)}`);
        return (0, parsers_1.parseMandate)(data);
    }
    /** Retrieve an order through `GET /api/pay/v1/orders/{order_id}`. */
    async getOrder(orderId) {
        const normalizedOrderId = orderId.trim();
        if (!normalizedOrderId) {
            throw new Error("orderId is required");
        }
        const data = await this.request("GET", `/api/pay/v1/orders/${encodeURIComponent(normalizedOrderId)}`);
        return (0, order_parsers_1.parseOrder)(data);
    }
    /** Initiate a refund through `POST /api/pay/v1/refunds/{order_id}`. */
    async createRefund(orderId, options) {
        const normalizedOrderId = orderId.trim();
        const merchantOrderReference = options.merchantOrderReference.trim();
        const currency = options.orderAmount.currency.trim();
        if (!normalizedOrderId)
            throw new Error("orderId is required");
        if (!merchantOrderReference)
            throw new Error("CreateRefundOptions: merchantOrderReference is required");
        if (!Number.isInteger(options.orderAmount.value) || options.orderAmount.value <= 0) {
            throw new Error("CreateRefundOptions: orderAmount.value must be a positive integer (paise)");
        }
        if (!currency)
            throw new Error("CreateRefundOptions: orderAmount.currency is required");
        const data = await this.request("POST", `/api/pay/v1/refunds/${encodeURIComponent(normalizedOrderId)}`, {
            merchant_order_reference: merchantOrderReference,
            order_amount: { value: options.orderAmount.value, currency },
            ...(options.merchantMetadata ? { merchant_metadata: options.merchantMetadata } : {}),
        }, {
            "Request-ID": randomId(),
            "Request-Timestamp": new Date().toISOString(),
        });
        return (0, order_parsers_1.parseRefund)(data);
    }
    /** Fetch mandate balance/authorization status through `GET /mpp/v1/balance`. */
    async getMandateBalance(options) {
        (0, validation_1.validateMandateBalanceLookupOptions)(options);
        const params = new URLSearchParams();
        if ("authorizationId" in options && options.authorizationId) {
            params.set("authorization_id", options.authorizationId);
            if (options.phoneNumber) {
                params.set("phone_number", (0, validation_1.normalizeMobileNumber)(options.phoneNumber));
            }
        }
        else {
            const phoneNumber = (0, validation_1.normalizeMobileNumber)(options.phoneNumber ?? "");
            const paymentMethod = options.paymentMethod;
            params.set("phone_number", phoneNumber);
            params.set("type", String(paymentMethod));
        }
        const data = await this.request("GET", `/mpp/v1/balance?${params.toString()}`);
        return (0, parsers_1.parseMandateBalanceResult)(data);
    }
    /** Create a mandate revoke request through `POST /mpp/v1/revoke`. */
    async revokeMandate(options) {
        (0, validation_1.validateCreateMandateRevokeOptions)(options);
        const body = {
            payment_method: options.paymentMethod,
        };
        if (options.paymentMethodReferenceId) {
            body.payment_method_reference_id = options.paymentMethodReferenceId;
        }
        if (options.customer?.merchantCustomerReference || options.customer?.mobileNumber) {
            body.customer = {
                ...(options.customer.merchantCustomerReference
                    ? { merchant_customer_reference: options.customer.merchantCustomerReference }
                    : {}),
                ...(options.customer.mobileNumber
                    ? { mobile_number: (0, validation_1.normalizeMobileNumber)(options.customer.mobileNumber) }
                    : {}),
            };
        }
        const data = await this.request("POST", "/mpp/v1/revoke", body);
        return (0, parsers_1.parseMandateRevokeResult)(data);
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
function customerPayload(mobileNumber) {
    return {
        mobile_number: mobileNumber,
    };
}
function amountPayload(amount) {
    return { value: amount.value, currency: amount.currency };
}
function isRedirectPaymentMethod(value) {
    const normalized = String(value ?? "").toUpperCase();
    return normalized === "CARD" || normalized === "CREDIT_EMI";
}
function merchantMetadataPayload(metadata) {
    return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [
        key,
        typeof value === "string" ? value : (JSON.stringify(value) ?? "null"),
    ]));
}
function withCheckoutRedirectUrl(data, baseUrl) {
    const record = (0, parsers_1.asRecord)(data);
    if (!record || record.redirect_url || record.redirectUrl)
        return data;
    const token = stringValue(record.token);
    if (!token)
        return data;
    return {
        ...record,
        redirect_url: `${baseUrl}/api/v3/checkout-bff/redirect/checkout?token=${encodeCheckoutToken(token)}`,
    };
}
function stringValue(value) {
    if (value === undefined || value === null)
        return undefined;
    const normalized = String(value).trim();
    return normalized || undefined;
}
function encodeCheckoutToken(token) {
    try {
        return encodeURIComponent(decodeURIComponent(token));
    }
    catch {
        return encodeURIComponent(token);
    }
}
