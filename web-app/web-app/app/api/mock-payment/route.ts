import { NextResponse } from "next/server";
import { db } from "../../../db";
import { orders, products, stores } from "../../../db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { and, eq, gte, sql } from "drizzle-orm";

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

  try {
    const result = await db.transaction(async (tx) => {
      const product = await tx.select().from(products).where(eq(products.id, parsedProductId));
      if (product.length === 0) {
        throw new Error("NOT_FOUND");
      }

      // Không cho seller mua sản phẩm của chính mình
      const ownStore = await tx
        .select({ id: stores.id })
        .from(stores)
        .where(and(eq(stores.ownerId, session.user!.id!), eq(stores.id, product[0].storeId)))
        .limit(1);

      if (ownStore.length > 0) {
        throw new Error("OWN_PRODUCT");
      }

      const orderResult = await tx
        .insert(orders)
        .values({
          userId: session.user!.id!,
          productId: parsedProductId,
          quantity,
          unitPrice: product[0].price,
          status: "pending",
        })
        .returning({ id: orders.id });

      // Atomic stock update with WHERE stock >= quantity
      const updated = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${quantity}` })
        .where(and(eq(products.id, parsedProductId), gte(products.stock, quantity)))
        .returning({ id: products.id });

      if (updated.length === 0) {
        throw new Error(`OUT_OF_STOCK:${product[0].stock}`);
      }

      return { orderId: orderResult[0]?.id, productName: product[0].name };
    });

    const redirectUrl = `/success?orderId=${result.orderId}&product=${encodeURIComponent(result.productName)}`;
    return NextResponse.json({ success: true, url: redirectUrl });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "Không tìm thấy sản phẩm." }, { status: 404 });
    }
    if (msg === "OWN_PRODUCT") {
      return NextResponse.json({ error: "Bạn không thể mua sản phẩm của chính mình." }, { status: 403 });
    }
    if (msg.startsWith("OUT_OF_STOCK:")) {
      return NextResponse.json({ error: `Không đủ tồn kho (còn ${msg.slice(13)}).` }, { status: 409 });
    }
    return NextResponse.json({ error: "Đã có lỗi xảy ra khi thanh toán." }, { status: 500 });
  }
}