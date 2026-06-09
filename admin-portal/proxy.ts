import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isPlatformAdmin } from "./lib/scope";

const protectedPrefixes = ["/ecommerce", "/food", "/users", "/kyc", "/audit"];
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function hostnameFromHeader(hostHeader: string) {
  const host = hostHeader.split(",")[0]?.trim().toLowerCase() ?? "";
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end > 0 ? host.slice(1, end) : host;
  }
  return host.split(":")[0];
}

function getCanonicalRedirect(req: NextRequest) {
  const nextAuthUrl = process.env.NEXTAUTH_URL;
  if (!nextAuthUrl) return null;

  const canonical = new URL(nextAuthUrl);
  if (loopbackHosts.has(canonical.hostname.toLowerCase())) return null;

  const requestHost = hostnameFromHeader(
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host,
  );
  if (!loopbackHosts.has(requestHost)) return null;

  const url = req.nextUrl.clone();
  url.protocol = canonical.protocol;
  url.hostname = canonical.hostname;
  url.port = canonical.port;
  return url;
}

// Trang chủ `/` công khai (hiện nút đăng nhập). Mọi route quản trị yêu cầu đăng
// nhập + role admin nền tảng. Per-platform/per-role enforce thêm ở từng page/action.
export async function proxy(req: NextRequest) {
  const canonicalRedirect = getCanonicalRedirect(req);
  if (canonicalRedirect) return NextResponse.redirect(canonicalRedirect);

  const isProtectedRoute = protectedPrefixes.some(
    (prefix) => req.nextUrl.pathname === prefix || req.nextUrl.pathname.startsWith(`${prefix}/`),
  );
  if (!isProtectedRoute) return NextResponse.next();

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: "admin-portal.session-token",
  });

  if (!token || token.error === "RefreshAccessTokenError") {
    const signInUrl = new URL("/auth/sso", req.url);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  const roles = (token.roles ?? []) as string[];
  if (!isPlatformAdmin(roles)) {
    return NextResponse.redirect(new URL("/denied", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
