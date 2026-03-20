import { and, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { db } from "../../../../db";
import { stores } from "../../../../db/schema";
import { assignRealmRoleToUser } from "../../../../lib/keycloak-admin";

type SellerRegistrationBody = {
  storeName?: string;
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập để đăng ký gian hàng." }, { status: 401 });
  }

  const roles = session.user.roles ?? [];

  if (!roles.includes("buyer")) {
    return NextResponse.json({ error: "Chỉ tài khoản buyer mới có thể đăng ký bán hàng." }, { status: 403 });
  }

  if (roles.includes("seller")) {
    return NextResponse.json({ error: "Tài khoản của bạn đã có quyền seller." }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as SellerRegistrationBody | null;
  const storeName = body?.storeName?.trim();

  if (!storeName || storeName.length < 3) {
    return NextResponse.json(
      { error: "Tên gian hàng phải có ít nhất 3 ký tự." },
      { status: 400 }
    );
  }

  const existingStore = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, session.user.id))
    .limit(1);

  if (existingStore.length > 0) {
    return NextResponse.json({ error: "Bạn đã có gian hàng trước đó." }, { status: 409 });
  }

  const inserted = await db
    .insert(stores)
    .values({
      ownerId: session.user.id,
      name: storeName,
    })
    .returning({ id: stores.id });

  try {
    await assignRealmRoleToUser(session.user.id, "seller");
  } catch (error) {
    await db.delete(stores).where(and(eq(stores.ownerId, session.user.id), eq(stores.id, inserted[0].id)));

    console.error("Seller role assignment failed:", error);
    return NextResponse.json(
      { error: "Không thể cấp quyền seller lúc này. Vui lòng thử lại sau." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    requiresReLogin: true,
    message: "Đăng ký gian hàng thành công. Vui lòng đăng nhập lại để kích hoạt quyền seller.",
  });
}