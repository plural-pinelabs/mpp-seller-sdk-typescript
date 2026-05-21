import { PluralSellerConfig } from "../types";

export function validateConfig(config: PluralSellerConfig): void {
  if (!config.clientId || !config.clientSecret || !config.challengeSecretKey) {
    throw new Error("PluralSellerConfig: clientId, clientSecret and challengeSecretKey are required");
  }
}
