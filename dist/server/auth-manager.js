"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthManager = void 0;
const types_1 = require("../types");
const http_1 = require("../utils/http");
const parsers_1 = require("../utils/parsers");
class AuthManager {
    config;
    baseUrl;
    fetchImpl;
    accessToken;
    expiresAt = 0;
    staticAccessToken;
    constructor(config, baseUrl, fetchImpl) {
        this.config = config;
        this.baseUrl = baseUrl;
        this.fetchImpl = fetchImpl;
        this.staticAccessToken = normalizeAccessToken(config.accessToken);
    }
    /** Return a valid bearer token, reusing cached/static tokens where possible. */
    async getAccessToken() {
        if (this.staticAccessToken) {
            return this.staticAccessToken;
        }
        if (this.accessToken && Date.now() < this.expiresAt - 60_000) {
            return this.accessToken;
        }
        const response = await (0, http_1.requestWithRetry)(this.fetchImpl, `${stripSlash(this.baseUrl)}/api/auth/v1/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grant_type: "client_credentials",
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
            }),
        }, this.config);
        if (!response.ok) {
            throw types_1.MppError.fromResponse(response.status, await (0, http_1.safeJson)(response));
        }
        const payload = (0, parsers_1.asRecord)(await response.json()) ?? {};
        const data = (0, parsers_1.asRecord)(payload.data) ?? payload;
        this.accessToken = String(data.access_token ?? "");
        if (!this.accessToken) {
            throw new types_1.MppError("MPP_AUTHENTICATION_FAILED", "Token exchange response missing access_token", response.status);
        }
        this.expiresAt = data.expires_at
            ? Date.parse(String(data.expires_at))
            : Date.now() + Number(data.expires_in ?? 3600) * 1000;
        return this.accessToken;
    }
}
exports.AuthManager = AuthManager;
function normalizeAccessToken(accessToken) {
    const token = accessToken?.trim();
    if (!token) {
        return undefined;
    }
    return token.toLowerCase().startsWith("bearer ") ? token.slice(7).trim() : token;
}
function stripSlash(value) {
    return value.replace(/\/$/, "");
}
