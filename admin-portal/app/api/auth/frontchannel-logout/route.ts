import { NextResponse } from "next/server";

// Keycloak gọi URL này (frontchannel.logout.url của client admin-portal) khi user
// logout ở app khác. Set marker localStorage để SingleLogoutWatcher các tab khác
// thấy và signOut, đồng thời xoá cookie session của portal.
export async function GET() {
  const res = new NextResponse(
    '<!doctype html><script>try{localStorage.setItem("sso:frontchannel-logout-at",String(Date.now()))}catch(e){}</script>',
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );

  for (const name of [
    "admin-portal.session-token",
    "admin-portal.callback-url",
    "admin-portal.csrf-token",
    "admin-portal.pkce.code_verifier",
    "admin-portal.state",
    "admin-portal.nonce",
  ]) {
    res.cookies.set(name, "", {
      maxAge: 0,
      expires: new Date(0),
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
  }
  return res;
}
