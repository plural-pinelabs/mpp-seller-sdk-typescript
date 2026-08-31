import {
  GrantexVerificationResult,
  GrantexVerifiedGrant,
  ServerGrantexConfig,
} from "../types";
import { resolveHostedGrantexBaseUrl } from "./hosted-client";

export type {
  GrantexVerificationResult,
  GrantexVerifiedGrant,
  GrantexVerifierLike,
  ServerGrantexConfig,
} from "../types";
export * from "./hosted-client";

type GrantexSdkModule = {
  verifyGrantToken(token: string, options: {
    jwksUri: string;
    issuer?: string;
    issuerDid?: string;
    audience?: string;
    clockTolerance?: number;
  }): Promise<unknown>;
};

type PublishedVerifiedGrant = {
  tokenId?: unknown;
  grantId?: unknown;
  principalId?: unknown;
  agentDid?: unknown;
  developerId?: unknown;
  scopes?: unknown;
  issuedAt?: unknown;
  expiresAt?: unknown;
  parentAgentDid?: unknown;
  parentGrantId?: unknown;
  delegationDepth?: unknown;
};

/** Verify Grantex grant tokens using the published `@grantex/sdk` package. */
export class GrantTokenVerifier {
  constructor(private readonly config: ServerGrantexConfig) {}

  async verify(token: string): Promise<GrantexVerificationResult> {
    try {
      const trimmed = token.trim();
      if (!trimmed) {
        return { valid: false, error: "Missing grant token" };
      }
      if (this.config.verifier) {
        return postValidateGrant(await this.config.verifier.verify(trimmed), this.config);
      }

      const jwksUri = resolveJwksUri(this.config);
      if (!jwksUri) {
        return { valid: false, error: "ServerGrantexConfig: jwksUri or jwksUrl is required" };
      }

      if (!isHttpsUrl(jwksUri)) {
        return { valid: false, error: "ServerGrantexConfig: jwksUri must use HTTPS" };
      }

      const sdk = await loadGrantexSdk();
      const grant = normalizeGrant(await sdk.verifyGrantToken(trimmed, {
        jwksUri,
        issuer: this.config.issuer,
        issuerDid: this.config.issuerDid,
        audience: this.config.audience,
        clockTolerance: this.config.clockTolerance,
      }));
      return postValidateGrant({ valid: true, grant }, this.config);
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export function hasGrantScope(scopes: readonly string[], requiredScope: string): boolean {
  return scopes.some((scope) => scopeCovers(scope, requiredScope));
}

export function missingGrantScopes(scopes: readonly string[], requiredScopes: readonly string[] = []): string[] {
  return requiredScopes.filter((scope) => !hasGrantScope(scopes, scope));
}

function postValidateGrant(result: GrantexVerificationResult, config: ServerGrantexConfig): GrantexVerificationResult {
  if (!result.valid || !result.grant) {
    return result;
  }
  if (config.agentId && result.grant.agentDid !== config.agentId) {
    return {
      valid: false,
      grant: result.grant,
      error: `Grant agent mismatch. Expected "${config.agentId}", got "${result.grant.agentDid}"`,
    };
  }
  const missing = missingGrantScopes(result.grant.scopes, config.requiredScopes);
  if (missing.length > 0) {
    return {
      valid: false,
      grant: result.grant,
      error: `Grant token is missing required scopes: ${missing.join(", ")}`,
    };
  }
  return result;
}

function resolveJwksUri(config: Pick<ServerGrantexConfig, "jwksUri" | "jwksUrl" | "hosted">): string | undefined {
  const explicit = config.jwksUri?.trim() || config.jwksUrl?.trim();
  if (explicit) {
    return explicit;
  }
  if (config.hosted) {
    return `${resolveHostedGrantexBaseUrl(config.hosted)}/.well-known/jwks.json`;
  }
  return undefined;
}

function isHttpsUrl(url: string): boolean {
  return url.startsWith("https://") || isLocalhostUrl(url);
}

function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "host.docker.internal" || !hostname.includes(".");
  } catch {
    return false;
  }
}

function normalizeGrant(value: unknown): GrantexVerifiedGrant {
  const record = value as PublishedVerifiedGrant;
  return {
    tokenId: String(record.tokenId ?? ""),
    grantId: String(record.grantId ?? record.tokenId ?? ""),
    principalId: String(record.principalId ?? ""),
    agentDid: String(record.agentDid ?? ""),
    developerId: String(record.developerId ?? ""),
    scopes: Array.isArray(record.scopes) ? record.scopes.map(String) : [],
    issuedAt: Number(record.issuedAt ?? 0),
    expiresAt: Number(record.expiresAt ?? 0),
    ...(record.parentAgentDid !== undefined ? { parentAgentDid: String(record.parentAgentDid) } : {}),
    ...(record.parentGrantId !== undefined ? { parentGrantId: String(record.parentGrantId) } : {}),
    ...(record.delegationDepth !== undefined ? { delegationDepth: Number(record.delegationDepth) } : {}),
  };
}

function scopeCovers(grantedScope: string, requiredScope: string): boolean {
  if (grantedScope === requiredScope) {
    return true;
  }
  if (grantedScope.endsWith(":*")) {
    return requiredScope.startsWith(grantedScope.slice(0, -1));
  }
  return false;
}

async function loadGrantexSdk(): Promise<GrantexSdkModule> {
  let specifier = "@grantex/sdk";
  try {
    const { pathToFileURL } = require("url") as typeof import("url");
    specifier = pathToFileURL(require.resolve("@grantex/sdk")).href;
  } catch {
    // Fall back to bare specifier if resolution fails
  }
  const dynamicImport = Function("s", "return import(s)") as (s: string) => Promise<GrantexSdkModule>;
  return dynamicImport(specifier);
}
