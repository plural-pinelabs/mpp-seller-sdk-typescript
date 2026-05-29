export const P3PEnvironment = {
  SANDBOX: "https://pluraluat.v2.pinepg.in",
  PRODUCTION: "https://api.pluralpay.in",
} as const;

export type P3PEnvironmentValue = typeof P3PEnvironment[keyof typeof P3PEnvironment];

export const P3PEnvironmentDefaults = {
  [P3PEnvironment.SANDBOX]: {
    requestTimeoutMs: 30_000,
    maxRetries: 2,
    initialRetryDelayMs: 300,
  },
  [P3PEnvironment.PRODUCTION]: {
    requestTimeoutMs: 10_000,
    maxRetries: 2,
    initialRetryDelayMs: 200,
  },
} as const;

export function isP3PEnvironment(value: unknown): value is P3PEnvironmentValue {
  return value === P3PEnvironment.SANDBOX || value === P3PEnvironment.PRODUCTION;
}

export function resolveP3PBaseUrl(env: P3PEnvironmentValue): string {
  if (!isP3PEnvironment(env)) {
    throw new Error("env must be P3PEnvironment.SANDBOX or P3PEnvironment.PRODUCTION");
  }
  return env;
}

export function withP3PEnvironmentDefaults<
  T extends {
    env: P3PEnvironmentValue;
    requestTimeoutMs?: number;
    maxRetries?: number;
    initialRetryDelayMs?: number;
  },
>(config: T): T & { requestTimeoutMs: number; maxRetries: number; initialRetryDelayMs: number } {
  const defaults = P3PEnvironmentDefaults[config.env];
  return {
    ...config,
    requestTimeoutMs: config.requestTimeoutMs ?? defaults.requestTimeoutMs,
    maxRetries: config.maxRetries ?? defaults.maxRetries,
    initialRetryDelayMs: config.initialRetryDelayMs ?? defaults.initialRetryDelayMs,
  };
}

export const DEFAULT_BASE_URL = P3PEnvironment.PRODUCTION;
export const DEFAULT_REALM = P3PEnvironment.PRODUCTION;
