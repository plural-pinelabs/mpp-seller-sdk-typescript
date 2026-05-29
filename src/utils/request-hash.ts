import { createHash } from "node:crypto";

/** Build the canonical SHA-256 request hash required by `/mpp/v1/debit`. */
export function buildRequestHash(payload: Record<string, unknown>): string {
  const body = canonicalJson(payload) ?? "null";
  return createHash("sha256").update(body).digest("hex");
}

function canonicalJson(value: unknown): string | undefined {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item) ?? "null").join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => {
      const encodedValue = canonicalJson(record[key]);
      return encodedValue === undefined ? undefined : `${JSON.stringify(key)}:${encodedValue}`;
    })
    .filter((entry): entry is string => entry !== undefined);
  return `{${entries.join(",")}}`;
}
