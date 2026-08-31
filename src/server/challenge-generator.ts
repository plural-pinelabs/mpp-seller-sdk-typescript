import { Challenge, ChallengeRequest, ChallengeResult, ChargeOptions, PaymentMethod, PineLabsOnlineServerConfig } from "../types";
import { encodeJson } from "../utils/base64url";
import { computeChallengeId, deriveChallengeHmacKey } from "../utils/hmac";
import { validateConfig } from "../utils/validation";

const DEFAULT_EXPIRY_SECONDS = 300;

export class ChallengeGenerator {
  private readonly secretKey: string;
  private readonly realm: string;
  private readonly defaultExpirySeconds: number;
  private readonly availablePaymentMethods: PaymentMethod[];

  constructor(config: PineLabsOnlineServerConfig) {
    validateConfig(config);
    this.secretKey = deriveChallengeHmacKey(config.clientSecret);
    this.realm = config.realm ?? config.env;
    this.defaultExpirySeconds = config.defaultChallengeExpirySeconds ?? DEFAULT_EXPIRY_SECONDS;
    this.availablePaymentMethods = [...config.availablePaymentMethods];
  }

  /** Generate a challenge and problem-details response for HTTP 402. */
  async generate(options: ChargeOptions): Promise<ChallengeResult> {
    if (!Number.isInteger(options.amount.value) || options.amount.value <= 0) {
      throw new Error("ChargeOptions: amount.value must be a positive integer (paise)");
    }
    const expires = new Date(Date.now() + (options.challengeExpirySeconds ?? this.defaultExpirySeconds) * 1000).toISOString();
    const amountMajor = (options.amount.value / 100).toFixed(2);
    const request: ChallengeRequest = {
      scheme: "exact",
      amount: amountMajor,
      currency: options.amount.currency,
      resource: options.resource,
      availablePaymentMethods: this.availablePaymentMethods,
    };
    const challengeId = await computeChallengeId(
      this.secretKey,
      this.realm,
      "charge",
      encodeJson(request),
      expires,
    );
    const challenge: Challenge = {
      id: challengeId,
      realm: this.realm,
      intent: "charge",
      request,
      expires,
    };
    return {
      challenge,
      encoded: encodeJson(challenge),
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
