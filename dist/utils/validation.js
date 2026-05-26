"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
function validateConfig(config) {
    if (!config.clientId || !config.clientSecret || !config.challengeSecretKey) {
        throw new Error("PluralSellerConfig: clientId, clientSecret and challengeSecretKey are required");
    }
}
