import { resolveP3PBaseUrl, withP3PEnvironmentDefaults } from "../config";
import {
  CaptureOptions,
  CaptureResult,
  FetchLike,
  P3PCaptureError,
  P3PError,
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
    this.config = withP3PEnvironmentDefaults(config);
    this.baseUrl = stripSlash(resolveP3PBaseUrl(this.config.env));
    this.fetchImpl = this.config.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!this.fetchImpl) {
      throw new Error("A fetch implementation is required.");
    }
    this.auth = new AuthManager(this.config, this.baseUrl, this.fetchImpl);
  }

  /** Call `/mpp/v1/debit` with idempotency and request-hash headers. */
  async capture(options: CaptureOptions): Promise<CaptureResult> {
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
    const response = await requestWithRetry(this.fetchImpl, `${this.baseUrl}/mpp/v1/debit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": idempotencyKey,
        "Request-Hash": buildRequestHash(payload),
      },
      body: JSON.stringify(payload),
    }, this.config);

    if (!response.ok) {
      const error = P3PError.fromResponse(response.status, await safeJson(response));
      throw new P3PCaptureError(`Capture failed: ${error.message}`, error);
    }
    const responsePayload = await response.json();
    const data = asRecord(asRecord(responsePayload)?.data) ?? asRecord(responsePayload) ?? {};
    const captureResult = dictToCaptureResult(data);
    captureResult.payment_gateway = this.config.paymentGateway;
    captureResult.payment_method = options.paymentMethod;
    return captureResult;
  }
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
