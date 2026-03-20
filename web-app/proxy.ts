import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function proxy(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    const isSellerRegistrationPath = path === "/seller/register";

    if (path.startsWith("/seller") && !isSellerRegistrationPath && !token?.roles?.includes("seller")) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (path.startsWith("/admin") && !token?.roles?.includes("admin")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = { matcher: ["/seller/:path*", "/admin/:path*"] };