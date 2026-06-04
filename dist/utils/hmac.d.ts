export declare const CHALLENGE_HMAC_KEY_PREFIX = "p3p-challenge-v1:";
export declare function deriveChallengeHmacKey(clientSecret: string): string;
export declare function computeHmacSha256(key: string, data: string): Promise<string>;
export declare function computeChallengeId(secretKey: string, realm: string, intent: string, requestBase64: string, expires: string): Promise<string>;
