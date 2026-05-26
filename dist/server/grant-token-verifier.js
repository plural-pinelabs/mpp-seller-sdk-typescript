"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrantTokenVerifier = void 0;
const node_crypto_1 = require("node:crypto");
const base64url_1 = require("../utils/base64url");
const parsers_1 = require("../utils/parsers");
const DEFAULT_JWKS_CACHE_TTL_MS = 3_600_000;
class GrantTokenVerifier {
    config;
    jwksUrl;
    cacheTtlMs;
    requiredScopes;
    fetchImpl;
    jwks;
    cacheExpiresAt = 0;
    constructor(config, fetchImpl) {
        this.config = config;
        this.jwksUrl = normalizeJwksUrl(config.jwksUrl);
        this.cacheTtlMs = config.jwksCacheTtlMs ?? DEFAULT_JWKS_CACHE_TTL_MS;
        this.requiredScopes = [...(config.requiredScopes ?? [])];
        this.fetchImpl = fetchImpl ?? globalThis.fetch?.bind(globalThis);
        if (!this.fetchImpl) {
            throw new Error("A fetch implementation is required for Grantex JWKS verification.");
        }
    }
    /** Verify signature, expiry, required claims, and configured required scopes. */
    async verify(grantToken) {
        let header;
        let claims;
        try {
            const decoded = decodeJwt(grantToken);
            header = decoded.header;
            claims = dictToClaims(decoded.payload);
        }
        catch (error) {
            return { valid: false, error: `Grant token verification failed: ${errorMessage(error)}` };
        }
        if (header.alg !== "RS256") {
            return { valid: false, error: `Unsupported algorithm: ${header.alg ?? "none"}. Expected RS256` };
        }
        const jwk = await this.getSigningKey(header.kid);
        if (!jwk) {
            return { valid: false, error: `No matching key found for kid: ${header.kid ?? "none"}` };
        }
        try {
            const validSignature = await verifyRs256(jwk, grantToken);
            if (!validSignature) {
                return { valid: false, error: "Invalid grant token signature" };
            }
        }
        catch (error) {
            return { valid: false, error: `Grant token verification failed: ${errorMessage(error)}` };
        }
        const validationError = this.validateClaims(claims);
        if (validationError) {
            return { valid: false, error: validationError };
        }
        return { valid: true, claims };
    }
    validateClaims(claims) {
        const now = Math.floor(Date.now() / 1000);
        if (!claims.grnt)
            return "Missing grant ID (grnt)";
        if (!claims.sub)
            return "Missing subject (sub)";
        if (!claims.agt)
            return "Missing agent ID (agt)";
        if (!claims.iss)
            return "Missing issuer (iss)";
        if (!claims.scp.length)
            return "Missing or empty scopes (scp)";
        if (claims.exp && claims.exp < now)
            return `Grant expired at ${formatEpoch(claims.exp)}`;
        if (claims.nbf && claims.nbf > now)
            return `Grant not yet valid until ${formatEpoch(claims.nbf)}`;
        for (const required of this.requiredScopes) {
            if (!hasScope(claims.scp, required)) {
                return `Missing required scope: ${required}`;
            }
        }
        return undefined;
    }
    async getSigningKey(kid) {
        const keys = await this.getJwks();
        const signingKeys = keys.filter((key) => key.kty === "RSA" && (!key.alg || key.alg === "RS256"));
        if (!kid) {
            return signingKeys.length === 1 ? signingKeys[0] : undefined;
        }
        return signingKeys.find((key) => key.kid === kid);
    }
    async getJwks() {
        if (this.jwks && Date.now() < this.cacheExpiresAt) {
            return this.jwks;
        }
        const response = await this.fetchImpl(this.jwksUrl, { method: "GET" });
        if (!response.ok) {
            throw new Error(`JWKS fetch failed with status ${response.status}`);
        }
        const body = (0, parsers_1.asRecord)(await response.json());
        const keys = Array.isArray(body?.keys) ? body.keys : [];
        this.jwks = keys;
        this.cacheExpiresAt = Date.now() + this.cacheTtlMs;
        return keys;
    }
}
exports.GrantTokenVerifier = GrantTokenVerifier;
function decodeJwt(token) {
    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid JWT");
    }
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    return {
        header: (0, parsers_1.asRecord)(decodeJsonSegment(encodedHeader)) ?? {},
        payload: (0, parsers_1.asRecord)(decodeJsonSegment(encodedPayload)) ?? {},
        signingInput: `${encodedHeader}.${encodedPayload}`,
        signature: (0, base64url_1.decodeBase64Url)(encodedSignature),
    };
}
async function verifyRs256(jwk, token) {
    const { signingInput, signature } = decodeJwt(token);
    const subtle = globalThis.crypto?.subtle ?? node_crypto_1.webcrypto.subtle;
    const key = await subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return subtle.verify("RSASSA-PKCS1-v1_5", key, toArrayBuffer(signature), new TextEncoder().encode(signingInput));
}
function toArrayBuffer(bytes) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}
function decodeJsonSegment(segment) {
    return JSON.parse(new TextDecoder().decode((0, base64url_1.decodeBase64Url)(segment)));
}
function dictToClaims(raw) {
    const scopes = Array.isArray(raw.scp) ? raw.scp.map(String) : [];
    return {
        iss: String(raw.iss ?? ""),
        sub: String(raw.sub ?? ""),
        agt: String(raw.agt ?? ""),
        scp: scopes,
        grnt: String(raw.grnt ?? ""),
        iat: numberClaim(raw.iat),
        exp: numberClaim(raw.exp),
        dev: stringOrUndefined(raw.dev),
        nbf: optionalNumberClaim(raw.nbf),
        parentAgt: stringOrUndefined(raw.parentAgt),
        parentGrnt: stringOrUndefined(raw.parentGrnt),
        delegationDepth: optionalNumberClaim(raw.delegationDepth),
        raw,
    };
}
function hasScope(scopes, required) {
    if (scopes.includes(required)) {
        return true;
    }
    const parts = required.split(":");
    return scopes.some((scope) => {
        const scopeParts = scope.split(":");
        if (scope === `${parts[0]}:*`) {
            return true;
        }
        return scopeParts.length >= 2 && parts.length >= 2 && scopeParts[0] === parts[0] && scopeParts[1] === "*";
    });
}
function numberClaim(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}
function optionalNumberClaim(value) {
    return value === undefined || value === null || value === "" ? undefined : numberClaim(value);
}
function stringOrUndefined(value) {
    return value === undefined || value === null || value === "" ? undefined : String(value);
}
function formatEpoch(epochSeconds) {
    return new Date(epochSeconds * 1000).toISOString().replace(".000Z", "Z");
}
function normalizeJwksUrl(value) {
    const url = new URL(value);
    if (url.pathname === "/" || url.pathname === "") {
        url.pathname = "/.well-known/jwks.json";
    }
    return url.toString();
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
