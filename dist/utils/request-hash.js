"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRequestHash = buildRequestHash;
const node_crypto_1 = require("node:crypto");
/** Build the canonical SHA-256 request hash required by `/mpp/v1/debit`. */
function buildRequestHash(payload) {
    const body = canonicalJson(payload) ?? "null";
    return (0, node_crypto_1.createHash)("sha256").update(body).digest("hex");
}
function canonicalJson(value) {
    if (value === undefined || typeof value === "function" || typeof value === "symbol") {
        return undefined;
    }
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJson(item) ?? "null").join(",")}]`;
    }
    const record = value;
    const entries = Object.keys(record)
        .sort()
        .map((key) => {
        const encodedValue = canonicalJson(record[key]);
        return encodedValue === undefined ? undefined : `${JSON.stringify(key)}:${encodedValue}`;
    })
        .filter((entry) => entry !== undefined);
    return `{${entries.join(",")}}`;
}
