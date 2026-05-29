import {
  ChargeOptions,
  P3PCaptureError,
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
  credentialHeader?: string;
  config: PluralSellerConfig;
  chargeOptions: ChargeOptions;
}): Promise<PaymentDecision> {
  const challengeGenerator = new ChallengeGenerator(options.config);
  const credentialVerifier = new CredentialVerifier(options.config);

  if (!options.credentialHeader?.startsWith(PAYMENT_HEADER_PREFIX)) {
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
    const captureClient = new CaptureClient(options.config);
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
    const receiptHeader = buildReceiptHeader(captureResult, verification.credential.challenge.id, {
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
  } catch (error) {
    if (error instanceof P3PCaptureError && error.captureError?.httpStatus && error.captureError.httpStatus >= 500) {
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
