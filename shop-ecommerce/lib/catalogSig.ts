import crypto from "node:crypto";

/**
 * Verify payload đồng bộ catalog đến từ ShopSell. Phải DÙNG CHUNG canonicalization
 * với shop-sell/lib/catalogSig.ts (sort key + JSON.stringify) thì chữ ký mới khớp.
 *
 * CATALOG_SYNC_SECRET là secret RIÊNG cho catalog sync, không phải MERCHANT_HMAC_SECRET.
 */

function getSecret(): string {
  const secret = process.env.CATALOG_SYNC_SECRET;
  if (!secret) throw new Error("CATALOG_SYNC_SECRET not set");
  return secret;
}

function canonical(fields: Record<string, unknown>): string {
  const norm: Record<string, string> = {};
  for (const key of Object.keys(fields).sort()) {
    const value = fields[key];
    norm[key] = value === null || value === undefined ? "" : String(value);
  }
  return JSON.stringify(norm);
}

export function signCatalog(fields: Record<string, unknown>): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(canonical(fields))
    .digest("hex");
}

export function verifyCatalog(
  fields: Record<string, unknown>,
  expectedSig: unknown
): boolean {
  if (typeof expectedSig !== "string") return false;
  const actual = signCatalog(fields);
  if (actual.length !== expectedSig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expectedSig));
}
