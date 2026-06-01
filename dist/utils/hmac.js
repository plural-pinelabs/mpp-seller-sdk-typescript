"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeHmacSha256 = computeHmacSha256;
exports.computeChallengeId = computeChallengeId;
async function computeHmacSha256(key, data) {
    const cryptoKey = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await globalThis.crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
    return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function computeChallengeId(secretKey, realm, method, intent, requestBase64, expires) {
    const payload = `${realm}|${method}|${intent}|${requestBase64}|${expires}`;
    return `ch_${await computeHmacSha256(secretKey, payload)}`;
}
