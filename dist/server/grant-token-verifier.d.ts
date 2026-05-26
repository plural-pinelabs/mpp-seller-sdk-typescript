import { FetchLike, GrantVerificationResult, SellerGrantexConfig } from "../types";
export declare class GrantTokenVerifier {
    private config;
    private readonly jwksUrl;
    private readonly cacheTtlMs;
    private readonly requiredScopes;
    private readonly fetchImpl;
    private jwks?;
    private cacheExpiresAt;
    constructor(config: SellerGrantexConfig, fetchImpl?: FetchLike);
    /** Verify signature, expiry, required claims, and configured required scopes. */
    verify(grantToken: string): Promise<GrantVerificationResult>;
    private validateClaims;
    private getSigningKey;
    private getJwks;
}
