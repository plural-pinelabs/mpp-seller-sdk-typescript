export const CHALLENGE_HMAC_KEY_PREFIX = "p3p-challenge-v1:";

export function deriveChallengeHmacKey(clientSecret: string): string {
  return `${CHALLENGE_HMAC_KEY_PREFIX}${clientSecret}`;
}

export async function computeHmacSha256(key: string, data: string): Promise<string> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function computeChallengeId(
  secretKey: string,
  realm: string,
  intent: string,
  requestBase64: string,
  expires: string,
): Promise<string> {
  const payload = `${realm}|${intent}|${requestBase64}|${expires}`;
  return `ch_${await computeHmacSha256(secretKey, payload)}`;
}
