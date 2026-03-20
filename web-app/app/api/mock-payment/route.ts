import { NextResponse } from "next/server";
import { db } from "../../../db";
import { orders, products } from "../../../db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("buyer")) {
    return NextResponse.json({ error: "Tài khoản này không có quyền mua hàng." }, { status: 403 });
  }

  const { productId } = await req.json();
  const parsedProductId = Number(productId);
  if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
    return NextResponse.json({ error: "Sản phẩm không hợp lệ." }, { status: 400 });
  }

  const product = await db.select().from(products).where(eq(products.id, parsedProductId));
  if (product.length === 0) {
    return NextResponse.json({ error: "Không tìm thấy sản phẩm." }, { status: 404 });
  }

  // Giả lập xử lý ở cổng thanh toán
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const inserted = await db
    .insert(orders)
    .values({
    userId: session.user.id,
    productId: parsedProductId,
    status: "pending",
    })
    .returning({ id: orders.id });

  const orderId = inserted[0]?.id;
  const redirectUrl = `/success?orderId=${orderId}&product=${encodeURIComponent(product[0].name)}`;

  return NextResponse.json({ success: true, url: redirectUrl });
}