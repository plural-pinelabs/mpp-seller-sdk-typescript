"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decidePayment = decidePayment;
const types_1 = require("../../types");
const receipt_builder_1 = require("../../utils/receipt-builder");
const capture_client_1 = require("../capture-client");
const challenge_generator_1 = require("../challenge-generator");
const credential_verifier_1 = require("../credential-verifier");
const grant_token_verifier_1 = require("../grant-token-verifier");
/** Decide how a seller route should respond to an incoming paid-resource request. */
async function decidePayment(options) {
    const challengeGenerator = new challenge_generator_1.ChallengeGenerator(options.config);
    const credentialVerifier = new credential_verifier_1.CredentialVerifier(options.config);
    if (!options.authorizationHeader?.startsWith(types_1.PAYMENT_HEADER_PREFIX)) {
        const result = await challengeGenerator.generate(options.chargeOptions);
        return challengeDecision("challenge", result, result.problemDetails);
    }
    const verification = await credentialVerifier.verify(options.authorizationHeader);
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
    if (options.config.grantex?.enforceGrant === true && !options.grantexTokenHeader) {
        return {
            action: "grant_required",
            status: 403,
            headers: { "Content-Type": "application/problem+json" },
            problemDetails: {
                type: "urn:ietf:rfc:9725:error:grant-required",
                title: "Grant Token Required",
                status: 403,
                detail: `A valid Grantex grant token is required in the ${types_1.GRANTEX_TOKEN_HEADER} header.`,
            },
        };
    }
    if (options.config.grantex && options.grantexTokenHeader) {
        const grantResult = await new grant_token_verifier_1.GrantTokenVerifier(options.config.grantex, options.config.fetch).verify(options.grantexTokenHeader);
        if (!grantResult.valid) {
            if (options.config.grantex.enforceGrant === true) {
                return {
                    action: "grant_invalid",
                    status: 403,
                    headers: { "Content-Type": "application/problem+json" },
                    problemDetails: {
                        type: "urn:ietf:rfc:9725:error:grant-invalid",
                        title: "Invalid Grant Token",
                        status: 403,
                        detail: grantResult.error ?? "The grant token could not be verified.",
                    },
                };
            }
            try {
                options.config.logger?.info("Grantex token verification failed (non-enforcing)", { error: grantResult.error });
            }
            catch {
                // Logging failures are non-fatal.
            }
        }
    }
    try {
        const captureClient = new capture_client_1.CaptureClient(options.config);
        const captureResult = await captureClient.capture({
            token: verification.credential.payload.token,
            amount: options.chargeOptions.amount,
            description: options.chargeOptions.description,
            merchantOrderReference: options.chargeOptions.merchantOrderReference,
            metadata: options.chargeOptions.metadata,
            customerReference: verification.credential.payload.customer_reference,
        });
        const receiptHeader = (0, receipt_builder_1.buildReceiptHeader)(captureResult, verification.credential.challenge.id);
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
        if (error instanceof types_1.MppCaptureError && error.captureError?.httpStatus && error.captureError.httpStatus >= 500) {
            return {
                action: "error",
                status: 502,
                headers: { "Content-Type": "application/problem+json" },
                problemDetails: {
                    type: "urn:plural:error:payment-capture-failed",
                    title: "Payment Capture Failed",
                    status: 502,
                    detail: error.message,
                    upstream: {
                        code: error.captureError.code,
                        http_status: error.captureError.httpStatus,
                        details: error.captureError.details,
                    },
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
