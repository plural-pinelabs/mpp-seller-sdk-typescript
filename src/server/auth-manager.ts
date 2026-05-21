import { FetchLike, MppError, PluralSellerConfig } from "../types";
import { requestWithRetry, safeJson } from "../utils/http";
import { asRecord } from "../utils/parsers";

export class AuthManager {
  private accessToken?: string;
  private expiresAt = 0;
  private readonly staticAccessToken?: string;

  constructor(
    private config: PluralSellerConfig,
    private baseUrl: string,
    private fetchImpl: FetchLike,
  ) {
    this.staticAccessToken = normalizeAccessToken(config.accessToken);
  }

  /** Return a valid bearer token, reusing cached/static tokens where possible. */
  async getAccessToken(): Promise<string> {
    if (this.staticAccessToken) {
      return this.staticAccessToken;
    }
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) {
      return this.accessToken;
    }
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
      throw MppError.fromResponse(response.status, await safeJson(response));
    }
    const payload = asRecord(await response.json()) ?? {};
    const data = asRecord(payload.data) ?? payload;
    this.accessToken = String(data.access_token ?? "");
    if (!this.accessToken) {
      throw new MppError("MPP_AUTHENTICATION_FAILED", "Token exchange response missing access_token", response.status);
    }
    this.expiresAt = data.expires_at
      ? Date.parse(String(data.expires_at))
      : Date.now() + Number(data.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }
}

function normalizeAccessToken(accessToken?: string): string | undefined {
  const token = accessToken?.trim();
  if (!token) {
    return undefined;
  }
  return token.toLowerCase().startsWith("bearer ") ? token.slice(7).trim() : token;
}

function stripSlash(value: string): string {
  return value.replace(/\/$/, "");
}
