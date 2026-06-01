import { FetchLike, PluralSellerConfig } from "../types";
export declare class AuthManager {
    private config;
    private baseUrl;
    private fetchImpl;
    private accessToken?;
    private expiresAt;
    constructor(config: PluralSellerConfig, baseUrl: string, fetchImpl: FetchLike);
    /** Return a valid bearer token, reusing cached client-credential tokens where possible. */
    getAccessToken(): Promise<string>;
}
