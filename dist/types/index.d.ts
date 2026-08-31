import type { P3PEnvironmentValue } from "../config";
export * from "./orders";
/** Fetch-compatible function used by the server SDK in Node, tests, workers, or custom runtimes. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export declare const PAYMENT_CREDENTIAL_HEADER = "P3P-Credential";
export declare const PAYMENT_HEADER_PREFIX = "Payment ";
export declare const PAYMENT_RECEIPT_PREFIX = "Payment ";
export declare const GRANTEX_TOKEN_HEADER = "X-Grantex-Token";
/** Payment gateway enum retained for capture/receipt context. */
export declare enum PaymentGateway {
    PineLabsOnline = "PINE LABS ONLINE"
}
/** Payment methods supported by the current P3P service payload contract. */
export declare enum PaymentMethod {
    RESERVE_PAY = "RESERVE_PAY",
    OTM = "OTM",
    CARD = "CARD",
    CREDIT_EMI = "CREDIT_EMI",
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
/** Normalized Grantex grant returned after delegated authorization verification. */
export interface GrantexVerifiedGrant {
    tokenId: string;
    grantId: string;
    principalId: string;
    agentDid: string;
    developerId: string;
    scopes: string[];
    issuedAt: number;
    expiresAt: number;
    parentAgentDid?: string;
    parentGrantId?: string;
    delegationDepth?: number;
}
export interface GrantexVerificationResult {
    valid: boolean;
    grant?: GrantexVerifiedGrant;
    error?: string;
}
export interface GrantexVerifierLike {
    verify(token: string): Promise<GrantexVerificationResult>;
}
export interface HostedGrantexSdkFactory {
    (): Promise<unknown> | unknown;
}
export interface HostedGrantexConfig {
    /** Merchant/server Grantex API key. Required when `enforceGrant` is true. */
    apiKey: string;
    /** Hosted Grantex base URL. Defaults to `https://api.grantex.dev`. */
    baseUrl?: string;
    /** HTTP timeout passed to the Grantex SDK. */
    timeoutMs?: number;
    /** Retry count passed to the Grantex SDK. */
    maxRetries?: number;
    /** Test hook for injecting a fake hosted Grantex SDK client. */
    sdkFactory?: HostedGrantexSdkFactory;
}
export interface ServerGrantexConfig {
    /** Published Grantex JWKS URL. Alias: `jwksUrl`. */
    jwksUri?: string;
    /** Compatibility alias for `jwksUri`. */
    jwksUrl?: string;
    /** Required scopes. Wildcards such as `mpp:*` and `mpp:payment:*` are honored. */
    requiredScopes?: string[];
    /** Expected issuer URL passed through to Grantex verification. */
    issuer?: string;
    /** DID-web issuer shortcut supported by the published Grantex SDK. */
    issuerDid?: string;
    /** Optional JWT audience. */
    audience?: string;
    /** Optional expected agent DID; must match the grant `agt` claim. */
    agentId?: string;
    /** Optional clock tolerance in seconds. */
    clockTolerance?: number;
    /** When true, missing/invalid grants return 403 before capture. Defaults to false. */
    enforceGrant?: boolean;
    /** Hosted Grantex API config for authorization and budget enforcement. */
    hosted?: HostedGrantexConfig;
    /** Enable hosted Grantex budget enforcement: check before 402, debit after successful capture. Defaults to true. */
    debitBudgetBeforeChallenge?: boolean;
    /** Test/advanced hook; defaults to the published `@grantex/sdk` verifier. */
    verifier?: GrantexVerifierLike;
}
export interface GrantexAuthorizationOptions {
    userId: string;
    agentId: string;
    scopes: string[];
    redirectUri?: string;
    expiresIn?: string | number;
    codeChallenge?: string;
    codeChallengeMethod?: string;
}
export interface GrantexAuthorizationResult {
    authRequestId: string;
    consentUrl: string;
    agentId: string;
    principalId: string;
    scopes: string[];
    expiresAt?: string;
    status?: string;
    raw: Record<string, unknown>;
}
export interface GrantexExchangeCodeOptions {
    code: string;
    agentId: string;
    codeVerifier?: string;
    credentialFormat?: string;
}
export interface GrantexExchangeCodeResult {
    grantToken: string;
    grantId: string;
    refreshToken?: string;
    scopes: string[];
    expiresAt?: string;
    raw: Record<string, unknown>;
}
export interface GrantexBudgetAllocationOptions {
    grantId: string;
    /** Grantex-native major-unit amount, e.g. 50 for Rs 50. P3P paise values must be divided by 100 before calling this helper. */
    initialBudget: number;
    currency?: string;
}
export interface GrantexBudgetAllocationResult {
    id: string;
    grantId: string;
    initialBudget: number;
    remainingBudget: number;
    currency: string;
    createdAt?: string;
    raw: Record<string, unknown>;
}
export interface GrantexBudgetDebitOptions {
    grantId: string;
    /** Grantex-native major-unit amount, e.g. 1.5 for Rs 1.50. P3P paise values must be divided by 100 before calling this helper. */
    amount: number;
    description?: string;
    metadata?: Record<string, unknown>;
}
export interface GrantexBudgetDebitResult {
    grantId: string;
    remaining: number;
    transactionId?: string;
    raw: Record<string, unknown>;
}
export interface GrantexBudgetBalanceResult {
    id: string;
    grantId: string;
    initialBudget: number;
    remainingBudget: number;
    currency: string;
    createdAt?: string;
    raw: Record<string, unknown>;
}
export interface GrantexBudgetTransaction {
    id: string;
    grantId: string;
    amount: number;
    description?: string;
    balanceAfter?: number;
    createdAt?: string;
    raw: Record<string, unknown>;
}
export interface GrantexBudgetTransactionsOptions {
    limit?: number;
    cursor?: string;
}
export interface GrantexBudgetTransactionsResult {
    total?: number;
    transactions: GrantexBudgetTransaction[];
    raw: Record<string, unknown>;
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
    /** Optional delegated authorization enforcement using published Grantex verification. */
    grantex?: ServerGrantexConfig;
}
/** Input for server/server-side mandate creation via `POST /mpp/v1/pre-authorize`. */
export interface CreateMandateOptions {
    /** Client mobile number required by the mobile-only pre-authorization contract; accepts E.164 or local 10-digit format. */
    mobileNumber?: string;
    /** Mandate/pre-authorization amount in minor units. */
    amount: Amount;
    /** Legacy customer reference retained for compatibility; current pre-authorization flow uses `mobileNumber`. */
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
    /** Optional payment-method-specific options passed through to `payment_method_options`. */
    paymentMethodOptions?: Record<string, unknown>;
    /** Snake-case compatibility alias for `paymentMethodOptions`. */
    payment_method_options?: Record<string, unknown>;
    /** Optional merchant metadata passed as a string-valued `merchant_metadata` map. Structured values are compact JSON. */
    merchantMetadata?: Record<string, unknown>;
    /** Snake-case compatibility alias for `merchantMetadata`. */
    merchant_metadata?: Record<string, unknown>;
    /** Optional authorization validity period in days. Omitted when not provided. */
    validityInDays?: number;
}
/** Input for card/mandate pre-authorization via `POST /mpp/v1/pre-authorize`. */
export interface CreatePreAuthorizationOptions extends CreateMandateOptions {
}
export interface PreAuthorizationCustomer {
    customer_id?: string;
    merchant_customer_reference?: string;
    mobile_number: string;
}
/** Contract-shaped pre-authorization response returned by `POST /mpp/v1/pre-authorize`. */
export interface PreAuthorization {
    payment_method: PaymentMethod;
    payment_method_reference_id: string;
    customer: PreAuthorizationCustomer;
    challenge_url?: string;
    redirect_url?: string;
    status: string;
    amount: Amount;
    validity_in_days?: number;
    expiry_at?: string;
    raw: Record<string, unknown>;
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
export interface MandateBalanceLookupOptions {
    authorizationId?: string;
    phoneNumber?: string;
    paymentMethod: PaymentMethod;
}
export interface MandateBalanceCustomer {
    mobile_number: string;
    merchant_customer_reference?: string;
    bank_account_number?: string;
}
export interface MandateBalanceDetails {
    amount_debited: Amount;
    amount_remaining: Amount;
}
export interface MandateBalanceResult {
    payment_method: PaymentMethod;
    payment_method_reference_id: string;
    merchant_id: string;
    customer: MandateBalanceCustomer;
    status: string;
    amount?: Amount;
    description?: string;
    validity_in_days?: number;
    expiry_at?: string;
    challenge_url?: string;
    external_reference_id?: string;
    created_at?: string;
    balance_details?: MandateBalanceDetails;
    raw: Record<string, unknown>;
}
export interface RevokeMandateCustomerLookup {
    merchantCustomerReference?: string;
    mobileNumber?: string;
}
export interface CreateMandateRevokeOptions {
    paymentMethod: PaymentMethod;
    paymentMethodReferenceId?: string;
    customer?: RevokeMandateCustomerLookup;
}
export interface MandateRevokeResult {
    payment_method: PaymentMethod;
    payment_method_reference_id: string;
    revoke_reference_id: string;
    status: string;
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
    payment_method_reference_id?: string;
    /** @deprecated Current debit flow is mobile-only and no longer parses this field. */
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
    /** Optional metadata; may include `payment_method_reference_id` when not passed directly. */
    metadata?: Record<string, string>;
    /** Optional idempotency key for `/mpp/v1/debit`. Generated when absent. */
    idempotencyKey?: string;
    /** Authorization/mandate id sent as `payment_method_reference_id` to `/mpp/v1/debit` when available. */
    paymentMethodReferenceId?: string;
    /** P3P payment method sent as the `/mpp/v1/debit` payload `type`. */
    paymentMethod: PaymentMethod;
    /** @deprecated Current debit flow is mobile-only and no longer requires customer reference. */
    customerReference?: string;
    /** Client mobile number sent as `customer.mobile_number` to `/mpp/v1/debit`. */
    mobileNumber?: string;
    /** Server challenge id associated with this debit, sent as `challenge_id`. */
    challengeId?: string;
}
/** Raw debit/capture response from the P3P service with SDK context fields attached. */
export interface CaptureResult extends Record<string, unknown> {
    payment_gateway?: PaymentGateway;
    payment_method?: PaymentMethod;
    status?: string;
    idempotencyKey?: string;
    pending?: boolean;
    message?: string;
    retryAfter?: number;
}
export declare const PENDING_DEBIT_STATUSES: readonly ["PENDING", "CREATED", "OMS_PAYMENT_SUBMITTED", "PROCESSING"];
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
    settlement?: Settlement;
}
/** Optional payment context encoded into a `Payment-Receipt` header. */
export interface ReceiptContext {
    paymentGateway?: PaymentGateway;
    paymentMethod?: PaymentMethod;
}
/** Decision returned by server middleware helpers for a paid-resource request. */
export interface PaymentDecision {
    /** Adapter action: challenge, reject, grant failure, pending, capture error, or proceed. */
    action: "challenge" | "invalid" | "grant_required" | "grant_invalid" | "failed" | "pending" | "error" | "proceed";
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
    /** Verified or failed Grantex grant decision, when configured. */
    grantResult?: GrantexVerificationResult;
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
