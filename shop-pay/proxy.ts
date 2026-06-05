import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Mọi user login đều có ví. Một số action nâng cao (giao dịch lớn) cần kyc-verified.
// Ở proxy chỉ enforce authenticated; per-action check role làm trong server actions.

export async function proxy(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: "shoppay.session-token",
  });

  if (!token || token.error === "RefreshAccessTokenError") {
    const signInUrl = new URL("/api/auth/signin", req.url);
    // Giữ cả query string vào callbackUrl — quan trọng cho /pay vì params thanh toán nằm ở đó
    signInUrl.searchParams.set(
      "callbackUrl",
      req.nextUrl.pathname + req.nextUrl.search
    );
    return NextResponse.redirect(signInUrl);
  }
}

export const config = {
  matcher: ["/wallet/:path*", "/topup/:path*", "/kyc/:path*", "/pay/:path*"],
};
