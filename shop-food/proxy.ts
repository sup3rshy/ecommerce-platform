import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Trang chủ `/` (xem thực đơn) để công khai. Các route cần đăng nhập: /cart,
// /orders (buyer) và /admin (food_admin). Per-action check role làm thêm trong
// server action / page guard.
export async function proxy(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: "shopfood.session-token",
  });

  if (!token || token.error === "RefreshAccessTokenError") {
    const signInUrl = new URL("/api/auth/signin", req.url);
    signInUrl.searchParams.set(
      "callbackUrl",
      req.nextUrl.pathname + req.nextUrl.search
    );
    return NextResponse.redirect(signInUrl);
  }

  const roles = (token.roles ?? []) as string[];

  // Khu quản trị chỉ cho food_admin (hoặc admin nền tảng).
  if (req.nextUrl.pathname.startsWith("/admin")) {
    const allowed = roles.includes("food_admin") || roles.includes("admin");
    if (!allowed) {
      return NextResponse.redirect(new URL("/denied", req.url));
    }
  }
}

export const config = {
  matcher: ["/cart/:path*", "/orders/:path*", "/admin/:path*"],
};
