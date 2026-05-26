"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeBase64Url = encodeBase64Url;
exports.decodeBase64Url = decodeBase64Url;
exports.encodeJson = encodeJson;
exports.decodeJson = decodeJson;
exports.isBase64Url = isBase64Url;
function encodeBase64Url(bytes) {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decodeBase64Url(value) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
function encodeJson(value) {
    return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}
function decodeJson(value) {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}
function isBase64Url(value) {
    return /^[A-Za-z0-9_-]+$/.test(value);
}
