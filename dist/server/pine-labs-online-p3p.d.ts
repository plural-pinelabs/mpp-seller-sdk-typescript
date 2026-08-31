import { CaptureOptions, CaptureResult, ChallengeResult, ChargeOptions, CreateMandateRevokeOptions, CreateMandateOptions, CreatePreAuthorizationOptions, CreateRefundOptions, GrantexAuthorizationOptions, GrantexAuthorizationResult, GrantexBudgetAllocationOptions, GrantexBudgetAllocationResult, GrantexBudgetBalanceResult, GrantexBudgetDebitOptions, GrantexBudgetDebitResult, GrantexBudgetTransactionsOptions, GrantexBudgetTransactionsResult, GrantexExchangeCodeOptions, GrantexExchangeCodeResult, Mandate, MandateBalanceLookupOptions, MandateBalanceResult, MandateRevokeResult, Order, PineLabsOnlineServerConfig, PreAuthorization, ReceiptContext, ReceiptData, Refund, VerificationResult } from "../types";
import { HostedGrantexClient } from "../grantex";
import { ApiClient } from "./api-client";
import { CaptureClient } from "./capture-client";
import { ChallengeGenerator } from "./challenge-generator";
import { CredentialVerifier } from "./credential-verifier";
export declare class PineLabsOnlineP3PInstance {
    private challengeGenerator;
    private credentialVerifier;
    private captureClient;
    private apiClient;
    private hostedGrantexClient?;
    constructor(challengeGenerator: ChallengeGenerator, credentialVerifier: CredentialVerifier, captureClient: CaptureClient, apiClient: ApiClient, hostedGrantexClient?: HostedGrantexClient | undefined);
    /** Generate a signed 402 Payment challenge for a protected resource. */
    generateChallenge(options: ChargeOptions): Promise<ChallengeResult>;
    /** Verify `P3P-Credential: Payment <payload>` from the client. */
    verifyCredential(credentialHeader?: string): Promise<VerificationResult>;
    /** Execute a debit against `/mpp/v1/debit` using a one-time payment token. */
    capture(options: CaptureOptions): Promise<CaptureResult>;
    /** Fetch debit status through `GET /mpp/v1/debit/{id}` using the debit idempotency key. */
    getDebitStatus(idempotencyKey: string): Promise<CaptureResult>;
    /** Create a mandate/pre-authorization through `POST /mpp/v1/pre-authorize`. */
    createMandate(options: CreateMandateOptions): Promise<Mandate>;
    /** Create a card/mandate pre-authorization through `POST /mpp/v1/pre-authorize`. */
    createPreAuthorization(options: CreatePreAuthorizationOptions): Promise<PreAuthorization>;
    /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
    getMandate(mandateId: string): Promise<Mandate>;
    /** Retrieve an order by its Pine Labs order ID. */
    getOrder(orderId: string): Promise<Order>;
    /** Initiate a refund against a processed Pine Labs order. */
    createRefund(orderId: string, options: CreateRefundOptions): Promise<Refund>;
    /** Fetch mandate balance/authorization status through `GET /mpp/v1/balance`. */
    getMandateBalance(options: MandateBalanceLookupOptions): Promise<MandateBalanceResult>;
    /** Create a mandate revoke request through `POST /mpp/v1/revoke`. */
    revokeMandate(options: CreateMandateRevokeOptions): Promise<MandateRevokeResult>;
    /** Create a hosted Grantex authorization request and return its consent URL. */
    createGrantexAuthorization(options: GrantexAuthorizationOptions): Promise<GrantexAuthorizationResult>;
    /** Exchange a hosted Grantex callback code for a user grant token. */
    exchangeGrantexCode(options: GrantexExchangeCodeOptions): Promise<GrantexExchangeCodeResult>;
    /** Allocate a hosted Grantex grant-level budget. */
    allocateGrantexBudget(options: GrantexBudgetAllocationOptions): Promise<GrantexBudgetAllocationResult>;
    /** Debit a hosted Grantex grant-level budget. */
    debitGrantexBudget(options: GrantexBudgetDebitOptions): Promise<GrantexBudgetDebitResult>;
    /** Fetch hosted Grantex grant-level budget balance. */
    getGrantexBudgetBalance(grantId: string): Promise<GrantexBudgetBalanceResult>;
    /** List hosted Grantex grant-level budget transactions. */
    listGrantexBudgetTransactions(grantId: string, options?: GrantexBudgetTransactionsOptions): Promise<GrantexBudgetTransactionsResult>;
    /** Build the `Payment-Receipt` response header for a successful capture. */
    buildReceiptHeader(captureResult: CaptureResult, challengeId: string, context?: ReceiptContext): string;
    /** Build structured receipt data without encoding it as a header. */
    buildReceiptData(captureResult: CaptureResult, challengeId: string, context?: ReceiptContext): ReceiptData;
    private requireHostedGrantex;
}
export declare class PineLabsOnlineP3P {
    /** Create a server SDK instance from `PineLabsOnlineServerConfig`. */
    static create(config: PineLabsOnlineServerConfig): PineLabsOnlineP3PInstance;
}
