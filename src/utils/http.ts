import { FetchLike, PineLabsOnlineServerConfig } from "../types";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 500;

export async function requestWithRetry(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  config: Pick<PineLabsOnlineServerConfig, "requestTimeoutMs" | "maxRetries" | "initialRetryDelayMs">,
): Promise<Response> {
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchImpl(url, withTimeout(init, config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS));
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        await sleep(retryDelayMs(attempt, config.initialRetryDelayMs ?? DEFAULT_INITIAL_RETRY_DELAY_MS, response));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(retryDelayMs(attempt, config.initialRetryDelayMs ?? DEFAULT_INITIAL_RETRY_DELAY_MS));
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("P3P request failed");
}

export async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function resolveRetryAfterDelayMs(retryAfter: string | null | undefined): number | undefined {
  if (!retryAfter) {
    return undefined;
  }
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }
  return undefined;
}

function withTimeout(init: RequestInit, timeoutMs: number): RequestInit {
  if (init.signal || typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") {
    return init;
  }
  return { ...init, signal: AbortSignal.timeout(timeoutMs) };
}

function retryDelayMs(attempt: number, initialMs: number, response?: Response): number {
  const retryAfterMs = resolveRetryAfterDelayMs(response?.headers.get("Retry-After"));
  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }
  return initialMs * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
