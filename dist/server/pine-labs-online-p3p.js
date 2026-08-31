"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PineLabsOnlineP3P = exports.PineLabsOnlineP3PInstance = void 0;
const config_1 = require("../config");
const grantex_1 = require("../grantex");
const receipt_builder_1 = require("../utils/receipt-builder");
const validation_1 = require("../utils/validation");
const api_client_1 = require("./api-client");
const capture_client_1 = require("./capture-client");
const challenge_generator_1 = require("./challenge-generator");
const credential_verifier_1 = require("./credential-verifier");
class PineLabsOnlineP3PInstance {
    challengeGenerator;
    credentialVerifier;
    captureClient;
    apiClient;
    hostedGrantexClient;
    constructor(challengeGenerator, credentialVerifier, captureClient, apiClient, hostedGrantexClient) {
        this.challengeGenerator = challengeGenerator;
        this.credentialVerifier = credentialVerifier;
        this.captureClient = captureClient;
        this.apiClient = apiClient;
        this.hostedGrantexClient = hostedGrantexClient;
    }
    /** Generate a signed 402 Payment challenge for a protected resource. */
    generateChallenge(options) {
        return this.challengeGenerator.generate(options);
    }
    /** Verify `P3P-Credential: Payment <payload>` from the client. */
    verifyCredential(credentialHeader) {
        return this.credentialVerifier.verify(credentialHeader);
    }
    /** Execute a debit against `/mpp/v1/debit` using a one-time payment token. */
    capture(options) {
        return this.captureClient.capture(options);
    }
    /** Fetch debit status through `GET /mpp/v1/debit/{id}` using the debit idempotency key. */
    getDebitStatus(idempotencyKey) {
        return this.captureClient.getDebitStatus(idempotencyKey);
    }
    /** Create a mandate/pre-authorization through `POST /mpp/v1/pre-authorize`. */
    createMandate(options) {
        return this.apiClient.createMandate(options);
    }
    /** Create a card/mandate pre-authorization through `POST /mpp/v1/pre-authorize`. */
    createPreAuthorization(options) {
        return this.apiClient.createPreAuthorization(options);
    }
    /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
    getMandate(mandateId) {
        return this.apiClient.getMandate(mandateId);
    }
    /** Retrieve an order by its Pine Labs order ID. */
    getOrder(orderId) {
        return this.apiClient.getOrder(orderId);
    }
    /** Initiate a refund against a processed Pine Labs order. */
    createRefund(orderId, options) {
        return this.apiClient.createRefund(orderId, options);
    }
    /** Fetch mandate balance/authorization status through `GET /mpp/v1/balance`. */
    getMandateBalance(options) {
        return this.apiClient.getMandateBalance(options);
    }
    /** Create a mandate revoke request through `POST /mpp/v1/revoke`. */
    revokeMandate(options) {
        return this.apiClient.revokeMandate(options);
    }
    /** Create a hosted Grantex authorization request and return its consent URL. */
    createGrantexAuthorization(options) {
        return this.requireHostedGrantex().createAuthorization(options);
    }
    /** Exchange a hosted Grantex callback code for a user grant token. */
    exchangeGrantexCode(options) {
        return this.requireHostedGrantex().exchangeCode(options);
    }
    /** Allocate a hosted Grantex grant-level budget. */
    allocateGrantexBudget(options) {
        return this.requireHostedGrantex().allocateBudget(options);
    }
    /** Debit a hosted Grantex grant-level budget. */
    debitGrantexBudget(options) {
        return this.requireHostedGrantex().debitBudget(options);
    }
    /** Fetch hosted Grantex grant-level budget balance. */
    getGrantexBudgetBalance(grantId) {
        return this.requireHostedGrantex().getBudgetBalance(grantId);
    }
    /** List hosted Grantex grant-level budget transactions. */
    listGrantexBudgetTransactions(grantId, options) {
        return this.requireHostedGrantex().listBudgetTransactions(grantId, options);
    }
    /** Build the `Payment-Receipt` response header for a successful capture. */
    buildReceiptHeader(captureResult, challengeId, context = {}) {
        return (0, receipt_builder_1.buildReceiptHeader)(captureResult, challengeId, context);
    }
    /** Build structured receipt data without encoding it as a header. */
    buildReceiptData(captureResult, challengeId, context = {}) {
        return (0, receipt_builder_1.buildReceiptData)(captureResult, challengeId, context);
    }
    requireHostedGrantex() {
        if (!this.hostedGrantexClient) {
            throw new Error("PineLabsOnlineServerConfig: grantex.hosted is required");
        }
        return this.hostedGrantexClient;
    }
}
exports.PineLabsOnlineP3PInstance = PineLabsOnlineP3PInstance;
class PineLabsOnlineP3P {
    /** Create a server SDK instance from `PineLabsOnlineServerConfig`. */
    static create(config) {
        (0, validation_1.validateConfig)(config);
        const resolvedConfig = (0, config_1.withP3PEnvironmentDefaults)(config);
        return new PineLabsOnlineP3PInstance(new challenge_generator_1.ChallengeGenerator(resolvedConfig), new credential_verifier_1.CredentialVerifier(resolvedConfig), new capture_client_1.CaptureClient(resolvedConfig), new api_client_1.ApiClient(resolvedConfig), resolvedConfig.grantex?.hosted ? (0, grantex_1.createHostedGrantexClient)(resolvedConfig.grantex.hosted) : undefined);
    }
}
exports.PineLabsOnlineP3P = PineLabsOnlineP3P;
