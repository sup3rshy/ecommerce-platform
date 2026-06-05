import crypto from "node:crypto";

/**
 * Ký payload đồng bộ catalog (ShopSell -> ShopEcommerce) bằng HMAC-SHA256 với
 * CATALOG_SYNC_SECRET. Đây là secret RIÊNG cho catalog sync, KHÔNG phải
 * MERCHANT_HMAC_SECRET (payment) hay client_secret OIDC.
 *
 * Canonicalization: sort key + JSON.stringify để tránh delimiter-injection khi
 * value chứa ký tự "&"/"=" (tên/mô tả sản phẩm là free-text). Hai bên (ShopSell
 * ký, ShopEcommerce verify) DÙNG CHUNG hàm này nên kết quả luôn khớp.
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
  // timingSafeEqual cần buffer cùng length
  if (actual.length !== expectedSig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expectedSig));
}
