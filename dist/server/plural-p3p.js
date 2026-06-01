"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluralP3P = exports.PluralP3PInstance = void 0;
const config_1 = require("../config");
const receipt_builder_1 = require("../utils/receipt-builder");
const validation_1 = require("../utils/validation");
const api_client_1 = require("./api-client");
const capture_client_1 = require("./capture-client");
const challenge_generator_1 = require("./challenge-generator");
const credential_verifier_1 = require("./credential-verifier");
class PluralP3PInstance {
    challengeGenerator;
    credentialVerifier;
    captureClient;
    apiClient;
    constructor(challengeGenerator, credentialVerifier, captureClient, apiClient) {
        this.challengeGenerator = challengeGenerator;
        this.credentialVerifier = credentialVerifier;
        this.captureClient = captureClient;
        this.apiClient = apiClient;
    }
    /** Generate a signed 402 Payment challenge for a protected resource. */
    generateChallenge(options) {
        return this.challengeGenerator.generate(options);
    }
    /** Verify `P3P-Credential: Payment <payload>` from the buyer. */
    verifyCredential(credentialHeader) {
        return this.credentialVerifier.verify(credentialHeader);
    }
    /** Execute a debit against `/mpp/v1/debit` using a one-time payment token. */
    capture(options) {
        return this.captureClient.capture(options);
    }
    /** Create a mandate/pre-authorization through `POST /mpp/v1/pre-authorize`. */
    createMandate(options) {
        return this.apiClient.createMandate(options);
    }
    /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
    getMandate(mandateId) {
        return this.apiClient.getMandate(mandateId);
    }
    /** Build the `Payment-Receipt` response header for a successful capture. */
    buildReceiptHeader(captureResult, challengeId, context = {}) {
        return (0, receipt_builder_1.buildReceiptHeader)(captureResult, challengeId, context);
    }
    /** Build structured receipt data without encoding it as a header. */
    buildReceiptData(captureResult, challengeId, context = {}) {
        return (0, receipt_builder_1.buildReceiptData)(captureResult, challengeId, context);
    }
}
exports.PluralP3PInstance = PluralP3PInstance;
class PluralP3P {
    /** Create a seller SDK instance from `PluralSellerConfig`. */
    static create(config) {
        (0, validation_1.validateConfig)(config);
        const resolvedConfig = (0, config_1.withP3PEnvironmentDefaults)(config);
        return new PluralP3PInstance(new challenge_generator_1.ChallengeGenerator(resolvedConfig), new credential_verifier_1.CredentialVerifier(resolvedConfig), new capture_client_1.CaptureClient(resolvedConfig), new api_client_1.ApiClient(resolvedConfig));
    }
}
exports.PluralP3P = PluralP3P;
