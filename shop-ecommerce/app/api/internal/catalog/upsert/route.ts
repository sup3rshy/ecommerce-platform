import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "../../../../../db";
import { products, stores } from "../../../../../db/schema";
import { verifyCatalog } from "../../../../../lib/catalogSig";

// Endpoint nội bộ server-to-server: ShopSell đẩy sản phẩm sang storefront.
// KHÔNG dùng session/OIDC — tin cậy bằng HMAC (CATALOG_SYNC_SECRET). proxy.ts
// không match /api/internal nên không bị chặn bởi auth.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const data = body?.data;
  const sig = body?.sig;

  if (!data || data.event !== "upsert" || !verifyCatalog(data, sig)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const sellerId = String(data.sellerId ?? "");
  const sku = String(data.sku ?? "");
  const name = String(data.name ?? "");
  if (!sellerId || !sku || !name) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const price = Math.max(0, Math.floor(Number(data.price) || 0));
  const stock = Math.max(0, Math.floor(Number(data.stock) || 0));
  const status = data.status === "hidden" ? "hidden" : "active";
  const description = data.description ? String(data.description) : null;
  const imageUrl = data.imageUrl ? String(data.imageUrl) : null;
  const storeName = data.storeName
    ? String(data.storeName)
    : `Shop ${sellerId.slice(0, 6)}`;

  // find-or-create store cho seller (storefront nhóm sản phẩm theo gian hàng).
  let store = (
    await db.select().from(stores).where(eq(stores.ownerId, sellerId)).limit(1)
  )[0];
  if (!store) {
    [store] = await db
      .insert(stores)
      .values({ ownerId: sellerId, name: storeName })
      .returning();
  } else if (store.name !== storeName) {
    await db.update(stores).set({ name: storeName }).where(eq(stores.id, store.id));
  }

  // Upsert idempotent theo (sellerId, sku). stock đồng bộ từ ShopSell (seller-authoritative).
  await db
    .insert(products)
    .values({
      storeId: store.id,
      sellerId,
      sku,
      name,
      price,
      stock,
      status,
      description,
      imageUrl,
    })
    .onConflictDoUpdate({
      target: [products.sellerId, products.sku],
      set: {
        storeId: store.id,
        name,
        price,
        stock,
        status,
        description,
        imageUrl,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true });
}
