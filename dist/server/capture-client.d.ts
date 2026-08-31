import { CaptureOptions, CaptureResult, PineLabsOnlineServerConfig } from "../types";
export declare class CaptureClient {
    private config;
    private readonly baseUrl;
    private readonly fetchImpl;
    private readonly auth;
    constructor(config: PineLabsOnlineServerConfig);
    /** Call `/mpp/v1/debit` with idempotency headers. */
    capture(options: CaptureOptions): Promise<CaptureResult>;
    /**
     * Resolve an in-flight async debit by polling `GET /mpp/v1/debit/{id}` up to
     * `maxPolls` times, waiting `delayMs` between polls, until the debit reaches a
     * terminal (non-pending) status. Returns the resolved `CaptureResult`, or
     * `undefined` when it is still pending after the budget is exhausted (or when
     * `maxPolls <= 0`).
     *
     * This never re-POSTs the debit and never throws: a transient status-check
     * failure simply ends polling and lets the caller resolve the pending debit
     * out-of-band (e.g. via a later `getDebitStatus` call), which is strictly safer
     * than resubmitting the debit.
     */
    private pollDebitStatus;
    /** Fetch the latest debit status through `GET /mpp/v1/debit/{id}`. */
    getDebitStatus(idempotencyKey: string): Promise<CaptureResult>;
}
export declare function isPendingDebitStatus(status: unknown): boolean;
