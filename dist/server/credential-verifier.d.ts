import { PineLabsOnlineServerConfig, VerificationResult } from "../types";
export declare class CredentialVerifier {
    private readonly secretKey;
    private readonly realm;
    private readonly availablePaymentMethods;
    constructor(config: PineLabsOnlineServerConfig);
    /** Decode and validate a `P3P-Credential: Payment <payload>` header value. */
    verify(credentialHeader?: string): Promise<VerificationResult>;
}
