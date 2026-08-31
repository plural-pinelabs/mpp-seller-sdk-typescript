import { resolveP3PBaseUrl, withP3PEnvironmentDefaults } from "../config";
import {
  Amount,
  CreateRefundOptions,
  CreateMandateRevokeOptions,
  CreateMandateOptions,
  CreatePreAuthorizationOptions,
  FetchLike,
  Mandate,
  MandateBalanceLookupOptions,
  MandateBalanceResult,
  MandateRevokeResult,
  Order,
  P3PError,
  PineLabsOnlineServerConfig,
  PreAuthorization,
  Refund,
} from "../types";
import { requestWithRetry, safeJson } from "../utils/http";
import { asRecord, parseMandate, parseMandateBalanceResult, parseMandateRevokeResult, parsePreAuthorization } from "../utils/parsers";
import { parseOrder, parseRefund } from "../utils/order-parsers";
import {
  normalizeMobileNumber,
  validateCreateMandateOptions,
  validateCreateMandateRevokeOptions,
  validateMandateBalanceLookupOptions,
} from "../utils/validation";
import { AuthManager } from "./auth-manager";

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly auth: AuthManager;

  constructor(private config: PineLabsOnlineServerConfig) {
    this.config = withP3PEnvironmentDefaults(config);
    this.baseUrl = stripSlash(resolveP3PBaseUrl(this.config.env));
    this.fetchImpl = this.config.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!this.fetchImpl) {
      throw new Error("A fetch implementation is required.");
    }
    this.auth = new AuthManager(this.config, this.baseUrl, this.fetchImpl);
  }

  /** Create an P3P mandate/pre-authorization and normalize the service response. */
  async createMandate(options: CreateMandateOptions): Promise<Mandate> {
    const data = await this.createPreAuthorizationRequest(options);
    return parseMandate(data);
  }

  /** Create a card/mandate pre-authorization and return the service contract shape. */
  async createPreAuthorization(options: CreatePreAuthorizationOptions): Promise<PreAuthorization> {
    const data = await this.createPreAuthorizationRequest(options);
    return parsePreAuthorization(data);
  }

  private async createPreAuthorizationRequest(options: CreateMandateOptions): Promise<unknown> {
    validateCreateMandateOptions(options);
    const mobileNumber = normalizeMobileNumber(options.mobileNumber ?? "");
    const paymentMethod = options.paymentMethod ?? this.config.availablePaymentMethods[0];
    const body: Record<string, unknown> = {
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
  async getMandate(mandateId: string): Promise<Mandate> {
    if (!mandateId) {
      throw new Error("mandateId is required");
    }
    const data = await this.request("GET", `/mpp/v1/authorization/${encodeURIComponent(mandateId)}`);
    return parseMandate(data);
  }

  /** Retrieve an order through `GET /api/pay/v1/orders/{order_id}`. */
  async getOrder(orderId: string): Promise<Order> {
    const normalizedOrderId = orderId.trim();
    if (!normalizedOrderId) {
      throw new Error("orderId is required");
    }
    const data = await this.request("GET", `/api/pay/v1/orders/${encodeURIComponent(normalizedOrderId)}`);
    return parseOrder(data);
  }

  /** Initiate a refund through `POST /api/pay/v1/refunds/{order_id}`. */
  async createRefund(orderId: string, options: CreateRefundOptions): Promise<Refund> {
    const normalizedOrderId = orderId.trim();
    const merchantOrderReference = options.merchantOrderReference.trim();
    const currency = options.orderAmount.currency.trim();
    if (!normalizedOrderId) throw new Error("orderId is required");
    if (!merchantOrderReference) throw new Error("CreateRefundOptions: merchantOrderReference is required");
    if (!Number.isInteger(options.orderAmount.value) || options.orderAmount.value <= 0) {
      throw new Error("CreateRefundOptions: orderAmount.value must be a positive integer (paise)");
    }
    if (!currency) throw new Error("CreateRefundOptions: orderAmount.currency is required");

    const data = await this.request(
      "POST",
      `/api/pay/v1/refunds/${encodeURIComponent(normalizedOrderId)}`,
      {
        merchant_order_reference: merchantOrderReference,
        order_amount: { value: options.orderAmount.value, currency },
        ...(options.merchantMetadata ? { merchant_metadata: options.merchantMetadata } : {}),
      },
      {
        "Request-ID": randomId(),
        "Request-Timestamp": new Date().toISOString(),
      },
    );
    return parseRefund(data);
  }

  /** Fetch mandate balance/authorization status through `GET /mpp/v1/balance`. */
  async getMandateBalance(options: MandateBalanceLookupOptions): Promise<MandateBalanceResult> {
    validateMandateBalanceLookupOptions(options);
    const params = new URLSearchParams();
    if ("authorizationId" in options && options.authorizationId) {
      params.set("authorization_id", options.authorizationId);
      if (options.phoneNumber) {
        params.set("phone_number", normalizeMobileNumber(options.phoneNumber));
      }
    } else {
      const phoneNumber = normalizeMobileNumber(options.phoneNumber ?? "");
      const paymentMethod = options.paymentMethod;
      params.set("phone_number", phoneNumber);
      params.set("type", String(paymentMethod));
    }
    const data = await this.request("GET", `/mpp/v1/balance?${params.toString()}`);
    return parseMandateBalanceResult(data);
  }

  /** Create a mandate revoke request through `POST /mpp/v1/revoke`. */
  async revokeMandate(options: CreateMandateRevokeOptions): Promise<MandateRevokeResult> {
    validateCreateMandateRevokeOptions(options);
    const body: Record<string, unknown> = {
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
          ? { mobile_number: normalizeMobileNumber(options.customer.mobileNumber) }
          : {}),
      };
    }
    const data = await this.request("POST", "/mpp/v1/revoke", body);
    return parseMandateRevokeResult(data);
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<unknown> {
    const token = await this.auth.getAccessToken();
    const response = await requestWithRetry(this.fetchImpl, `${this.baseUrl}${path}`, {
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
      throw P3PError.fromResponse(response.status, await safeJson(response));
    }
    const payload = await response.json();
    const record = asRecord(payload);
    return record && "data" in record ? record.data : payload;
  }
}

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stripSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function customerPayload(mobileNumber: string): Record<string, string> {
  return {
    mobile_number: mobileNumber,
  };
}

function amountPayload(amount: Amount): Record<string, unknown> {
  return { value: amount.value, currency: amount.currency };
}

function isRedirectPaymentMethod(value: unknown): boolean {
  const normalized = String(value ?? "").toUpperCase();
  return normalized === "CARD" || normalized === "CREDIT_EMI";
}

function merchantMetadataPayload(metadata: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [
    key,
    typeof value === "string" ? value : (JSON.stringify(value) ?? "null"),
  ]));
}

function withCheckoutRedirectUrl(data: unknown, baseUrl: string): unknown {
  const record = asRecord(data);
  if (!record || record.redirect_url || record.redirectUrl) return data;
  const token = stringValue(record.token);
  if (!token) return data;
  return {
    ...record,
    redirect_url: `${baseUrl}/api/v3/checkout-bff/redirect/checkout?token=${encodeCheckoutToken(token)}`,
  };
}

function stringValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function encodeCheckoutToken(token: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(token));
  } catch {
    return encodeURIComponent(token);
  }
}
