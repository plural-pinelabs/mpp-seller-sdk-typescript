export declare function computeHmacSha256(key: string, data: string): Promise<string>;
export declare function computeChallengeId(secretKey: string, realm: string, method: string, intent: string, requestBase64: string, expires: string): Promise<string>;
