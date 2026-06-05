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
    "seller-workspace.session-token",
    "seller-workspace.callback-url",
    "seller-workspace.csrf-token",
    "seller-workspace.pkce.code_verifier",
    "seller-workspace.state",
    "seller-workspace.nonce",
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
