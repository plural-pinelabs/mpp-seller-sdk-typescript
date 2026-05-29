import { resolveP3PBaseUrl, withP3PEnvironmentDefaults } from "../config";
import {
  Amount,
  CreateMandateOptions,
  FetchLike,
  Mandate,
  P3PError,
  PluralSellerConfig,
} from "../types";
import { requestWithRetry, safeJson } from "../utils/http";
import { asRecord, parseMandate } from "../utils/parsers";
import { normalizeMobileNumber, validateCreateMandateOptions } from "../utils/validation";
import { AuthManager } from "./auth-manager";

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly auth: AuthManager;

  constructor(private config: PluralSellerConfig) {
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
    validateCreateMandateOptions(options);
    const mobileNumber = normalizeMobileNumber(options.mobileNumber ?? "");
    const customerReference = options.customerReference ?? options.customerId ?? mobileNumber;
    const body: Record<string, unknown> = {
      type: options.paymentMethod ?? this.config.availablePaymentMethods[0],
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
    return parseMandate(data);
  }

  /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
  async getMandate(mandateId: string): Promise<Mandate> {
    if (!mandateId) {
      throw new Error("mandateId is required");
    }
    const data = await this.request("GET", `/mpp/v1/authorization/${encodeURIComponent(mandateId)}`);
    return parseMandate(data);
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

function customerPayload(_customerReference: string, mobileNumber: string): Record<string, string> {
  return {
    ...(mobileNumber ? { mobile_number: mobileNumber } : {}),
  };
}

function amountPayload(amount: Amount): Record<string, unknown> {
  return { value: amount.value, currency: amount.currency };
}
