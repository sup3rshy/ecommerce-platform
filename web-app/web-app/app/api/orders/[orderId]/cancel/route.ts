import { and, eq, sql } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../../../auth/[...nextauth]/route";
import { db } from "../../../../../db";
import { orders, products } from "../../../../../db/schema";

type RouteContext = {
  params: Promise<{ orderId: string }> | { orderId: string };
};

export async function PATCH(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("buyer")) {
    return NextResponse.json({ error: "Chỉ buyer mới có thể hủy đơn hàng." }, { status: 403 });
  }

  const routeParams = await Promise.resolve(context.params);
  const orderId = Number(routeParams.orderId);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "Mã đơn hàng không hợp lệ." }, { status: 400 });
  }

  const orderRows = await db
    .select({
      id: orders.id,
      status: orders.status,
      productId: orders.productId,
      quantity: orders.quantity,
      userId: orders.userId,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, session.user.id)))
    .limit(1);

  if (orderRows.length === 0) {
    return NextResponse.json({ error: "Không tìm thấy đơn hàng." }, { status: 404 });
  }

  const order = orderRows[0];

  if (order.status !== "pending") {
    return NextResponse.json({ error: "Chỉ có thể hủy đơn hàng đang chờ xử lý." }, { status: 422 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ status: "cancelled" })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending")));

    // Restore stock if product still exists
    if (order.productId) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${order.quantity}` })
        .where(eq(products.id, order.productId));
    }
  });

  return NextResponse.json({ success: true, message: "Đã hủy đơn hàng thành công." });
}
