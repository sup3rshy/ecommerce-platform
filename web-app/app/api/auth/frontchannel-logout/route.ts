import { NextRequest, NextResponse } from "next/server";

/**
 * Frontchannel Logout endpoint — Keycloak load URL này trong iframe khi user
 * logout ở app khác. Job: xoá NextAuth session cookie để app này cũng signout.
 *
 * Specs (OpenID Connect Front-Channel Logout 1.0):
 *  - GET request, KHÔNG có body
 *  - Optional query params: iss, sid (có thể verify nếu cần stricter)
 *  - Response: 200 OK với 1x1 transparent gif hoặc empty
 *  - Cookie phải có SameSite=None (cross-site iframe). Hiện app dùng Lax → có thể
 *    không clear được trong incognito strict mode. Tradeoff bảo mật vs UX.
 */
export async function GET(_req: NextRequest) {
  const res = new NextResponse(null, { status: 200 });
  // Xoá cookie NextAuth (custom name của app này)
  for (const name of [
    "ecommerce.session-token",
    "ecommerce.callback-url",
    "ecommerce.csrf-token",
  ]) {
    res.cookies.set(name, "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
  }
  return res;
}
