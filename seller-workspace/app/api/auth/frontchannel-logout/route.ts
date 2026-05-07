import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  const res = new NextResponse(null, { status: 200 });
  for (const name of [
    "seller-workspace.session-token",
    "seller-workspace.callback-url",
    "seller-workspace.csrf-token",
  ]) {
    res.cookies.set(name, "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
  }
  return res;
}
