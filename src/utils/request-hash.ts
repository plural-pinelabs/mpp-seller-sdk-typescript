import { createHash } from "node:crypto";

/** Build the canonical SHA-256 request hash required by `/mpp/v1/debit`. */
export function buildRequestHash(payload: Record<string, unknown>): string {
  const body = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(body).digest("hex");
}
