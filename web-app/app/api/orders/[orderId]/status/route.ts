import { and, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../../../auth/[...nextauth]/route";
import { db } from "../../../../../db";
import { orders, products, stores } from "../../../../../db/schema";

type OrderStatus = "pending" | "shipping" | "completed";

const ALLOWED_STATUSES: OrderStatus[] = ["pending", "shipping", "completed"];

type RouteContext = {
  params: Promise<{ orderId: string }> | { orderId: string };
};

export async function PATCH(req: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập để thực hiện thao tác này." }, { status: 401 });
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("seller")) {
    return NextResponse.json({ error: "Chỉ tài khoản người bán mới có quyền cập nhật trạng thái." }, { status: 403 });
  }

  const routeParams = await Promise.resolve(context.params);
  const orderId = Number(routeParams.orderId);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "Mã đơn hàng không hợp lệ." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { status?: string } | null;
  const nextStatus = body?.status;

  if (!nextStatus || !ALLOWED_STATUSES.includes(nextStatus as OrderStatus)) {
    return NextResponse.json({ error: "Trạng thái cập nhật không hợp lệ." }, { status: 400 });
  }

  const matchedOrder = await db
    .select({ orderId: orders.id })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(stores, eq(products.storeId, stores.id))
    .where(and(eq(orders.id, orderId), eq(stores.ownerId, session.user.id)))
    .limit(1);

  if (matchedOrder.length === 0) {
    return NextResponse.json({ error: "Bạn không có quyền cập nhật đơn hàng này." }, { status: 404 });
  }

  await db.update(orders).set({ status: nextStatus }).where(eq(orders.id, orderId));

  return NextResponse.json({ success: true, orderId, status: nextStatus });
}
