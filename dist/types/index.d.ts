/** Fetch-compatible HTTP function used by the SDK. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
/** Prefix used for MPP Payment credentials in HTTP auth headers. */
export declare const PAYMENT_HEADER_PREFIX = "Payment ";
/** Prefix used for encoded seller payment receipts. */
export declare const PAYMENT_RECEIPT_PREFIX = "Payment ";
/** Header name used to pass an optional Grantex grant token to sellers. */
export declare const GRANTEX_TOKEN_HEADER = "X-Grantex-Token";
/** Logger interface used by SDK internals for retry/auth/payment diagnostics. */
export interface MppLogger {
    /** Emit verbose diagnostic information. */
    debug(message: string, context?: Record<string, unknown>): void;
    /** Emit informational SDK lifecycle events. */
    info(message: string, context?: Record<string, unknown>): void;
    /** Emit recoverable and terminal SDK errors. */
    error(message: string, context?: Record<string, unknown>): void;
}
/** Money amount expressed in the smallest unit for the currency, e.g. paise for INR. */
export declare class Amount {
    /** Integer amount in the smallest unit for the currency. */
    value: number;
    /** ISO 4217 currency code, for example `INR`. */
    currency: string;
    constructor(
    /** Integer amount in the smallest unit for the currency. */
    value: number, 
    /** ISO 4217 currency code, for example `INR`. */
    currency: string);
}
/** Payment challenge/capture context for a seller-protected resource. */
export declare class ChargeOptions {
    /** Capture amount requested for the resource. */
    amount: Amount;
    /** Protected resource identifier or route path. */
    resource: string;
    /** Human-readable charge description. */
    description?: string | undefined;
    /** Seller order reference used for reconciliation. */
    merchantOrderReference?: string | undefined;
    /** Additional metadata for challenge/capture context. */
    metadata?: Record<string, string> | undefined;
    /** Per-charge challenge expiry override in seconds. */
    challengeExpirySeconds?: number | undefined;
    constructor(
    /** Capture amount requested for the resource. */
    amount: Amount, 
    /** Protected resource identifier or route path. */
    resource: string, 
    /** Human-readable charge description. */
    description?: string | undefined, 
    /** Seller order reference used for reconciliation. */
    merchantOrderReference?: string | undefined, 
    /** Additional metadata for challenge/capture context. */
    metadata?: Record<string, string> | undefined, 
    /** Per-charge challenge expiry override in seconds. */
    challengeExpirySeconds?: number | undefined);
}
/** Seller-side Grantex verification settings. */
export interface SellerGrantexConfig {
    /** JWKS URL or Grantex base URL; base URLs resolve to `/.well-known/jwks.json`. */
    jwksUrl: string;
    /** JWKS cache duration in milliseconds. */
    jwksCacheTtlMs?: number;
    /** Scopes that must be present on the grant token before capture proceeds. */
    requiredScopes?: string[];
    /** Whether invalid or missing grants should block paid-resource access. */
    enforceGrant?: boolean;
}
/** Verified Grantex JWT claims seen by the seller SDK. */
export interface GrantTokenClaims {
    iss: string;
    sub: string;
    agt: string;
    scp: string[];
    grnt: string;
    iat: number;
    exp: number;
    dev?: string;
    nbf?: number;
    parentAgt?: string;
    parentGrnt?: string;
    delegationDepth?: number;
    raw: Record<string, unknown>;
}
/** Result of seller-side Grantex token verification. */
export interface GrantVerificationResult {
    valid: boolean;
    claims?: GrantTokenClaims;
    error?: string;
}
/** Configuration required to construct a seller SDK instance. */
export interface PluralSellerConfig {
    /** Pine Labs OAuth client id issued after merchant onboarding. */
    clientId: string;
    /** Pine Labs OAuth client secret issued with the client id. */
    clientSecret: string;
    /** Secret used to sign and verify seller 402 challenges. */
    challengeSecretKey: string;
    /** Realm embedded in generated `WWW-Authenticate` payment challenges. */
    realm?: string;
    /** Base host for auth and MPP debit APIs, for example `MppEnvironment.SANDBOX`. */
    baseUrl?: string;
    /** Default challenge expiry in seconds when `ChargeOptions` does not override it. */
    defaultChallengeExpirySeconds?: number;
    /** Per-request timeout in milliseconds. */
    requestTimeoutMs?: number;
    /** Number of retry attempts for retriable auth and MPP API requests. */
    maxRetries?: number;
    /** Initial retry backoff delay in milliseconds. */
    initialRetryDelayMs?: number;
    /** Optional logger for auth, retry, payment, and Grantex diagnostics. */
    logger?: MppLogger;
    /** Optional seller-side Grantex token verification settings. */
    grantex?: SellerGrantexConfig;
    /** Pre-resolved bearer token for environments that manage auth outside the SDK. */
    accessToken?: string;
    /** Custom fetch implementation for tests, workers, or non-standard runtimes. */
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
    /** One-time MPP payment token supplied by the buyer credential. */
    token: string;
    /** Capture amount. */
    amount: Amount;
    /** Human-readable capture description. */
    description?: string;
    /** Seller order reference used for reconciliation. */
    merchantOrderReference?: string;
    /** Additional metadata for the debit request. */
    metadata?: Record<string, string>;
    /** Idempotency key for capture/debit. */
    idempotencyKey?: string;
    /** Payment rail type. Current examples use `SBMD`; other rails are future scope. */
    paymentType?: "SBMD" | "CRYPTO" | string;
    /** Stable buyer/customer reference required by MPP V2 debit. */
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
    action: "challenge" | "invalid" | "failed" | "grant_required" | "grant_invalid" | "error" | "proceed";
    status: number;
    headers: Record<string, string>;
    problemDetails?: ProblemDetails | Record<string, unknown>;
    captureResult?: CaptureResult;
    credential?: Credential;
    receiptHeader?: string;
    challengeResult?: ChallengeResult;
}
/** Error type raised for non-2xx MPP service responses. */
export declare class MppError extends Error {
    code: string;
    httpStatus: number;
    details?: Record<string, unknown> | undefined;
    constructor(code: string, message: string, httpStatus: number, details?: Record<string, unknown> | undefined);
    static fromResponse(status: number, body: unknown): MppError;
}
/** Error wrapper used when seller debit/capture fails. */
export declare class MppCaptureError extends Error {
    captureError?: MppError | undefined;
    constructor(message: string, captureError?: MppError | undefined);
}
/** Error type reserved for local Payment credential verification failures. */
export declare class MppVerificationError extends Error {
    constructor(message: string);
}
