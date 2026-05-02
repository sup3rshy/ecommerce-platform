import { and, desc, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../auth/[...nextauth]/route";
import { db } from "../../../db";
import { orders, reviews } from "../../../db/schema";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = Number(searchParams.get("productId"));

  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "productId không hợp lệ." }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(reviews)
    .where(eq(reviews.productId, productId))
    .orderBy(desc(reviews.createdAt));

  return NextResponse.json({ reviews: rows });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("buyer")) {
    return NextResponse.json({ error: "Chỉ buyer mới có thể đánh giá." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const productId = Number(body?.productId);
  const rating = Number(body?.rating);
  const comment = (body?.comment as string | undefined)?.trim() || null;

  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "Sản phẩm không hợp lệ." }, { status: 400 });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Đánh giá phải từ 1 đến 5 sao." }, { status: 400 });
  }

  // Check user has a completed order for this product
  const completedOrder = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.userId, session.user.id),
        eq(orders.productId, productId),
        eq(orders.status, "completed")
      )
    )
    .limit(1);

  if (completedOrder.length === 0) {
    return NextResponse.json({ error: "Bạn cần mua và nhận hàng trước khi đánh giá." }, { status: 403 });
  }

  // Check no existing review
  const existing = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.userId, session.user.id), eq(reviews.productId, productId)))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ error: "Bạn đã đánh giá sản phẩm này rồi." }, { status: 409 });
  }

  await db.insert(reviews).values({
    userId: session.user.id,
    productId,
    orderId: completedOrder[0].id,
    rating,
    comment,
  });

  return NextResponse.json({ success: true, message: "Đánh giá thành công." });
}
