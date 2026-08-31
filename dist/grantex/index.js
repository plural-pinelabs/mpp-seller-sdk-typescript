"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrantTokenVerifier = void 0;
exports.hasGrantScope = hasGrantScope;
exports.missingGrantScopes = missingGrantScopes;
const hosted_client_1 = require("./hosted-client");
__exportStar(require("./hosted-client"), exports);
/** Verify Grantex grant tokens using the published `@grantex/sdk` package. */
class GrantTokenVerifier {
    config;
    constructor(config) {
        this.config = config;
    }
    async verify(token) {
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
        }
        catch (error) {
            return { valid: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
}
exports.GrantTokenVerifier = GrantTokenVerifier;
function hasGrantScope(scopes, requiredScope) {
    return scopes.some((scope) => scopeCovers(scope, requiredScope));
}
function missingGrantScopes(scopes, requiredScopes = []) {
    return requiredScopes.filter((scope) => !hasGrantScope(scopes, scope));
}
function postValidateGrant(result, config) {
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
function resolveJwksUri(config) {
    const explicit = config.jwksUri?.trim() || config.jwksUrl?.trim();
    if (explicit) {
        return explicit;
    }
    if (config.hosted) {
        return `${(0, hosted_client_1.resolveHostedGrantexBaseUrl)(config.hosted)}/.well-known/jwks.json`;
    }
    return undefined;
}
function isHttpsUrl(url) {
    return url.startsWith("https://") || isLocalhostUrl(url);
}
function isLocalhostUrl(url) {
    try {
        const { hostname } = new URL(url);
        return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "host.docker.internal" || !hostname.includes(".");
    }
    catch {
        return false;
    }
}
function normalizeGrant(value) {
    const record = value;
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
function scopeCovers(grantedScope, requiredScope) {
    if (grantedScope === requiredScope) {
        return true;
    }
    if (grantedScope.endsWith(":*")) {
        return requiredScope.startsWith(grantedScope.slice(0, -1));
    }
    return false;
}
async function loadGrantexSdk() {
    let specifier = "@grantex/sdk";
    try {
        const { pathToFileURL } = require("url");
        specifier = pathToFileURL(require.resolve("@grantex/sdk")).href;
    }
    catch {
        // Fall back to bare specifier if resolution fails
    }
    const dynamicImport = Function("s", "return import(s)");
    return dynamicImport(specifier);
}
