import { PluralSellerConfig, VerificationResult } from "../types";
export declare class CredentialVerifier {
    private readonly secretKey;
    private readonly realm;
    constructor(config: PluralSellerConfig);
    /** Decode and validate an `Authorization: Payment <payload>` header. */
    verify(authorizationHeader?: string): Promise<VerificationResult>;
}
