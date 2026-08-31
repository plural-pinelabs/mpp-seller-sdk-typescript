import {
  CaptureOptions,
  CaptureResult,
  ChallengeResult,
  ChargeOptions,
  CreateMandateRevokeOptions,
  CreateMandateOptions,
  CreatePreAuthorizationOptions,
  CreateRefundOptions,
  GrantexAuthorizationOptions,
  GrantexAuthorizationResult,
  GrantexBudgetAllocationOptions,
  GrantexBudgetAllocationResult,
  GrantexBudgetBalanceResult,
  GrantexBudgetDebitOptions,
  GrantexBudgetDebitResult,
  GrantexBudgetTransactionsOptions,
  GrantexBudgetTransactionsResult,
  GrantexExchangeCodeOptions,
  GrantexExchangeCodeResult,
  Mandate,
  MandateBalanceLookupOptions,
  MandateBalanceResult,
  MandateRevokeResult,
  Order,
  PineLabsOnlineServerConfig,
  PreAuthorization,
  ReceiptContext,
  ReceiptData,
  Refund,
  VerificationResult,
} from "../types";
import { withP3PEnvironmentDefaults } from "../config";
import { createHostedGrantexClient, HostedGrantexClient } from "../grantex";
import { buildReceiptData, buildReceiptHeader } from "../utils/receipt-builder";
import { validateConfig } from "../utils/validation";
import { ApiClient } from "./api-client";
import { CaptureClient } from "./capture-client";
import { ChallengeGenerator } from "./challenge-generator";
import { CredentialVerifier } from "./credential-verifier";

export class PineLabsOnlineP3PInstance {
  constructor(
    private challengeGenerator: ChallengeGenerator,
    private credentialVerifier: CredentialVerifier,
    private captureClient: CaptureClient,
    private apiClient: ApiClient,
    private hostedGrantexClient?: HostedGrantexClient,
  ) {}

  /** Generate a signed 402 Payment challenge for a protected resource. */
  generateChallenge(options: ChargeOptions): Promise<ChallengeResult> {
    return this.challengeGenerator.generate(options);
  }

  /** Verify `P3P-Credential: Payment <payload>` from the client. */
  verifyCredential(credentialHeader?: string): Promise<VerificationResult> {
    return this.credentialVerifier.verify(credentialHeader);
  }

  /** Execute a debit against `/mpp/v1/debit` using a one-time payment token. */
  capture(options: CaptureOptions): Promise<CaptureResult> {
    return this.captureClient.capture(options);
  }

  /** Fetch debit status through `GET /mpp/v1/debit/{id}` using the debit idempotency key. */
  getDebitStatus(idempotencyKey: string): Promise<CaptureResult> {
    return this.captureClient.getDebitStatus(idempotencyKey);
  }

  /** Create a mandate/pre-authorization through `POST /mpp/v1/pre-authorize`. */
  createMandate(options: CreateMandateOptions): Promise<Mandate> {
    return this.apiClient.createMandate(options);
  }

  /** Create a card/mandate pre-authorization through `POST /mpp/v1/pre-authorize`. */
  createPreAuthorization(options: CreatePreAuthorizationOptions): Promise<PreAuthorization> {
    return this.apiClient.createPreAuthorization(options);
  }

  /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
  getMandate(mandateId: string): Promise<Mandate> {
    return this.apiClient.getMandate(mandateId);
  }

  /** Retrieve an order by its Pine Labs order ID. */
  getOrder(orderId: string): Promise<Order> {
    return this.apiClient.getOrder(orderId);
  }

  /** Initiate a refund against a processed Pine Labs order. */
  createRefund(orderId: string, options: CreateRefundOptions): Promise<Refund> {
    return this.apiClient.createRefund(orderId, options);
  }

  /** Fetch mandate balance/authorization status through `GET /mpp/v1/balance`. */
  getMandateBalance(options: MandateBalanceLookupOptions): Promise<MandateBalanceResult> {
    return this.apiClient.getMandateBalance(options);
  }

  /** Create a mandate revoke request through `POST /mpp/v1/revoke`. */
  revokeMandate(options: CreateMandateRevokeOptions): Promise<MandateRevokeResult> {
    return this.apiClient.revokeMandate(options);
  }

  /** Create a hosted Grantex authorization request and return its consent URL. */
  createGrantexAuthorization(options: GrantexAuthorizationOptions): Promise<GrantexAuthorizationResult> {
    return this.requireHostedGrantex().createAuthorization(options);
  }

  /** Exchange a hosted Grantex callback code for a user grant token. */
  exchangeGrantexCode(options: GrantexExchangeCodeOptions): Promise<GrantexExchangeCodeResult> {
    return this.requireHostedGrantex().exchangeCode(options);
  }

  /** Allocate a hosted Grantex grant-level budget. */
  allocateGrantexBudget(options: GrantexBudgetAllocationOptions): Promise<GrantexBudgetAllocationResult> {
    return this.requireHostedGrantex().allocateBudget(options);
  }

  /** Debit a hosted Grantex grant-level budget. */
  debitGrantexBudget(options: GrantexBudgetDebitOptions): Promise<GrantexBudgetDebitResult> {
    return this.requireHostedGrantex().debitBudget(options);
  }

  /** Fetch hosted Grantex grant-level budget balance. */
  getGrantexBudgetBalance(grantId: string): Promise<GrantexBudgetBalanceResult> {
    return this.requireHostedGrantex().getBudgetBalance(grantId);
  }

  /** List hosted Grantex grant-level budget transactions. */
  listGrantexBudgetTransactions(grantId: string, options?: GrantexBudgetTransactionsOptions): Promise<GrantexBudgetTransactionsResult> {
    return this.requireHostedGrantex().listBudgetTransactions(grantId, options);
  }

  /** Build the `Payment-Receipt` response header for a successful capture. */
  buildReceiptHeader(captureResult: CaptureResult, challengeId: string, context: ReceiptContext = {}): string {
    return buildReceiptHeader(captureResult, challengeId, context);
  }

  /** Build structured receipt data without encoding it as a header. */
  buildReceiptData(captureResult: CaptureResult, challengeId: string, context: ReceiptContext = {}): ReceiptData {
    return buildReceiptData(captureResult, challengeId, context);
  }

  private requireHostedGrantex(): HostedGrantexClient {
    if (!this.hostedGrantexClient) {
      throw new Error("PineLabsOnlineServerConfig: grantex.hosted is required");
    }
    return this.hostedGrantexClient;
  }
}

export class PineLabsOnlineP3P {
  /** Create a server SDK instance from `PineLabsOnlineServerConfig`. */
  static create(config: PineLabsOnlineServerConfig): PineLabsOnlineP3PInstance {
    validateConfig(config);
    const resolvedConfig = withP3PEnvironmentDefaults(config);
    return new PineLabsOnlineP3PInstance(
      new ChallengeGenerator(resolvedConfig),
      new CredentialVerifier(resolvedConfig),
      new CaptureClient(resolvedConfig),
      new ApiClient(resolvedConfig),
      resolvedConfig.grantex?.hosted ? createHostedGrantexClient(resolvedConfig.grantex.hosted) : undefined,
    );
  }
}
