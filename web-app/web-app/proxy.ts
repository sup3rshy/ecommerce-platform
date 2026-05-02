import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const isApi = path.startsWith("/api/");

    // CSRF protection cho API state-changing requests
    if (isApi && ["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      const isNextAuthRoute = path.startsWith("/api/auth/");
      if (!isNextAuthRoute) {
        const origin = req.headers.get("origin");
        const host = req.headers.get("host");
        if (origin && host) {
          try {
            if (new URL(origin).host !== host) {
              return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
            }
          } catch {
            return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
          }
        }
      }
    }

    // Seller routes — cho phép /seller/register với buyer
    const isSellerRegistrationPath =
      path === "/seller/register" || path === "/api/seller/register";

    if (
      (path.startsWith("/seller") || path.startsWith("/api/seller")) &&
      !isSellerRegistrationPath &&
      !token?.roles?.includes("seller")
    ) {
      return isApi
        ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
        : NextResponse.redirect(new URL("/", req.url));
    }

    // Admin routes
    if (
      (path.startsWith("/admin") || path.startsWith("/api/admin")) &&
      !token?.roles?.includes("admin")
    ) {
      return isApi
        ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
        : NextResponse.redirect(new URL("/", req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

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