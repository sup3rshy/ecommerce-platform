import { desc, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { db } from "../../../../db";
import { sellerUpgradeRequests, stores } from "../../../../db/schema";

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

  const latestRequest = await db
    .select({
      id: sellerUpgradeRequests.id,
      status: sellerUpgradeRequests.status,
    })
    .from(sellerUpgradeRequests)
    .where(eq(sellerUpgradeRequests.userId, session.user.id))
    .orderBy(desc(sellerUpgradeRequests.requestedAt))
    .limit(1);

  if (latestRequest[0]?.status === "pending") {
    return NextResponse.json({ error: "Bạn đang có yêu cầu chờ quản trị viên phê duyệt." }, { status: 409 });
  }

  if (latestRequest[0]?.status === "approved") {
    return NextResponse.json(
      { error: "Yêu cầu của bạn đã được phê duyệt. Vui lòng đăng nhập lại để nhận quyền seller." },
      { status: 409 }
    );
  }

  await db.insert(sellerUpgradeRequests).values({
    userId: session.user.id,
    storeName,
    status: "pending",
  });

  return NextResponse.json({
    success: true,
    requiresReLogin: false,
    message: "Yêu cầu đã được ghi nhận và đang chờ quản trị viên phê duyệt.",
  });
}