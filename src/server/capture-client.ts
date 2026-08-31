import { resolveP3PBaseUrl, withP3PEnvironmentDefaults } from "../config";
import {
  CaptureOptions,
  CaptureResult,
  FetchLike,
  PENDING_DEBIT_STATUSES,
  P3PCaptureError,
  P3PError,
  PaymentMethod,
  PineLabsOnlineServerConfig,
} from "../types";
import { requestWithRetry, resolveRetryAfterDelayMs, safeJson } from "../utils/http";
import { asRecord } from "../utils/parsers";
import { isSupportedPaymentMethod, unsupportedPaymentMethodError } from "../utils/validation";
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
    if (!isSupportedPaymentMethod(options.paymentMethod)) {
      throw new P3PCaptureError(unsupportedPaymentMethodError("CaptureOptions: paymentMethod", options.paymentMethod).message);
    }
    if (!Number.isInteger(options.amount.value) || options.amount.value <= 0) {
      throw new P3PCaptureError("CaptureOptions: amount.value must be a positive integer (paise)");
    }
    const mobileNumber = resolveMobileNumber(options);
    const paymentMethodReferenceId = resolvePaymentMethodReferenceId(options);
    if (options.paymentMethod === PaymentMethod.CREDIT_EMI && !paymentMethodReferenceId) {
      throw new P3PCaptureError("CaptureOptions: paymentMethodReferenceId is required for CREDIT_EMI");
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
      const error = P3PError.fromResponse(response.status, await safeJson(response));
      throw new P3PCaptureError(`Capture failed: ${error.message}`, error);
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
  private async pollDebitStatus(
    idempotencyKey: string,
    delayMs: number,
    maxPolls: number,
  ): Promise<CaptureResult | undefined> {
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      await sleep(delayMs);
      let result: CaptureResult;
      try {
        result = await this.getDebitStatus(idempotencyKey);
      } catch {
        return undefined;
      }
      if (!isPendingDebitStatus(result.status)) {
        return { ...result, idempotencyKey };
      }
    }
    return undefined;
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

function resolveMobileNumber(options: CaptureOptions): string {
  const mobileNumber = normalizeMobileNumber(options.mobileNumber ?? "");
  if (!mobileNumber) {
    throw new P3PCaptureError("CaptureOptions: mobileNumber is required for P3P V2 debit");
  }
  return mobileNumber;
}

function resolvePaymentMethodReferenceId(options: CaptureOptions): string | undefined {
  return (options.paymentMethodReferenceId ?? options.metadata?.payment_method_reference_id ?? options.metadata?.paymentMethodReferenceId ?? "").trim() || undefined;
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
  if (digits.length > 10) {
    throw new P3PCaptureError(`CaptureOptions: mobileNumber must be at most 10 digits, got ${digits.length}`);
  }
  return digits;
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
