import { eq, sql } from "drizzle-orm";
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

  const rows = await db
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
    return NextResponse.json({ error: "Giỏ hàng đang trống." }, { status: 400 });
  }

  // Kiểm tra không cho mua sản phẩm của chính mình
  const userStores = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, session.user.id));

  const userStoreIds = new Set(userStores.map((s) => s.id));
  const ownProducts = rows.filter((item) => item.storeId !== null && userStoreIds.has(item.storeId));

  if (ownProducts.length > 0) {
    const names = ownProducts.map((i) => `"${i.name}"`).join(", ");
    return NextResponse.json({ error: `Không thể mua sản phẩm của chính mình: ${names}` }, { status: 403 });
  }

  const outOfStock = rows.filter((item) => item.stock < item.quantity);
  if (outOfStock.length > 0) {
    const names = outOfStock.map((i) => `"${i.name}" (còn ${i.stock})`).join(", ");
    return NextResponse.json({ error: `Không đủ tồn kho: ${names}` }, { status: 409 });
  }

  const totalAmount = rows.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = rows.reduce((sum, item) => sum + item.quantity, 0);

  await db.transaction(async (tx) => {
    const orderValues = rows.map((item) => ({
      userId: session.user!.id!,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.price,
      status: "pending",
    }));

    await tx.insert(orders).values(orderValues);

    for (const item of rows) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${item.quantity}` })
        .where(eq(products.id, item.productId));
    }

    await tx.delete(cartItems).where(eq(cartItems.userId, session.user!.id!));
  });

  const firstProduct = rows[0].name;
  const redirectUrl = `/success?fromCart=1&items=${totalItems}&total=${totalAmount}&product=${encodeURIComponent(firstProduct)}`;

  return NextResponse.json({ success: true, url: redirectUrl });
}
