export declare const P3PEnvironment: {
    readonly SANDBOX: "https://pluraluat.v2.pinepg.in";
    readonly PRODUCTION: "https://api.pluralpay.in";
};
export type P3PEnvironmentValue = typeof P3PEnvironment[keyof typeof P3PEnvironment];
export declare const P3PEnvironmentDefaults: {
    readonly "https://pluraluat.v2.pinepg.in": {
        readonly requestTimeoutMs: 60000;
        readonly maxRetries: 2;
        readonly initialRetryDelayMs: 300;
    };
    readonly "https://api.pluralpay.in": {
        readonly requestTimeoutMs: 45000;
        readonly maxRetries: 2;
        readonly initialRetryDelayMs: 200;
    };
};
export declare function isP3PEnvironment(value: unknown): value is P3PEnvironmentValue;
export declare function resolveP3PBaseUrl(env: P3PEnvironmentValue): string;
export declare function withP3PEnvironmentDefaults<T extends {
    env: P3PEnvironmentValue;
    requestTimeoutMs?: number;
    maxRetries?: number;
    initialRetryDelayMs?: number;
}>(config: T): T & {
    requestTimeoutMs: number;
    maxRetries: number;
    initialRetryDelayMs: number;
};
export declare const DEFAULT_BASE_URL: "https://api.pluralpay.in";
export declare const DEFAULT_REALM: "https://api.pluralpay.in";
