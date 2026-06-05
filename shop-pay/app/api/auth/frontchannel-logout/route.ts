import { NextResponse } from "next/server";

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
    "shoppay.session-token",
    "shoppay.callback-url",
    "shoppay.csrf-token",
    "shoppay.pkce.code_verifier",
    "shoppay.state",
    "shoppay.nonce",
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
