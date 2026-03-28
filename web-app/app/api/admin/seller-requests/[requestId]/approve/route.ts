import { and, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { sellerUpgradeRequests, stores } from "@/db/schema";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import { assignRealmRoleToUser } from "@/lib/keycloak-admin";

type ApproveSellerRequestParams = {
  params: Promise<{ requestId: string }>;
};

export async function PATCH(_request: Request, { params }: ApproveSellerRequestParams) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Chỉ quản trị viên mới có quyền phê duyệt." }, { status: 403 });
  }

  const { requestId } = await params;
  const parsedRequestId = Number(requestId);

  if (!Number.isInteger(parsedRequestId) || parsedRequestId <= 0) {
    return NextResponse.json({ error: "Mã yêu cầu không hợp lệ." }, { status: 400 });
  }

  const requestRows = await db
    .select({
      id: sellerUpgradeRequests.id,
      userId: sellerUpgradeRequests.userId,
      storeName: sellerUpgradeRequests.storeName,
      status: sellerUpgradeRequests.status,
    })
    .from(sellerUpgradeRequests)
    .where(eq(sellerUpgradeRequests.id, parsedRequestId))
    .limit(1);

  const requestRow = requestRows[0];

  if (!requestRow) {
    return NextResponse.json({ error: "Không tìm thấy yêu cầu cần phê duyệt." }, { status: 404 });
  }

  if (requestRow.status !== "pending") {
    return NextResponse.json({ error: "Yêu cầu này không còn ở trạng thái chờ duyệt." }, { status: 409 });
  }

  try {
    await assignRealmRoleToUser(requestRow.userId, "seller");
  } catch (error) {
    console.error("Failed to assign seller role:", error);
    return NextResponse.json({ error: "Không thể cấp quyền seller trên Keycloak." }, { status: 502 });
  }

  await db.transaction(async (tx) => {
    const existingStore = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.ownerId, requestRow.userId))
      .limit(1);

    if (existingStore.length === 0) {
      await tx.insert(stores).values({
        ownerId: requestRow.userId,
        name: requestRow.storeName,
      });
    }

    await tx
      .update(sellerUpgradeRequests)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        reviewedBy: session.user.id,
      })
      .where(and(eq(sellerUpgradeRequests.id, requestRow.id), eq(sellerUpgradeRequests.status, "pending")));
  });

  return NextResponse.json({
    success: true,
    message: "Đã phê duyệt yêu cầu và cấp quyền seller thành công.",
  });
}
