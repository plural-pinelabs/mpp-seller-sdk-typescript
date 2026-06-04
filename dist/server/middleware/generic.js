"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decidePayment = decidePayment;
const types_1 = require("../../types");
const receipt_builder_1 = require("../../utils/receipt-builder");
const capture_client_1 = require("../capture-client");
const challenge_generator_1 = require("../challenge-generator");
const credential_verifier_1 = require("../credential-verifier");
/** Decide how a server route should respond to an incoming paid-resource request. */
async function decidePayment(options) {
    const challengeGenerator = new challenge_generator_1.ChallengeGenerator(options.config);
    const credentialVerifier = new credential_verifier_1.CredentialVerifier(options.config);
    if (!options.credentialHeader?.startsWith(types_1.PAYMENT_HEADER_PREFIX)) {
        const result = await challengeGenerator.generate(options.chargeOptions);
        return challengeDecision("challenge", result, result.problemDetails);
    }
    const verification = await credentialVerifier.verify(options.credentialHeader);
    if (!verification.valid || !verification.credential) {
        const result = await challengeGenerator.generate(options.chargeOptions);
        return challengeDecision("invalid", result, {
            type: result.problemDetails.type.replace("payment-required", "payment-invalid"),
            title: "Invalid Payment Credential",
            status: 402,
            detail: verification.error ?? "The payment credential could not be verified.",
            challengeId: result.challenge.id,
        });
    }
    try {
        const captureClient = new capture_client_1.CaptureClient(options.config);
        const captureResult = await captureClient.capture({
            token: verification.credential.payload.token,
            amount: options.chargeOptions.amount,
            description: options.chargeOptions.description,
            merchantOrderReference: options.chargeOptions.merchantOrderReference,
            metadata: options.chargeOptions.metadata,
            paymentMethod: verification.credential.payload.payment_method,
            customerReference: verification.credential.payload.customer_reference,
            mobileNumber: verification.credential.payload.mobile_number,
            challengeId: verification.credential.challenge.id,
        });
        const receiptHeader = (0, receipt_builder_1.buildReceiptHeader)(captureResult, verification.credential.challenge.id, {
            paymentGateway: options.config.paymentGateway,
            paymentMethod: verification.credential.payload.payment_method,
        });
        return {
            action: "proceed",
            status: 200,
            headers: { "Payment-Receipt": receiptHeader },
            captureResult,
            credential: verification.credential,
            receiptHeader,
        };
    }
    catch (error) {
        if (error instanceof types_1.P3PCaptureError && error.captureError?.httpStatus && error.captureError.httpStatus >= 500) {
            return {
                action: "error",
                status: 502,
                headers: { "content-type": "application/json" },
                problemDetails: {
                    code: error.captureError.code,
                    message: error.captureError.message,
                },
            };
        }
        const result = await challengeGenerator.generate(options.chargeOptions);
        return challengeDecision("failed", result, {
            type: result.problemDetails.type.replace("payment-required", "payment-failed"),
            title: "Payment Failed",
            status: 402,
            detail: "Previous payment token was invalid or expired. New challenge issued.",
            challengeId: result.challenge.id,
        });
    }
}
function challengeDecision(action, result, problemDetails) {
    return {
        action,
        status: 402,
        headers: {
            "WWW-Authenticate": `${types_1.PAYMENT_HEADER_PREFIX}${result.encoded}`,
            "Content-Type": "application/problem+json",
            "Cache-Control": "no-store",
        },
        problemDetails,
        challengeResult: result,
    };
}
