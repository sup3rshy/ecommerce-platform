import { and, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { sellerUpgradeRequests } from "@/db/schema";
import { authOptions } from "../../../../auth/[...nextauth]/route";

type RejectSellerRequestParams = {
  params: Promise<{ requestId: string }>;
};

export async function PATCH(request: Request, { params }: RejectSellerRequestParams) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Chỉ quản trị viên mới có quyền từ chối." }, { status: 403 });
  }

  const { requestId } = await params;
  const parsedRequestId = Number(requestId);

  if (!Number.isInteger(parsedRequestId) || parsedRequestId <= 0) {
    return NextResponse.json({ error: "Mã yêu cầu không hợp lệ." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const reason = body?.reason?.trim() || null;

  const requestRows = await db
    .select({
      id: sellerUpgradeRequests.id,
      status: sellerUpgradeRequests.status,
    })
    .from(sellerUpgradeRequests)
    .where(eq(sellerUpgradeRequests.id, parsedRequestId))
    .limit(1);

  const requestRow = requestRows[0];

  if (!requestRow) {
    return NextResponse.json({ error: "Không tìm thấy yêu cầu." }, { status: 404 });
  }

  if (requestRow.status !== "pending") {
    return NextResponse.json({ error: "Yêu cầu này không còn ở trạng thái chờ duyệt." }, { status: 409 });
  }

  await db
    .update(sellerUpgradeRequests)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: session.user.id,
      adminNote: reason,
    })
    .where(and(eq(sellerUpgradeRequests.id, requestRow.id), eq(sellerUpgradeRequests.status, "pending")));

  return NextResponse.json({
    success: true,
    message: "Đã từ chối yêu cầu nâng cấp seller.",
  });
}
