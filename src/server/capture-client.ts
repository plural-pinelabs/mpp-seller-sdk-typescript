import { DEFAULT_BASE_URL } from "../config";
import {
  CaptureOptions,
  CaptureResult,
  FetchLike,
  MppCaptureError,
  MppError,
  PluralSellerConfig,
} from "../types";
import { requestWithRetry, safeJson } from "../utils/http";
import { asRecord, dictToCaptureResult } from "../utils/parsers";
import { buildRequestHash } from "../utils/request-hash";
import { AuthManager } from "./auth-manager";

export class CaptureClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly auth: AuthManager;

  constructor(private config: PluralSellerConfig) {
    this.baseUrl = stripSlash(config.baseUrl ?? DEFAULT_BASE_URL);
    this.fetchImpl = config.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!this.fetchImpl) {
      throw new Error("A fetch implementation is required.");
    }
    this.auth = new AuthManager(config, this.baseUrl, this.fetchImpl);
  }

  /** Call `/mpp/v1/debit` with idempotency and request-hash headers. */
  async capture(options: CaptureOptions): Promise<CaptureResult> {
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
    const response = await requestWithRetry(this.fetchImpl, `${this.baseUrl}/mpp/v1/debit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": options.idempotencyKey ?? randomId(),
        "Request-Hash": buildRequestHash(payload),
      },
      body: JSON.stringify(payload),
    }, this.config);

    if (!response.ok) {
      const error = MppError.fromResponse(response.status, await safeJson(response));
      throw new MppCaptureError(`Capture failed: ${error.message}`, error);
    }
    const responsePayload = await response.json();
    const data = asRecord(asRecord(responsePayload)?.data) ?? asRecord(responsePayload) ?? {};
    return dictToCaptureResult(data);
  }
}

function resolveCustomerReference(options: CaptureOptions): string {
  const customerReference = (options.customerReference ?? options.metadata?.customer_reference ?? options.metadata?.customerReference ?? "").trim();
  if (!customerReference) {
    throw new MppCaptureError("CaptureOptions: customerReference is required for MPP V2 debit");
  }
  return customerReference;
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
