import { CaptureOptions, CaptureResult, PluralSellerConfig } from "../types";
export declare class CaptureClient {
    private config;
    private readonly baseUrl;
    private readonly fetchImpl;
    private readonly auth;
    constructor(config: PluralSellerConfig);
    /** Call `/mpp/v1/debit` with idempotency and request-hash headers. */
    capture(options: CaptureOptions): Promise<CaptureResult>;
}
