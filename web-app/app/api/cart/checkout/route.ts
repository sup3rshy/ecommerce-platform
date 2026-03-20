import { eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { db } from "../../../../db";
import { cartItems, orders, products } from "../../../../db/schema";

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
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.userId, session.user.id));

  if (rows.length === 0) {
    return NextResponse.json({ error: "Giỏ hàng đang trống." }, { status: 400 });
  }

  const totalAmount = rows.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = rows.reduce((sum, item) => sum + item.quantity, 0);

  // Giả lập thời gian xử lý ở cổng thanh toán.
  await new Promise((resolve) => setTimeout(resolve, 1200));

  for (const item of rows) {
    const orderRows = Array.from({ length: item.quantity }, () => ({
      userId: session.user!.id!,
      productId: item.productId,
      status: "pending",
    }));

    await db.insert(orders).values(orderRows);
  }

  await db.delete(cartItems).where(eq(cartItems.userId, session.user.id));

  const firstProduct = rows[0].name;
  const redirectUrl = `/success?fromCart=1&items=${totalItems}&total=${totalAmount}&product=${encodeURIComponent(firstProduct)}`;

  return NextResponse.json({ success: true, url: redirectUrl });
}
