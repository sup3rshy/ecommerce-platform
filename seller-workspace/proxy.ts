import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const ALLOWED_ROLES = [
  "seller",
  "admin",
  "staff-warehouse",
  "staff-cs",
  "staff-finance",
];

export default async function proxy(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: "seller-workspace.session-token",
  });

  if (!token) {
    const signInUrl = new URL("/api/auth/signin", req.url);
    signInUrl.searchParams.set(
      "callbackUrl",
      req.nextUrl.pathname + req.nextUrl.search
    );
    return NextResponse.redirect(signInUrl);
  }

  const roles = (token.roles ?? []) as string[];
  const allowed = roles.some((r) => ALLOWED_ROLES.includes(r));
  if (!allowed) {
    return NextResponse.redirect(new URL("/denied", req.url));
  }
}

// Chặn toàn bộ :3100 trừ:
//   - /denied (page hiện thông báo)
//   - /api/auth/* (NextAuth flow cần unauthenticated access)
//   - /_next/* (static assets, font, image)
//   - /favicon.ico
export const config = {
  matcher: ["/((?!denied|api/auth|_next|favicon.ico).*)"],
};
