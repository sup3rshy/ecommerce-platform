import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isPlatformAdmin } from "./lib/scope";

// Trang chủ `/` công khai (hiện nút đăng nhập). Mọi route quản trị yêu cầu đăng
// nhập + role admin nền tảng. Per-platform/per-role enforce thêm ở từng page/action.
export async function proxy(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: "admin-portal.session-token",
  });

  if (!token || token.error === "RefreshAccessTokenError") {
    const signInUrl = new URL("/api/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  const roles = (token.roles ?? []) as string[];
  if (!isPlatformAdmin(roles)) {
    return NextResponse.redirect(new URL("/denied", req.url));
  }
}

export const config = {
  matcher: ["/ecommerce/:path*", "/food/:path*", "/users/:path*", "/kyc/:path*", "/audit/:path*"],
};
