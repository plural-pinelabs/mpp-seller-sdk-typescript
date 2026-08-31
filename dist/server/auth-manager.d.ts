import { FetchLike, PineLabsOnlineServerConfig } from "../types";
export declare class AuthManager {
    private config;
    private baseUrl;
    private fetchImpl;
    private accessToken?;
    private expiresAt;
    private refreshPromise?;
    constructor(config: PineLabsOnlineServerConfig, baseUrl: string, fetchImpl: FetchLike);
    /** Return a valid bearer token, reusing cached client-credential tokens where possible. */
    getAccessToken(): Promise<string>;
    private exchangeToken;
}
