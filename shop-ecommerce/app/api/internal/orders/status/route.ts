import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "../../../../../db";
import { orders, products, stores } from "../../../../../db/schema";
import { verifyCatalog } from "../../../../../lib/catalogSig";

// Endpoint nội bộ server-to-server: ShopSell cập nhật trạng thái đơn của gian hàng.
// Tin cậy bằng HMAC (CATALOG_SYNC_SECRET). Quy tắc chuyển trạng thái (pending ->
// shipping -> completed) là authoritative ở đây, không tin client.
type OrderStatus = "pending" | "shipping" | "completed";

const ALLOWED_STATUSES: OrderStatus[] = ["pending", "shipping", "completed"];

const VALID_TRANSITIONS: Record<string, OrderStatus[]> = {
  pending: ["shipping"],
  shipping: ["completed"],
  completed: [],
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const data = body?.data;
  const sig = body?.sig;

  if (!data || data.event !== "orders.status" || !verifyCatalog(data, sig)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const sellerId = String(data.sellerId ?? "");
  const all = data.all === true || data.all === "true";
  const orderId = Number(data.orderId);
  const nextStatus = String(data.status ?? "");

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "invalid orderId" }, { status: 400 });
  }

  if (!ALLOWED_STATUSES.includes(nextStatus as OrderStatus)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  if (!all && !sellerId) {
    return NextResponse.json({ error: "missing sellerId" }, { status: 400 });
  }

  // all=false: chỉ cập nhật đơn thuộc gian hàng của sellerId (kiểm tra sở hữu).
  // all=true: bỏ kiểm tra sở hữu (ecommerce_admin/admin), chỉ cần đơn tồn tại.
  const ownership = all
    ? eq(orders.id, orderId)
    : and(eq(orders.id, orderId), eq(stores.ownerId, sellerId));

  const matched = await db
    .select({ orderId: orders.id, currentStatus: orders.status })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(stores, eq(products.storeId, stores.id))
    .where(ownership)
    .limit(1);

  if (matched.length === 0) {
    return NextResponse.json({ error: "order not found or not owned" }, { status: 404 });
  }

  const currentStatus = matched[0].currentStatus ?? "pending";
  const allowedNext = VALID_TRANSITIONS[currentStatus] ?? [];

  if (!allowedNext.includes(nextStatus as OrderStatus)) {
    return NextResponse.json(
      { error: `Không thể chuyển từ "${currentStatus}" sang "${nextStatus}".` },
      { status: 422 }
    );
  }

  await db.update(orders).set({ status: nextStatus }).where(eq(orders.id, orderId));

  return NextResponse.json({ ok: true, orderId, status: nextStatus });
}
