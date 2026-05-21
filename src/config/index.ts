export const MppEnvironment = {
  SANDBOX: "https://pluraluat.v2.pinepg.in",
  PRODUCTION: "https://api.pluralpay.in",
} as const;

export const DEFAULT_BASE_URL = MppEnvironment.PRODUCTION;
export const DEFAULT_REALM = MppEnvironment.PRODUCTION;
