import { GrantexVerificationResult, ServerGrantexConfig } from "../types";
export type { GrantexVerificationResult, GrantexVerifiedGrant, GrantexVerifierLike, ServerGrantexConfig, } from "../types";
export * from "./hosted-client";
/** Verify Grantex grant tokens using the published `@grantex/sdk` package. */
export declare class GrantTokenVerifier {
    private readonly config;
    constructor(config: ServerGrantexConfig);
    verify(token: string): Promise<GrantexVerificationResult>;
}
export declare function hasGrantScope(scopes: readonly string[], requiredScope: string): boolean;
export declare function missingGrantScopes(scopes: readonly string[], requiredScopes?: readonly string[]): string[];
