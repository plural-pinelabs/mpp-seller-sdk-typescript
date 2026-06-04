import { resolveP3PBaseUrl, withP3PEnvironmentDefaults } from "../config";
import {
  CaptureOptions,
  CaptureResult,
  FetchLike,
  PENDING_DEBIT_STATUSES,
  P3PCaptureError,
  P3PError,
  PineLabsOnlineServerConfig,
} from "../types";
import { requestWithRetry, resolveRetryAfterDelayMs, safeJson } from "../utils/http";
import { asRecord } from "../utils/parsers";
import { AuthManager } from "./auth-manager";

export class CaptureClient {
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

  /** Call `/mpp/v1/debit` with idempotency headers. */
  async capture(options: CaptureOptions): Promise<CaptureResult> {
    resolveCustomerReference(options);
    const mobileNumber = resolveMobileNumber(options);
    const token = await this.auth.getAccessToken();
    const idempotencyKey = options.idempotencyKey ?? options.merchantOrderReference ?? randomId();
    const payload = {
      payment_method: options.paymentMethod,
      customer: { mobile_number: mobileNumber },
      payment_amount: { value: options.amount.value, currency: options.amount.currency },
      payment_token: options.token,
      challenge_id: resolveChallengeId(options),
    };
    const maxRetries = this.config.maxRetries ?? 0;
    const initialRetryDelayMs = this.config.initialRetryDelayMs ?? 0;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const response = await requestWithRetry(this.fetchImpl, `${this.baseUrl}/mpp/v1/debit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      }, this.config);

      if (response.status === 202) {
        const data = normalizeCapturePayload(await safeJson(response));
        const retryAfter = retryDelayMs(response, initialRetryDelayMs);
        if (attempt < maxRetries) {
          await sleep(retryAfter);
          continue;
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
        const error = P3PError.fromResponse(response.status, await safeJson(response));
        throw new P3PCaptureError(`Capture failed: ${error.message}`, error);
      }
      return {
        ...normalizeCapturePayload(await response.json()),
        payment_gateway: this.config.paymentGateway,
      };
    }
    throw new P3PCaptureError("Capture failed: debit did not complete");
  }

  /** Fetch the latest debit status through `GET /mpp/v1/debit/{id}`. */
  async getDebitStatus(idempotencyKey: string): Promise<CaptureResult> {
    if (!idempotencyKey) {
      throw new Error("idempotencyKey is required");
    }
    const token = await this.auth.getAccessToken();
    const response = await requestWithRetry(this.fetchImpl, `${this.baseUrl}/mpp/v1/debit/${encodeURIComponent(idempotencyKey)}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    }, this.config);

    if (!response.ok) {
      throw P3PError.fromResponse(response.status, await safeJson(response));
    }
    return {
      ...normalizeCapturePayload(await response.json()),
      payment_gateway: this.config.paymentGateway,
    };
  }
}

function normalizeCapturePayload(payload: unknown): Record<string, unknown> {
  return asRecord(asRecord(payload)?.data) ?? asRecord(payload) ?? {};
}

function resolveCustomerReference(options: CaptureOptions): string {
  const customerReference = (options.customerReference ?? options.metadata?.customer_reference ?? options.metadata?.customerReference ?? "").trim();
  if (!customerReference) {
    throw new P3PCaptureError("CaptureOptions: customerReference is required for P3P V2 debit");
  }
  return customerReference;
}

function resolveMobileNumber(options: CaptureOptions): string {
  const mobileNumber = normalizeMobileNumber(options.mobileNumber ?? options.metadata?.mobile_number ?? options.metadata?.mobileNumber ?? "");
  if (!mobileNumber) {
    throw new P3PCaptureError("CaptureOptions: mobileNumber is required for P3P V2 debit");
  }
  return mobileNumber;
}

function resolveChallengeId(options: CaptureOptions): string {
  const challengeId = (options.challengeId ?? "").trim();
  if (!challengeId) {
    throw new P3PCaptureError("CaptureOptions: challengeId is required for P3P V2 debit");
  }
  return challengeId;
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

function normalizeMobileNumber(value: string): string {
  const digits = value.trim().replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function retryDelayMs(response: Response, fallbackMs: number): number {
  return resolveRetryAfterDelayMs(response.headers.get("Retry-After")) ?? fallbackMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPendingDebitStatus(status: unknown): boolean {
  return PENDING_DEBIT_STATUSES.includes(String(status ?? "").trim().toUpperCase() as (typeof PENDING_DEBIT_STATUSES)[number]);
}
