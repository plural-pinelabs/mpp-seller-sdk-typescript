import { FetchLike, PluralSellerConfig } from "../types";
export declare function requestWithRetry(fetchImpl: FetchLike, url: string, init: RequestInit, config: Pick<PluralSellerConfig, "requestTimeoutMs" | "maxRetries" | "initialRetryDelayMs">): Promise<Response>;
export declare function safeJson(response: Response): Promise<unknown>;
