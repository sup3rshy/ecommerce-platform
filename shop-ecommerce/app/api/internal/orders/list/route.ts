import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "../../../../../db";
import { orders, products, stores } from "../../../../../db/schema";
import { verifyCatalog } from "../../../../../lib/catalogSig";

// Endpoint nội bộ server-to-server: ShopSell đọc đơn hàng của gian hàng để xử lý
// (quản lý đơn đã chuyển từ ShopEcommerce sang ShopSell). KHÔNG dùng session/OIDC
// — tin cậy bằng HMAC (CATALOG_SYNC_SECRET), giống kênh catalog sync. proxy.ts
// không match /api/internal nên không bị chặn bởi auth.
//
// scope do ShopSell quyết định sau khi đã verify role của user:
//   - all = false (mặc định): chỉ đơn thuộc gian hàng của sellerId.
//   - all = true: toàn bộ đơn (cho ecommerce_admin/admin).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const data = body?.data;
  const sig = body?.sig;

  if (!data || data.event !== "orders.list" || !verifyCatalog(data, sig)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const sellerId = String(data.sellerId ?? "");
  const all = data.all === true || data.all === "true";

  if (!all && !sellerId) {
    return NextResponse.json({ error: "missing sellerId" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: orders.id,
      buyerId: orders.userId,
      quantity: orders.quantity,
      unitPrice: orders.unitPrice,
      status: orders.status,
      createdAt: orders.createdAt,
      productName: products.name,
      sellerId: stores.ownerId,
      storeName: stores.name,
    })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(stores, eq(products.storeId, stores.id))
    .where(all ? undefined : eq(stores.ownerId, sellerId))
    .orderBy(desc(orders.createdAt));

  const result = rows.map((row) => ({
    id: row.id,
    buyerId: row.buyerId,
    productName: row.productName,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    status: row.status ?? "pending",
    sellerId: row.sellerId,
    storeName: row.storeName,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  }));

  return NextResponse.json({ ok: true, orders: result });
}
