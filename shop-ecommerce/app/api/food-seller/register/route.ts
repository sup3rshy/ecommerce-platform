import { and, desc, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { db } from "../../../../db";
import { sellerUpgradeRequests } from "../../../../db/schema";

type FoodSellerRegistrationBody = {
  // tên nhà hàng (tái dùng cột storeName của bảng upgrade request)
  storeName?: string;
};

// Buyer xin nâng quyền food-seller (chủ nhà hàng ShopFood). Song song luồng seller,
// nhưng kind="food-seller" và KHÔNG tạo record stores (ShopFood quản lý menu riêng).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập để đăng ký bán đồ ăn." }, { status: 401 });
  }

  const roles = session.user.roles ?? [];

  if (!roles.includes("buyer")) {
    return NextResponse.json({ error: "Chỉ tài khoản buyer mới có thể đăng ký bán đồ ăn." }, { status: 403 });
  }

  if (roles.includes("food-seller")) {
    return NextResponse.json({ error: "Tài khoản của bạn đã có quyền food-seller." }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as FoodSellerRegistrationBody | null;
  const storeName = body?.storeName?.trim();

  if (!storeName || storeName.length < 3) {
    return NextResponse.json(
      { error: "Tên nhà hàng phải có ít nhất 3 ký tự." },
      { status: 400 }
    );
  }

  const latestRequest = await db
    .select({
      status: sellerUpgradeRequests.status,
    })
    .from(sellerUpgradeRequests)
    .where(
      and(
        eq(sellerUpgradeRequests.userId, session.user.id),
        eq(sellerUpgradeRequests.kind, "food-seller")
      )
    )
    .orderBy(desc(sellerUpgradeRequests.requestedAt))
    .limit(1);

  if (latestRequest[0]?.status === "pending") {
    return NextResponse.json({ error: "Bạn đang có yêu cầu food-seller chờ phê duyệt." }, { status: 409 });
  }

  if (latestRequest[0]?.status === "approved") {
    return NextResponse.json(
      { error: "Yêu cầu của bạn đã được phê duyệt. Vui lòng đăng nhập lại để nhận quyền food-seller." },
      { status: 409 }
    );
  }

  await db.insert(sellerUpgradeRequests).values({
    userId: session.user.id,
    kind: "food-seller",
    storeName,
    status: "pending",
  });

  return NextResponse.json({
    success: true,
    message: "Yêu cầu food-seller đã được ghi nhận và đang chờ quản trị viên phê duyệt.",
  });
}
