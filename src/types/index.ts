/** Fetch-compatible function used by the seller SDK in Node, tests, workers, or custom runtimes. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const PAYMENT_HEADER_PREFIX = "Payment ";
export const PAYMENT_RECEIPT_PREFIX = "Payment ";

/** Logger interface used by SDK internals for retry/auth/payment diagnostics. */
export interface MppLogger {
  /** Low-volume diagnostic event, usually before a request or decision. */
  debug(message: string, context?: Record<string, unknown>): void;
  /** Informational event such as retries, auth refreshes, and capture results. */
  info(message: string, context?: Record<string, unknown>): void;
  /** Error event for failed auth, network, credential, or capture operations. */
  error(message: string, context?: Record<string, unknown>): void;
}

/** Money amount expressed in the smallest unit for the currency, e.g. paise for INR. */
export class Amount {
  constructor(
    /** Amount in the smallest unit for the currency, e.g. paise for INR. */
    public value: number,
    /** ISO-style currency code expected by MPP, e.g. `INR` or `PATHUSD`. */
    public currency: string,
  ) {}
}

/** Payment challenge/capture context for a seller-protected resource. */
export class ChargeOptions {
  constructor(
    /** Amount the seller requires before allowing the protected resource request. */
    public amount: Amount,
    /** Protected resource identifier embedded in the 402 challenge. */
    public resource: string,
    /** Optional description propagated to capture/debit metadata where supported. */
    public description?: string,
    /** Optional stable seller order reference sent as `merchant_order_reference` on debit. */
    public merchantOrderReference?: string,
    /** Optional metadata used by adapters and capture helpers. */
    public metadata?: Record<string, string>,
    /** Optional per-challenge expiry override in seconds. */
    public challengeExpirySeconds?: number,
  ) {}
}

/** Configuration required to construct a seller SDK instance. */
export interface PluralSellerConfig {
  /** Client id used for `POST /api/auth/v1/token` unless `accessToken` is supplied. */
  clientId: string;
  /** Client secret used for `POST /api/auth/v1/token` unless `accessToken` is supplied. */
  clientSecret: string;
  /** Shared secret used to HMAC-sign seller challenges and verify returned credentials. */
  challengeSecretKey: string;
  /** Challenge realm string embedded in `WWW-Authenticate` payloads. */
  realm?: string;
  /** Base URL used for MPP service calls and auth token exchange. */
  baseUrl?: string;
  /** Default seller challenge expiry in seconds. Defaults to 300. */
  defaultChallengeExpirySeconds?: number;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  requestTimeoutMs?: number;
  /** Number of retries for network errors, HTTP 429, and 5xx responses. Defaults to 3. */
  maxRetries?: number;
  /** Initial exponential-backoff retry delay in milliseconds. Defaults to 500. */
  initialRetryDelayMs?: number;
  /** Optional logger for request, retry, auth, and capture diagnostics. */
  logger?: MppLogger;
  /** Pre-issued bearer token. When supplied, the SDK skips client-credential exchange. */
  accessToken?: string;
  /** Custom fetch implementation for tests or non-standard runtimes. */
  fetch?: FetchLike;
}

/** Payment request embedded in the seller 402 challenge. */
export interface ChallengeRequest {
  scheme: string;
  amount: string;
  currency: string;
  resource: string;
}

/** Signed seller payment challenge encoded in `WWW-Authenticate`. */
export interface Challenge {
  id: string;
  realm: string;
  method: string;
  intent: string;
  request: ChallengeRequest;
  expires: string;
}

/** Problem Details response body returned with a 402 challenge. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  challengeId?: string;
}

/** Generated challenge plus its encoded header payload and problem body. */
export interface ChallengeResult {
  challenge: Challenge;
  encoded: string;
  problemDetails: ProblemDetails;
}

/** Buyer token payload embedded inside a Payment credential. */
export interface CredentialPayload {
  type: "token";
  token: string;
  customer_reference?: string;
}

