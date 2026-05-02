import { and, eq, gte, sql } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { db } from "../../../../db";
import { cartItems, orders, products, stores } from "../../../../db/schema";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập để thanh toán." }, { status: 401 });
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("buyer")) {
    return NextResponse.json({ error: "Chỉ tài khoản buyer mới thanh toán được." }, { status: 403 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: cartItems.id,
          productId: cartItems.productId,
          quantity: cartItems.quantity,
          name: products.name,
          price: products.price,
          stock: products.stock,
          storeId: products.storeId,
        })
        .from(cartItems)
        .innerJoin(products, eq(cartItems.productId, products.id))
        .where(eq(cartItems.userId, session.user.id));

      if (rows.length === 0) {
        throw new Error("EMPTY_CART");
      }

      // Kiểm tra không cho mua sản phẩm của chính mình
      const userStores = await tx
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.ownerId, session.user!.id!));

      const userStoreIds = new Set(userStores.map((s) => s.id));
      const ownProducts = rows.filter((item) => item.storeId !== null && userStoreIds.has(item.storeId));

      if (ownProducts.length > 0) {
        const names = ownProducts.map((i) => `"${i.name}"`).join(", ");
        throw new Error(`OWN_PRODUCT:${names}`);
      }

      const orderValues = rows.map((item) => ({
        userId: session.user!.id!,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.price,
        status: "pending",
      }));

      await tx.insert(orders).values(orderValues);

      // Atomic stock update with WHERE stock >= quantity to prevent overselling
      for (const item of rows) {
        const updated = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${item.quantity}` })
          .where(and(eq(products.id, item.productId), gte(products.stock, item.quantity)))
          .returning({ id: products.id });

        if (updated.length === 0) {
          throw new Error(`OUT_OF_STOCK:${item.name}`);
        }
      }

      await tx.delete(cartItems).where(eq(cartItems.userId, session.user!.id!));

      const totalAmount = rows.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const totalItems = rows.reduce((sum, item) => sum + item.quantity, 0);
      return { totalAmount, totalItems, firstProduct: rows[0].name };
    });

    const redirectUrl = `/success?fromCart=1&items=${result.totalItems}&total=${result.totalAmount}&product=${encodeURIComponent(result.firstProduct)}`;
    return NextResponse.json({ success: true, url: redirectUrl });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "EMPTY_CART") {
      return NextResponse.json({ error: "Giỏ hàng đang trống." }, { status: 400 });
    }
    if (msg.startsWith("OWN_PRODUCT:")) {
      return NextResponse.json({ error: `Không thể mua sản phẩm của chính mình: ${msg.slice(12)}` }, { status: 403 });
    }
    if (msg.startsWith("OUT_OF_STOCK:")) {
      return NextResponse.json({ error: `Không đủ tồn kho: "${msg.slice(13)}"` }, { status: 409 });
    }
    return NextResponse.json({ error: "Đã có lỗi xảy ra khi thanh toán." }, { status: 500 });
  }
}
