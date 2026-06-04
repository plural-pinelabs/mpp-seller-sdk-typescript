import { CaptureOptions, CaptureResult, PineLabsOnlineServerConfig } from "../types";
export declare class CaptureClient {
    private config;
    private readonly baseUrl;
    private readonly fetchImpl;
    private readonly auth;
    constructor(config: PineLabsOnlineServerConfig);
    /** Call `/mpp/v1/debit` with idempotency headers. */
    capture(options: CaptureOptions): Promise<CaptureResult>;
}
