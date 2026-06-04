import { CaptureOptions, CaptureResult, ChallengeResult, ChargeOptions, CreateMandateOptions, Mandate, PineLabsOnlineServerConfig, ReceiptContext, ReceiptData, VerificationResult } from "../types";
import { ApiClient } from "./api-client";
import { CaptureClient } from "./capture-client";
import { ChallengeGenerator } from "./challenge-generator";
import { CredentialVerifier } from "./credential-verifier";
export declare class PineLabsOnlineP3PInstance {
    private challengeGenerator;
    private credentialVerifier;
    private captureClient;
    private apiClient;
    constructor(challengeGenerator: ChallengeGenerator, credentialVerifier: CredentialVerifier, captureClient: CaptureClient, apiClient: ApiClient);
    /** Generate a signed 402 Payment challenge for a protected resource. */
    generateChallenge(options: ChargeOptions): Promise<ChallengeResult>;
    /** Verify `P3P-Credential: Payment <payload>` from the client. */
    verifyCredential(credentialHeader?: string): Promise<VerificationResult>;
    /** Execute a debit against `/mpp/v1/debit` using a one-time payment token. */
    capture(options: CaptureOptions): Promise<CaptureResult>;
    /** Create a mandate/pre-authorization through `POST /mpp/v1/pre-authorize`. */
    createMandate(options: CreateMandateOptions): Promise<Mandate>;
    /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
    getMandate(mandateId: string): Promise<Mandate>;
    /** Build the `Payment-Receipt` response header for a successful capture. */
    buildReceiptHeader(captureResult: CaptureResult, challengeId: string, context?: ReceiptContext): string;
    /** Build structured receipt data without encoding it as a header. */
    buildReceiptData(captureResult: CaptureResult, challengeId: string, context?: ReceiptContext): ReceiptData;
}
export declare class PineLabsOnlineP3P {
    /** Create a server SDK instance from `PineLabsOnlineServerConfig`. */
    static create(config: PineLabsOnlineServerConfig): PineLabsOnlineP3PInstance;
}
