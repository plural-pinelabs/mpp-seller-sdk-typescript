"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRequestHash = buildRequestHash;
const node_crypto_1 = require("node:crypto");
/** Build the canonical SHA-256 request hash required by `/mpp/v1/debit`. */
function buildRequestHash(payload) {
    const body = JSON.stringify(payload, Object.keys(payload).sort());
    return (0, node_crypto_1.createHash)("sha256").update(body).digest("hex");
}