/** Decoded buyer credential from `Authorization: Payment <payload>`. */
export interface Credential {
  challenge: Challenge;
  source: string;
  payload: CredentialPayload;
}

/** Result of local Payment credential verification. */
export interface VerificationResult {
  valid: boolean;
  credential?: Credential;
  error?: string;
}

/** Input for seller debit/capture via `POST /mpp/v1/debit`. */
export interface CaptureOptions {
  /** One-time payment token from the buyer credential payload. */
  token: string;
  /** Debit amount in minor units. */
  amount: Amount;
  /** Optional capture/debit description retained for adapter compatibility. */
  description?: string;
  /** Optional stable seller order reference sent as `merchant_order_reference`. */
  merchantOrderReference?: string;
  /** Optional metadata; may include `customer_reference` when not passed directly. */
  metadata?: Record<string, string>;
  /** Optional idempotency key for `/mpp/v1/debit`. Generated when absent. */
  idempotencyKey?: string;
  /** MPP payment type. Defaults to `SBMD`; `CRYPTO` is supported by the service contract. */
  paymentType?: "SBMD" | "CRYPTO" | string;
  /** Buyer/customer reference required by `/mpp/v1/debit`. */
  customerReference?: string;
}

/** Normalized debit/capture response from the MPP service. */
export interface CaptureResult {
  capture_id: string;
  object: string;
  mandate_id: string;
  token_id: string;
  customer_id: string;
  merchant_id: string;
  order_id: string;
  order_status: string;
  payment_id: string;
  payment_status: string;
  amount: Amount;
  upi_txn_id: string;
  receipt: Record<string, unknown>;
  description?: string;
  merchant_order_reference?: string;
  metadata?: Record<string, unknown>;
  settled_at: string;
  created_at: string;
  raw: Record<string, unknown>;
}

/** Settlement amount encoded in a `Payment-Receipt` header. */
export interface Settlement {
  amount: string;
  currency: string;
}

/** Decoded/structured seller payment receipt data. */
export interface ReceiptData {
  status: "success" | "failure";
  method: string;
  timestamp: string;
  reference: string;
  challengeId: string;
  settlement: Settlement;
}

/** Decision returned by seller middleware helpers for a paid-resource request. */
export interface PaymentDecision {
  /** Adapter action: challenge, reject, capture error, or proceed. */
  action: "challenge" | "invalid" | "failed" | "error" | "proceed";
  /** HTTP status the framework adapter should return for non-proceed actions. */
  status: number;
  /** Response headers such as `WWW-Authenticate`, `Payment-Receipt`, or content type. */
  headers: Record<string, string>;
  /** Problem Details body for challenge, invalid, failed, or capture error actions. */
  problemDetails?: ProblemDetails | Record<string, unknown>;
  /** Captured MPP debit result when `action` is `proceed`. */
  captureResult?: CaptureResult;
  /** Verified buyer credential when available. */
  credential?: Credential;
  /** Encoded `Payment-Receipt` header value when capture succeeds. */
  receiptHeader?: string;
  /** Fresh challenge data for challenge/invalid/failed actions. */
  challengeResult?: ChallengeResult;
}

/** Error type raised for non-2xx MPP service responses. */
export class MppError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MppError";
  }

  static fromResponse(status: number, body: unknown): MppError {
    const record = asRecord(body) ?? {};
    const error = asRecord(record.error) ?? record;
    return new MppError(
      String(error.code ?? "MPP_INTERNAL_ERROR"),
      String(error.message ?? `HTTP ${status}`),
      status,
      asRecord(error.additional_error_details),
    );
  }
}

/** Error wrapper used when seller debit/capture fails. */
export class MppCaptureError extends Error {
  constructor(message: string, public captureError?: MppError) {
    super(message);
    this.name = "MppCaptureError";
  }
}

/** Error type reserved for local Payment credential verification failures. */
export class MppVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MppVerificationError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
