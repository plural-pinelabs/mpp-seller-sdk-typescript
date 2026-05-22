import {
  ChargeOptions,
  MppCaptureError,
  PaymentDecision,
  PAYMENT_HEADER_PREFIX,
  PluralSellerConfig,
  ProblemDetails,
  ChallengeResult,
} from "../../types";
import { buildReceiptHeader } from "../../utils/receipt-builder";
import { CaptureClient } from "../capture-client";
import { ChallengeGenerator } from "../challenge-generator";
import { CredentialVerifier } from "../credential-verifier";

/** Decide how a seller route should respond to an incoming paid-resource request. */
export async function decidePayment(options: {
  authorizationHeader?: string;
  config: PluralSellerConfig;
  chargeOptions: ChargeOptions;
}): Promise<PaymentDecision> {
  const challengeGenerator = new ChallengeGenerator(options.config);
  const credentialVerifier = new CredentialVerifier(options.config);

  if (!options.authorizationHeader?.startsWith(PAYMENT_HEADER_PREFIX)) {
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

  try {
    const captureClient = new CaptureClient(options.config);
    const captureResult = await captureClient.capture({
      token: verification.credential.payload.token,
      amount: options.chargeOptions.amount,
      description: options.chargeOptions.description,
      merchantOrderReference: options.chargeOptions.merchantOrderReference,
      metadata: options.chargeOptions.metadata,
      customerReference: verification.credential.payload.customer_reference,
    });
    const receiptHeader = buildReceiptHeader(captureResult, verification.credential.challenge.id);
    return {
      action: "proceed",
      status: 200,
      headers: { "Payment-Receipt": receiptHeader },
      captureResult,
      credential: verification.credential,
      receiptHeader,
    };
  } catch (error) {
    if (error instanceof MppCaptureError && error.captureError?.httpStatus && error.captureError.httpStatus >= 500) {
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

function challengeDecision(
  action: PaymentDecision["action"],
  result: ChallengeResult,
  problemDetails: ProblemDetails,
): PaymentDecision {
  return {
    action,
    status: 402,
    headers: {
      "WWW-Authenticate": `${PAYMENT_HEADER_PREFIX}${result.encoded}`,
      "Content-Type": "application/problem+json",
      "Cache-Control": "no-store",
    },
    problemDetails,
    challengeResult: result,
  };
}
