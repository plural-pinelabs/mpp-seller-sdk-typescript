import { FetchLike, PineLabsOnlineServerConfig } from "../types";
export declare function requestWithRetry(fetchImpl: FetchLike, url: string, init: RequestInit, config: Pick<PineLabsOnlineServerConfig, "requestTimeoutMs" | "maxRetries" | "initialRetryDelayMs">): Promise<Response>;
export declare function safeJson(response: Response): Promise<unknown>;
export declare function resolveRetryAfterDelayMs(retryAfter: string | null | undefined): number | undefined;
