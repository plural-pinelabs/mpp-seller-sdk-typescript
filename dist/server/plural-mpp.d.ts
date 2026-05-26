import { CaptureOptions, CaptureResult, ChallengeResult, ChargeOptions, PluralSellerConfig, ReceiptData, VerificationResult } from "../types";
import { CaptureClient } from "./capture-client";
import { ChallengeGenerator } from "./challenge-generator";
import { CredentialVerifier } from "./credential-verifier";
export declare class PluralMPPInstance {
    private challengeGenerator;
    private credentialVerifier;
    private captureClient;
    constructor(challengeGenerator: ChallengeGenerator, credentialVerifier: CredentialVerifier, captureClient: CaptureClient);
    /** Generate a signed 402 Payment challenge for a protected resource. */
    generateChallenge(options: ChargeOptions): Promise<ChallengeResult>;
    /** Verify `Authorization: Payment <payload>` from the buyer. */
    verifyCredential(authorizationHeader?: string): Promise<VerificationResult>;
    /** Execute a debit against `/mpp/v1/debit` using a one-time payment token. */
    capture(options: CaptureOptions): Promise<CaptureResult>;
    /** Build the `Payment-Receipt` response header for a successful capture. */
    buildReceiptHeader(captureResult: CaptureResult, challengeId: string): string;
    /** Build structured receipt data without encoding it as a header. */
    buildReceiptData(captureResult: CaptureResult, challengeId: string): ReceiptData;
}
export declare class PluralMPP {
    /** Create a seller SDK instance from `PluralSellerConfig`. */
    static create(config: PluralSellerConfig): PluralMPPInstance;
}
