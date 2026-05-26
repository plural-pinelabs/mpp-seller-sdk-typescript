import { CaptureOptions, CaptureResult, ChallengeResult, ChargeOptions, PluralSellerConfig, ReceiptData, VerificationResult } from "../types";
import { buildReceiptData, buildReceiptHeader } from "../utils/receipt-builder";
import { validateConfig } from "../utils/validation";
import { CaptureClient } from "./capture-client";
import { ChallengeGenerator } from "./challenge-generator";
import { CredentialVerifier } from "./credential-verifier";

export class PluralMPPInstance {
  constructor(
    private challengeGenerator: ChallengeGenerator,
    private credentialVerifier: CredentialVerifier,
    private captureClient: CaptureClient,
  ) {}

  /** Generate a signed 402 Payment challenge for a protected resource. */
  generateChallenge(options: ChargeOptions): Promise<ChallengeResult> {
    return this.challengeGenerator.generate(options);
  }

  /** Verify `Authorization: Payment <payload>` from the buyer. */
  verifyCredential(authorizationHeader?: string): Promise<VerificationResult> {
    return this.credentialVerifier.verify(authorizationHeader);
  }

  /** Execute a debit against `/mpp/v1/debit` using a one-time payment token. */
  capture(options: CaptureOptions): Promise<CaptureResult> {
    return this.captureClient.capture(options);
  }

  /** Build the `Payment-Receipt` response header for a successful capture. */
  buildReceiptHeader(captureResult: CaptureResult, challengeId: string): string {
    return buildReceiptHeader(captureResult, challengeId);
  }

  /** Build structured receipt data without encoding it as a header. */
  buildReceiptData(captureResult: CaptureResult, challengeId: string): ReceiptData {
    return buildReceiptData(captureResult, challengeId);
  }
}

export class PluralMPP {
  /** Create a seller SDK instance from `PluralSellerConfig`. */
  static create(config: PluralSellerConfig): PluralMPPInstance {
    validateConfig(config);
    return new PluralMPPInstance(
      new ChallengeGenerator(config),
      new CredentialVerifier(config),
      new CaptureClient(config),
    );
  }
}
