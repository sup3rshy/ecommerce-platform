import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export default async function proxy(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: "ecommerce.session-token",
  });

  const path = req.nextUrl.pathname;
  const isApi = path.startsWith("/api/");

  if (!token) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const signInUrl = new URL("/api/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(signInUrl);
  }

  const roles = (token.roles ?? []) as string[];

  // Seller routes — cho phép /seller/register với buyer
  const isSellerRegistrationPath =
    path === "/seller/register" || path === "/api/seller/register";

  if (
    (path.startsWith("/seller") || path.startsWith("/api/seller")) &&
    !isSellerRegistrationPath &&
    !roles.includes("seller")
  ) {
    return isApi
      ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
      : NextResponse.redirect(new URL("/", req.url));
  }

  // Admin routes
  if (
    (path.startsWith("/admin") || path.startsWith("/api/admin")) &&
    !roles.includes("admin")
  ) {
    return isApi
      ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
      : NextResponse.redirect(new URL("/", req.url));
  }
}

export const config = {
  matcher: [
    "/seller/:path*",
    "/admin/:path*",
    "/api/seller/:path*",
    "/api/admin/:path*",
    "/account",
    "/api/cart/:path*",
    "/api/orders/:path*",
    "/api/mock-payment/:path*",
  ],
};
