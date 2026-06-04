import type { P3PEnvironmentValue } from "../config";
/** Fetch-compatible function used by the server SDK in Node, tests, workers, or custom runtimes. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export declare const PAYMENT_CREDENTIAL_HEADER = "P3P-Credential";
export declare const PAYMENT_HEADER_PREFIX = "Payment ";
export declare const PAYMENT_RECEIPT_PREFIX = "Payment ";
/** Payment gateway enum retained for capture/receipt context. */
export declare enum PaymentGateway {
    PineLabsOnline = "PINE LABS ONLINE"
}
/** Payment methods supported by the current P3P service payload contract. */
export declare enum PaymentMethod {
    RESERVE_PAY = "RESERVE_PAY",
    Crypto = "CRYPTO"
}
/** Logger interface used by SDK internals for retry/auth/payment diagnostics. */
export interface P3PLogger {
    /** Low-volume diagnostic event, usually before a request or decision. */
    debug(message: string, context?: Record<string, unknown>): void;
    /** Informational event such as retries, auth refreshes, and capture results. */
    info(message: string, context?: Record<string, unknown>): void;
    /** Error event for failed auth, network, credential, or capture operations. */
    error(message: string, context?: Record<string, unknown>): void;
}
/** Money amount expressed in the smallest unit for the currency, e.g. paise for INR. */
export declare class Amount {
    /** Amount in the smallest unit for the currency, e.g. paise for INR. */
    value: number;
    /** ISO-style currency code expected by P3P, e.g. `INR` or `PATHUSD`. */
    currency: string;
    constructor(
    /** Amount in the smallest unit for the currency, e.g. paise for INR. */
    value: number, 
    /** ISO-style currency code expected by P3P, e.g. `INR` or `PATHUSD`. */
    currency: string);
}
/** Payment challenge/capture context for a server-protected resource. */
export declare class ChargeOptions {
    /** Amount the server requires before allowing the protected resource request. */
    amount: Amount;
    /** Protected resource identifier embedded in the 402 challenge. */
    resource: string;
    /** Optional description propagated to capture/debit metadata where supported. */
    description?: string | undefined;
    /** Optional stable server order reference retained for compatibility; current debit sends it as the idempotency key when no explicit key is provided. */
    merchantOrderReference?: string | undefined;
    /** Optional metadata used by adapters and capture helpers. */
    metadata?: Record<string, string> | undefined;
    /** Optional per-challenge expiry override in seconds. */
    challengeExpirySeconds?: number | undefined;
    constructor(
    /** Amount the server requires before allowing the protected resource request. */
    amount: Amount, 
    /** Protected resource identifier embedded in the 402 challenge. */
    resource: string, 
    /** Optional description propagated to capture/debit metadata where supported. */
    description?: string | undefined, 
    /** Optional stable server order reference retained for compatibility; current debit sends it as the idempotency key when no explicit key is provided. */
    merchantOrderReference?: string | undefined, 
    /** Optional metadata used by adapters and capture helpers. */
    metadata?: Record<string, string> | undefined, 
    /** Optional per-challenge expiry override in seconds. */
    challengeExpirySeconds?: number | undefined);
}
/** Configuration required to construct a server SDK instance. */
export interface PineLabsOnlineServerConfig {
    /** Client id used for `POST /api/auth/v1/token`. */
    clientId: string;
    /** Client secret used for `POST /api/auth/v1/token`. */
    clientSecret: string;
    /** Challenge realm string embedded in `WWW-Authenticate` payloads. */
    realm?: string;
    /** Pine Labs Online P3P environment used for auth and P3P service calls. */
    env: P3PEnvironmentValue;
    /** Payment gateway used for capture/receipt context; not emitted in server 402 challenges. */
    paymentGateway: PaymentGateway;
    /** Payment methods this server integration can accept for protected resources. */
    availablePaymentMethods: PaymentMethod[];
    /** Default server challenge expiry in seconds. Defaults to 300. */
    defaultChallengeExpirySeconds?: number;
    /** Per-request timeout in milliseconds. Defaults to 30000. */
    requestTimeoutMs?: number;
    /** Number of retries for network errors, HTTP 429, and 5xx responses. Defaults to 3. */
    maxRetries?: number;
    /** Initial exponential-backoff retry delay in milliseconds. Defaults to 500. */
    initialRetryDelayMs?: number;
    /** Optional logger for request, retry, auth, and capture diagnostics. */
    logger?: P3PLogger;
    /** Custom fetch implementation for tests or non-standard runtimes. */
    fetch?: FetchLike;
}
/** Input for server/server-side mandate creation via `POST /mpp/v1/pre-authorize`. */
export interface CreateMandateOptions {
    /** Client mobile number for UPI ReservePay; accepts E.164 or local 10-digit format. */
    mobileNumber?: string;
    /** Mandate/pre-authorization amount in minor units. */
    amount: Amount;
    /** Preferred client/customer reference for P3P lookups. */
    customerReference?: string;
    /** Legacy alias used when `customerReference` is absent. */
    customerId?: string;
    /** Optional description stored with the pre-authorization. */
    description?: string;
    /** Optional caller metadata retained for compatibility; not required by current service contract. */
    metadata?: Record<string, string>;
    /** Optional legacy expiry value retained for compatibility; current service uses `validityInDays`. */
    expiry?: string;
    /** Optional idempotency key for pre-authorization creation. Generated when absent. */
    idempotencyKey?: string;
    /** P3P payment method sent as the pre-authorize payload `type`. */
    paymentMethod?: PaymentMethod;
    /** Authorization validity period in days. Defaults to 7. */
    validityInDays?: number;
}
/** Normalized mandate/pre-authorization response returned by the P3P service. */
export interface Mandate {
    mandate_id: string;
    object: string;
    order_id: string;
    order_status: string;
    payment_status: string;
    customer_reference: string;
    customer_id: string;
    agent_id: string;
    amount: Amount;
    amount_blocked: number;
    amount_debited: number;
    amount_held: number;
    amount_available: number;
    mobile_number: string;
    description?: string;
    metadata?: Record<string, unknown>;
    expires_at: string;
    created_at: string;
    challenge?: {
        type: string;
        qr_url: string;
        deep_link: string;
        expires_at: string;
    };
    raw: Record<string, unknown>;
}
/** Payment request embedded in the server 402 challenge. */
export interface ChallengeRequest {
    scheme: string;
    amount: string;
    currency: string;
    resource: string;
    availablePaymentMethods: PaymentMethod[];
}
/** Signed server payment challenge encoded in `WWW-Authenticate`. */
export interface Challenge {
    id: string;
    realm: string;
    /** @deprecated Not emitted in 402 challenges. Kept only for old decoded payloads. */
    paymentGateway?: PaymentGateway;
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
/** Client token payload embedded inside a Payment credential. */
export interface CredentialPayload {
    type: "token";
    token: string;
    customer_reference?: string;
    mobile_number?: string;
    payment_method: PaymentMethod;
}
/** Decoded client credential from `P3P-Credential: Payment <payload>`. */
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
/** Input for server debit/capture via `POST /mpp/v1/debit`. */
export interface CaptureOptions {
    /** One-time payment token from the client credential payload. */
    token: string;
    /** Debit amount in minor units. */
    amount: Amount;
    /** Optional capture/debit description retained for adapter compatibility. */
    description?: string;
    /** Optional stable server order reference retained for compatibility; current debit sends it as the idempotency key when no explicit key is provided. */
    merchantOrderReference?: string;
    /** Optional metadata; may include `customer_reference` when not passed directly. */
    metadata?: Record<string, string>;
    /** Optional idempotency key for `/mpp/v1/debit`. Generated when absent. */
    idempotencyKey?: string;
    /** P3P payment method sent as the `/mpp/v1/debit` payload `type`. */
    paymentMethod: PaymentMethod;
    /** Client/customer reference required by `/mpp/v1/debit`. */
    customerReference?: string;
    /** Client mobile number sent as `customer.mobile_number` to `/mpp/v1/debit`. */
    mobileNumber?: string;
    /** Server challenge id associated with this debit, sent as `challenge_id`. */
    challengeId?: string;
}
/** Normalized debit/capture response from the P3P service. */
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
    payment_gateway?: PaymentGateway;
    payment_method?: PaymentMethod;
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
/** Decoded/structured server payment receipt data. */
export interface ReceiptData {
    status: "success" | "failure";
    paymentGateway?: PaymentGateway;
    paymentMethod?: PaymentMethod;
    timestamp: string;
    reference: string;
    challengeId: string;
    orderId?: string | null;
    merchantOrderReference?: string | null;
    settlement: Settlement;
}
/** Optional payment context encoded into a `Payment-Receipt` header. */
export interface ReceiptContext {
    paymentGateway?: PaymentGateway;
    paymentMethod?: PaymentMethod;
}
/** Decision returned by server middleware helpers for a paid-resource request. */
export interface PaymentDecision {
    /** Adapter action: challenge, reject, capture error, or proceed. */
    action: "challenge" | "invalid" | "failed" | "error" | "proceed";
    /** HTTP status the framework adapter should return for non-proceed actions. */
    status: number;
    /** Response headers such as `WWW-Authenticate`, `Payment-Receipt`, or content type. */
    headers: Record<string, string>;
    /** Problem Details body for challenge, invalid, failed, or capture error actions. */
    problemDetails?: ProblemDetails | Record<string, unknown>;
    /** Captured P3P debit result when `action` is `proceed`. */
    captureResult?: CaptureResult;
    /** Verified client credential when available. */
    credential?: Credential;
    /** Encoded `Payment-Receipt` header value when capture succeeds. */
    receiptHeader?: string;
    /** Fresh challenge data for challenge/invalid/failed actions. */
    challengeResult?: ChallengeResult;
}
/** Error type raised for non-2xx P3P service responses. */
export declare class P3PError extends Error {
    code: string;
    httpStatus: number;
    details?: Record<string, unknown> | undefined;
    constructor(code: string, message: string, httpStatus: number, details?: Record<string, unknown> | undefined);
    static fromResponse(status: number, body: unknown): P3PError;
}
/** Error wrapper used when server debit/capture fails. */
export declare class P3PCaptureError extends Error {
    captureError?: P3PError | undefined;
    constructor(message: string, captureError?: P3PError | undefined);
}
/** Error type reserved for local Payment credential verification failures. */
export declare class P3PVerificationError extends Error {
    constructor(message: string);
}
