import { FetchLike, P3PError, PineLabsOnlineServerConfig } from "../types";
import { requestWithRetry, safeJson } from "../utils/http";
import { asRecord } from "../utils/parsers";

export class AuthManager {
  private accessToken?: string;
  private expiresAt = 0;
  private refreshPromise?: Promise<string>;

  constructor(
    private config: PineLabsOnlineServerConfig,
    private baseUrl: string,
    private fetchImpl: FetchLike,
  ) {}

  /** Return a valid bearer token, reusing cached client-credential tokens where possible. */
  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) {
      return this.accessToken;
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.exchangeToken();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = undefined;
    }
  }

  private async exchangeToken(): Promise<string> {
    const response = await requestWithRetry(this.fetchImpl, `${stripSlash(this.baseUrl)}/api/auth/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    }, this.config);
    if (!response.ok) {
      throw P3PError.fromResponse(response.status, await safeJson(response));
    }
    const payload = asRecord(await response.json()) ?? {};
    const data = asRecord(payload.data) ?? payload;
    this.accessToken = String(data.access_token ?? "");
    if (!this.accessToken) {
      throw new P3PError("MPP_AUTHENTICATION_FAILED", "Token exchange response missing access_token", response.status);
    }
    this.expiresAt = data.expires_at
      ? Date.parse(String(data.expires_at))
      : Date.now() + Number(data.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }
}

function stripSlash(value: string): string {
  return value.replace(/\/$/, "");
}
