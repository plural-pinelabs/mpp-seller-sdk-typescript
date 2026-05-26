import { FetchLike, PluralSellerConfig } from "../types";
export declare class AuthManager {
    private config;
    private baseUrl;
    private fetchImpl;
    private accessToken?;
    private expiresAt;
    private readonly staticAccessToken?;
    constructor(config: PluralSellerConfig, baseUrl: string, fetchImpl: FetchLike);
    /** Return a valid bearer token, reusing cached/static tokens where possible. */
    getAccessToken(): Promise<string>;
}
