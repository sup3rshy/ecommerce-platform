import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import {
  assignRealmRoleToUser,
  removeRealmRoleFromUser,
} from "../../../../lib/keycloak-admin";

const ASSIGNABLE = new Set([
  "buyer",
  "seller",
  "admin",
  "wallet-user",
  "kyc-verified",
  "staff-warehouse",
  "staff-cs",
  "staff-finance",
]);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(session.user.roles ?? []).includes("admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { userId, role, action } = (await req.json()) as {
    userId?: string;
    role?: string;
    action?: "assign" | "revoke";
  };

  if (!userId || !role || !ASSIGNABLE.has(role)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    if (action === "assign") {
      await assignRealmRoleToUser(userId, role);
    } else if (action === "revoke") {
      await removeRealmRoleFromUser(userId, role);
    } else {
      return NextResponse.json({ error: "bad_action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
