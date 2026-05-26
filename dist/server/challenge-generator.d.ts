import { ChallengeResult, ChargeOptions, PluralSellerConfig } from "../types";
export declare class ChallengeGenerator {
    private readonly secretKey;
    private readonly realm;
    private readonly defaultExpirySeconds;
    constructor(config: PluralSellerConfig);
    /** Generate a challenge and problem-details response for HTTP 402. */
    generate(options: ChargeOptions): Promise<ChallengeResult>;
}
