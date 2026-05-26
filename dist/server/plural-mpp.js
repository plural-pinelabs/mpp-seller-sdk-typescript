"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluralMPP = exports.PluralMPPInstance = void 0;
const receipt_builder_1 = require("../utils/receipt-builder");
const validation_1 = require("../utils/validation");
const capture_client_1 = require("./capture-client");
const challenge_generator_1 = require("./challenge-generator");
const credential_verifier_1 = require("./credential-verifier");
class PluralMPPInstance {
    challengeGenerator;
    credentialVerifier;
    captureClient;
    constructor(challengeGenerator, credentialVerifier, captureClient) {
        this.challengeGenerator = challengeGenerator;
        this.credentialVerifier = credentialVerifier;
        this.captureClient = captureClient;
    }
    /** Generate a signed 402 Payment challenge for a protected resource. */
    generateChallenge(options) {
        return this.challengeGenerator.generate(options);
    }
    /** Verify `Authorization: Payment <payload>` from the buyer. */
    verifyCredential(authorizationHeader) {
        return this.credentialVerifier.verify(authorizationHeader);
    }
    /** Execute a debit against `/mpp/v1/debit` using a one-time payment token. */
    capture(options) {
        return this.captureClient.capture(options);
    }
    /** Build the `Payment-Receipt` response header for a successful capture. */
    buildReceiptHeader(captureResult, challengeId) {
        return (0, receipt_builder_1.buildReceiptHeader)(captureResult, challengeId);
    }
    /** Build structured receipt data without encoding it as a header. */
    buildReceiptData(captureResult, challengeId) {
        return (0, receipt_builder_1.buildReceiptData)(captureResult, challengeId);
    }
}
exports.PluralMPPInstance = PluralMPPInstance;
class PluralMPP {
    /** Create a seller SDK instance from `PluralSellerConfig`. */
    static create(config) {
        (0, validation_1.validateConfig)(config);
        return new PluralMPPInstance(new challenge_generator_1.ChallengeGenerator(config), new credential_verifier_1.CredentialVerifier(config), new capture_client_1.CaptureClient(config));
    }
}
exports.PluralMPP = PluralMPP;
