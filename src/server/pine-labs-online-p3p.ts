import {
  CaptureOptions,
  CaptureResult,
  ChallengeResult,
  ChargeOptions,
  CreateMandateOptions,
  Mandate,
  PineLabsOnlineServerConfig,
  ReceiptContext,
  ReceiptData,
  VerificationResult,
} from "../types";
import { withP3PEnvironmentDefaults } from "../config";
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

  /** Create a mandate/pre-authorization through `POST /mpp/v1/pre-authorize`. */
  createMandate(options: CreateMandateOptions): Promise<Mandate> {
    return this.apiClient.createMandate(options);
  }

  /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
  getMandate(mandateId: string): Promise<Mandate> {
    return this.apiClient.getMandate(mandateId);
  }

  /** Build the `Payment-Receipt` response header for a successful capture. */
  buildReceiptHeader(captureResult: CaptureResult, challengeId: string, context: ReceiptContext = {}): string {
    return buildReceiptHeader(captureResult, challengeId, context);
  }

  /** Build structured receipt data without encoding it as a header. */
  buildReceiptData(captureResult: CaptureResult, challengeId: string, context: ReceiptContext = {}): ReceiptData {
    return buildReceiptData(captureResult, challengeId, context);
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
    );
  }
}
