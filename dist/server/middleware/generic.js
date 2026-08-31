"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decidePayment = decidePayment;
const types_1 = require("../../types");
const grantex_1 = require("../../grantex");
const receipt_builder_1 = require("../../utils/receipt-builder");
const capture_client_1 = require("../capture-client");
const capture_client_2 = require("../capture-client");
const challenge_generator_1 = require("../challenge-generator");
const credential_verifier_1 = require("../credential-verifier");
const MAX_TRANSACTION_SCOPE_PREFIX = "mpp:payment:max_txn_paise:";
/** Decide how a server route should respond to an incoming paid-resource request. */
async function decidePayment(options) {
    const challengeGenerator = new challenge_generator_1.ChallengeGenerator(options.config);
    const credentialVerifier = new credential_verifier_1.CredentialVerifier(options.config);
    const grantResult = await verifyGrantIfPresent(options.config, options.grantexTokenHeader);
    const grantDecision = decideGrant(options.config, options.grantexTokenHeader, grantResult);
    if (grantDecision) {
        return grantDecision;
    }
    const transactionCapDecision = decideTransactionCap(options.config, options.chargeOptions, grantResult);
    if (transactionCapDecision) {
        return transactionCapDecision;
    }
    if (!options.credentialHeader?.startsWith(types_1.PAYMENT_HEADER_PREFIX)) {
        const budgetDecision = await checkHostedBudgetBeforeChallenge(options.config, options.chargeOptions, grantResult);
        if (budgetDecision) {
            return budgetDecision;
        }
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
            paymentMethodReferenceId: verification.credential.payload.payment_method_reference_id,
            mobileNumber: verification.credential.payload.mobile_number,
            challengeId: verification.credential.challenge.id,
        });
        if (captureResult.pending || (0, capture_client_2.isPendingDebitStatus)(captureResult.status)) {
            const headers = { "Content-Type": "application/json" };
            if (typeof captureResult.retryAfter === "number" && captureResult.retryAfter > 0) {
                headers["Retry-After"] = String(Math.ceil(captureResult.retryAfter / 1000));
            }
            const problemDetails = {
                status: "PENDING",
                idempotencyKey: String(captureResult.idempotencyKey ?? ""),
                message: String(captureResult.message ?? "Payment accepted and still processing"),
                debitStatus: String(captureResult.status ?? "PENDING"),
                ...(typeof captureResult.retryAfter === "number" ? { retryAfter: captureResult.retryAfter } : {}),
            };
            return {
                action: "pending",
                status: 202,
                headers,
                captureResult,
                credential: verification.credential,
                problemDetails,
                grantResult,
            };
        }
        await debitHostedBudgetAfterCapture(options.config, options.chargeOptions, grantResult);
        const receiptHeader = (0, receipt_builder_1.buildReceiptHeader)(captureResult, verification.credential.challenge.id, {
            paymentGateway: options.config.paymentGateway,
        });
        return {
            action: "proceed",
            status: 200,
            headers: { "Payment-Receipt": receiptHeader },
            captureResult,
            credential: verification.credential,
            receiptHeader,
            grantResult,
        };
    }
    catch (error) {
        if (error instanceof types_1.P3PCaptureError && error.captureError?.httpStatus) {
            return {
                action: error.captureError.httpStatus >= 500 ? "error" : "failed",
                status: error.captureError.httpStatus >= 500 ? 502 : error.captureError.httpStatus,
                headers: { "content-type": "application/json" },
                problemDetails: {
                    code: error.captureError.code,
                    message: error.captureError.message,
                },
            };
        }
        return {
            action: "error",
            status: 502,
            headers: { "content-type": "application/json" },
            problemDetails: {
                code: "CAPTURE_FAILED",
                message: error instanceof types_1.P3PCaptureError ? error.message : "Capture failed",
            },
        };
    }
}
function decideGrant(config, grantTokenHeader, result) {
    if (!config.grantex) {
        return undefined;
    }
    const token = grantTokenHeader?.trim();
    if (!token) {
        if (config.grantex.enforceGrant) {
            const result = { valid: false, error: "Missing grant token" };
            return grantDecision("grant_required", {
                type: "urn:ietf:rfc:9725:error:grant-required",
                title: "Grant Token Required",
                status: 403,
                detail: `A valid Grantex grant token is required in the ${types_1.GRANTEX_TOKEN_HEADER} header.`,
            }, result);
        }
        return undefined;
    }
    if (result?.valid) {
        return undefined;
    }
    config.logger?.error("Grantex grant verification failed", { error: result?.error });
    if (config.grantex.enforceGrant) {
        return grantDecision("grant_invalid", {
            type: "urn:ietf:rfc:9725:error:grant-invalid",
            title: "Invalid Grant Token",
            status: 403,
            detail: "The grant token could not be verified.",
        }, result ?? { valid: false, error: "The grant token could not be verified." });
    }
    return undefined;
}
function decideTransactionCap(config, chargeOptions, result) {
    if (!config.grantex?.enforceGrant || !result?.valid || !result.grant) {
        return undefined;
    }
    const maxTransactionPaise = extractMaxTransactionPaise(result.grant.scopes);
    if (maxTransactionPaise === undefined || chargeOptions.amount.value <= maxTransactionPaise) {
        return undefined;
    }
    return grantDecision("grant_invalid", {
        type: "urn:ietf:rfc:9725:error:transaction-limit-exceeded",
        title: "Transaction Limit Exceeded",
        status: 403,
        detail: `The charge amount ${chargeOptions.amount.value} exceeds the Grantex per-transaction cap ${maxTransactionPaise}.`,
    }, {
        valid: false,
        grant: result.grant,
        error: "Grantex per-transaction cap exceeded",
    });
}
async function checkHostedBudgetBeforeChallenge(config, chargeOptions, result) {
    if (!config.grantex?.enforceGrant || config.grantex.debitBudgetBeforeChallenge === false || !config.grantex.hosted) {
        return undefined;
    }
    if (!result?.valid || !result.grant) {
        return undefined;
    }
    try {
        const balance = await (0, grantex_1.createHostedGrantexClient)(config.grantex.hosted).getBudgetBalance(result.grant.grantId);
        const remainingPaise = grantexMajorToPaise(balance.remainingBudget);
        if (remainingPaise < chargeOptions.amount.value) {
            return grantDecision("grant_invalid", {
                type: "urn:ietf:rfc:9725:error:budget-exceeded",
                title: "Grant Budget Exceeded",
                status: 403,
                detail: `The Grantex grant budget has ${remainingPaise} paise remaining, which is less than the charge amount ${chargeOptions.amount.value} paise.`,
            }, {
                valid: false,
                grant: result.grant,
                error: "Grantex grant budget exceeded",
            });
        }
        return undefined;
    }
    catch (error) {
        const hostedError = error instanceof grantex_1.HostedGrantexError
            ? error
            : new grantex_1.HostedGrantexError(error instanceof Error ? error.message : String(error));
        config.logger?.error("Grantex budget check failed", {
            error: hostedError.message,
            status: hostedError.status,
            code: hostedError.code,
        });
        return grantDecision("grant_invalid", {
            type: "urn:ietf:rfc:9725:error:budget-exceeded",
            title: "Grant Budget Exceeded",
            status: 403,
            detail: "The Grantex grant budget could not be checked.",
        }, {
            valid: false,
            grant: result.grant,
            error: hostedError.message || "The Grantex grant budget could not be checked.",
        });
    }
}
async function debitHostedBudgetAfterCapture(config, chargeOptions, result) {
    if (!config.grantex?.enforceGrant || config.grantex.debitBudgetBeforeChallenge === false || !config.grantex.hosted) {
        return;
    }
    if (!result?.valid || !result.grant) {
        return;
    }
    try {
        await (0, grantex_1.createHostedGrantexClient)(config.grantex.hosted).debitBudget({
            grantId: result.grant.grantId,
            amount: paiseToGrantexMajor(chargeOptions.amount.value),
            description: chargeOptions.description ?? "P3P payment capture",
            metadata: {
                resource: chargeOptions.resource,
                currency: chargeOptions.amount.currency,
                ...(chargeOptions.metadata ?? {}),
            },
        });
    }
    catch (error) {
        const hostedError = error instanceof grantex_1.HostedGrantexError
            ? error
            : new grantex_1.HostedGrantexError(error instanceof Error ? error.message : String(error));
        config.logger?.error("Grantex budget debit failed after successful capture", {
            error: hostedError.message,
            status: hostedError.status,
            code: hostedError.code,
        });
    }
}
function paiseToGrantexMajor(amountPaise) {
    return amountPaise / 100;
}
function grantexMajorToPaise(amount) {
    return Math.round(amount * 100);
}
async function verifyGrantIfPresent(config, grantTokenHeader) {
    if (!config.grantex || !grantTokenHeader?.trim()) {
        return undefined;
    }
    return new grantex_1.GrantTokenVerifier(config.grantex).verify(grantTokenHeader);
}
function grantDecision(action, problemDetails, grantResult) {
    return {
        action,
        status: 403,
        headers: {
            "Content-Type": "application/problem+json",
            "Cache-Control": "no-store",
        },
        problemDetails,
        grantResult,
    };
}
function extractMaxTransactionPaise(scopes) {
    let maxTransactionPaise;
    for (const scope of scopes) {
        if (!scope.startsWith(MAX_TRANSACTION_SCOPE_PREFIX)) {
            continue;
        }
        const value = Number(scope.slice(MAX_TRANSACTION_SCOPE_PREFIX.length));
        if (Number.isInteger(value) && value >= 0) {
            maxTransactionPaise = maxTransactionPaise === undefined ? value : Math.min(maxTransactionPaise, value);
        }
    }
    return maxTransactionPaise;
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
