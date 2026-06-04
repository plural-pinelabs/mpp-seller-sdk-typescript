"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChallengeGenerator = void 0;
const base64url_1 = require("../utils/base64url");
const hmac_1 = require("../utils/hmac");
const validation_1 = require("../utils/validation");
const DEFAULT_EXPIRY_SECONDS = 300;
class ChallengeGenerator {
    secretKey;
    realm;
    defaultExpirySeconds;
    availablePaymentMethods;
    constructor(config) {
        (0, validation_1.validateConfig)(config);
        this.secretKey = (0, hmac_1.deriveChallengeHmacKey)(config.clientSecret);
        this.realm = config.realm ?? config.env;
        this.defaultExpirySeconds = config.defaultChallengeExpirySeconds ?? DEFAULT_EXPIRY_SECONDS;
        this.availablePaymentMethods = [...config.availablePaymentMethods];
    }
    /** Generate a challenge and problem-details response for HTTP 402. */
    async generate(options) {
        const expires = new Date(Date.now() + (options.challengeExpirySeconds ?? this.defaultExpirySeconds) * 1000).toISOString();
        const amountMajor = (options.amount.value / 100).toFixed(2);
        const request = {
            scheme: "exact",
            amount: amountMajor,
            currency: options.amount.currency,
            resource: options.resource,
            availablePaymentMethods: this.availablePaymentMethods,
        };
        const challengeId = await (0, hmac_1.computeChallengeId)(this.secretKey, this.realm, "charge", (0, base64url_1.encodeJson)(request), expires);
        const challenge = {
            id: challengeId,
            realm: this.realm,
            intent: "charge",
            request,
            expires,
        };
        return {
            challenge,
            encoded: (0, base64url_1.encodeJson)(challenge),
            problemDetails: {
                type: `${this.realm}/errors/payment-required`,
                title: "Payment Required",
                status: 402,
                detail: `This resource requires payment of ${amountMajor} ${options.amount.currency}`,
                challengeId,
            },
        };
    }
}
exports.ChallengeGenerator = ChallengeGenerator;
