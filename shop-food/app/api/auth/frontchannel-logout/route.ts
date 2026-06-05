import { NextResponse } from "next/server";

// Keycloak gọi URL này (đăng ký trong client `shopfood-app`:
// frontchannel.logout.url) khi user logout ở bất kỳ app nào trong SSO. Đặt marker
// localStorage để SingleLogoutWatcher ở các tab khác nhận biết + signOut, đồng
// thời xoá cookie session của ShopFood.
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
    "shopfood.session-token",
    "shopfood.callback-url",
    "shopfood.csrf-token",
    "shopfood.pkce.code_verifier",
    "shopfood.state",
    "shopfood.nonce",
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
