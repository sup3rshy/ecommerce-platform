import { NextResponse } from "next/server";
import { db } from "../../../db";
import { orders, products, stores } from "../../../db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { and, eq, sql } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("buyer")) {
    return NextResponse.json({ error: "Tài khoản này không có quyền mua hàng." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsedProductId = Number(body?.productId);
  const quantity = Math.max(1, Math.floor(Number(body?.quantity) || 1));

  if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
    return NextResponse.json({ error: "Sản phẩm không hợp lệ." }, { status: 400 });
  }

  const product = await db.select().from(products).where(eq(products.id, parsedProductId));
  if (product.length === 0) {
    return NextResponse.json({ error: "Không tìm thấy sản phẩm." }, { status: 404 });
  }

  // Không cho seller mua sản phẩm của chính mình
  const ownStore = await db
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.ownerId, session.user.id!), eq(stores.id, product[0].storeId)))
    .limit(1);

  if (ownStore.length > 0) {
    return NextResponse.json({ error: "Bạn không thể mua sản phẩm của chính mình." }, { status: 403 });
  }

  if (product[0].stock < quantity) {
    return NextResponse.json({ error: `Không đủ tồn kho (còn ${product[0].stock}).` }, { status: 409 });
  }

  const inserted = await db.transaction(async (tx) => {
    const result = await tx
      .insert(orders)
      .values({
        userId: session.user!.id!,
        productId: parsedProductId,
        quantity,
        unitPrice: product[0].price,
        status: "pending",
      })
      .returning({ id: orders.id });

    await tx
      .update(products)
      .set({ stock: sql`${products.stock} - ${quantity}` })
      .where(eq(products.id, parsedProductId));

    return result;
  });

  const orderId = inserted[0]?.id;
  const redirectUrl = `/success?orderId=${orderId}&product=${encodeURIComponent(product[0].name)}`;

  return NextResponse.json({ success: true, url: redirectUrl });
}