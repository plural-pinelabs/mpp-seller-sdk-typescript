import { DEFAULT_REALM } from "../config";
import { Challenge, ChallengeResult, ChargeOptions, PluralSellerConfig } from "../types";
import { encodeJson } from "../utils/base64url";
import { computeChallengeId } from "../utils/hmac";

const DEFAULT_EXPIRY_SECONDS = 300;

export class ChallengeGenerator {
  private readonly secretKey: string;
  private readonly realm: string;
  private readonly defaultExpirySeconds: number;

  constructor(config: PluralSellerConfig) {
    this.secretKey = config.challengeSecretKey;
    this.realm = config.realm ?? DEFAULT_REALM;
    this.defaultExpirySeconds = config.defaultChallengeExpirySeconds ?? DEFAULT_EXPIRY_SECONDS;
  }

  /** Generate a challenge and problem-details response for HTTP 402. */
  async generate(options: ChargeOptions): Promise<ChallengeResult> {
    const expires = new Date(Date.now() + (options.challengeExpirySeconds ?? this.defaultExpirySeconds) * 1000).toISOString();
    const amountMajor = (options.amount.value / 100).toFixed(2);
    const request = {
      scheme: "exact",
      amount: amountMajor,
      currency: options.amount.currency,
      resource: options.resource,
    };
    const challengeId = await computeChallengeId(
      this.secretKey,
      this.realm,
      "plural",
      "charge",
      encodeJson(request),
      expires,
    );
    const challenge: Challenge = {
      id: challengeId,
      realm: this.realm,
      method: "plural",
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
