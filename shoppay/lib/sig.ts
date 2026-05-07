import crypto from "node:crypto";

/**
 * Ký payload cross-app bằng HMAC-SHA256. Cả ecommerce và shoppay phải share
 * MERCHANT_HMAC_SECRET (không phải client_secret OIDC!) để verify nhau.
 *
 * Vì sao cần: localhost dev có thể trust nhau, nhưng prod thì merchant
 * (ecommerce) và PSP (shoppay) là 2 service riêng, có thể bị MITM hoặc replay.
 * HMAC + nonce chống tampering + replay.
 */

function getSecret(): string {
  const secret = process.env.MERCHANT_HMAC_SECRET;
  if (!secret) throw new Error("MERCHANT_HMAC_SECRET not set");
  return secret;
}

export function sign(fields: Record<string, string | number>): string {
  // Sort keys để 2 bên ký cùng input
  const ordered = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("&");
  return crypto
    .createHmac("sha256", getSecret())
    .update(ordered)
    .digest("hex");
}

export function verify(
  fields: Record<string, string | number>,
  expectedSig: string
): boolean {
  const actual = sign(fields);
  // timingSafeEqual cần buffer cùng length
  if (actual.length !== expectedSig.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(actual),
    Buffer.from(expectedSig)
  );
}
