import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "../../../../../db";
import { products } from "../../../../../db/schema";
import { verifyCatalog } from "../../../../../lib/catalogSig";

// ShopSell báo xoá sản phẩm. Soft-delete (status='deleted') để giữ lịch sử đơn
// hàng (orders.productId vẫn trỏ tới row). Storefront chỉ hiện status='active'.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const data = body?.data;
  const sig = body?.sig;

  if (!data || data.event !== "delete" || !verifyCatalog(data, sig)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const sellerId = String(data.sellerId ?? "");
  const sku = String(data.sku ?? "");
  if (!sellerId || !sku) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  await db
    .update(products)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(and(eq(products.sellerId, sellerId), eq(products.sku, sku)));

  return NextResponse.json({ ok: true });
}
