import { and, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../auth/[...nextauth]/route";
import { db } from "../../../db";
import { cartItems, products } from "../../../db/schema";

type BuyerSession = {
  userId: string;
  roles: string[];
};

async function requireBuyerSession(): Promise<BuyerSession | NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập để sử dụng giỏ hàng." }, { status: 401 });
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("buyer")) {
    return NextResponse.json({ error: "Chỉ tài khoản buyer mới dùng được giỏ hàng." }, { status: 403 });
  }

  return { userId: session.user.id, roles };
}

export async function GET() {
  const auth = await requireBuyerSession();
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select({
      id: cartItems.id,
      productId: cartItems.productId,
      quantity: cartItems.quantity,
      name: products.name,
      description: products.description,
      price: products.price,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.userId, auth.userId));

  const items = rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    quantity: row.quantity,
    name: row.name,
    description: row.description,
    price: row.price,
    subtotal: row.price * row.quantity,
  }));

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  return NextResponse.json({ items, totalItems, totalAmount });
}

export async function POST(req: Request) {
  const auth = await requireBuyerSession();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const productId = Number(body?.productId);
  const quantity = Number(body?.quantity ?? 1);

  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "Sản phẩm không hợp lệ." }, { status: 400 });
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Số lượng không hợp lệ." }, { status: 400 });
  }

  const product = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
  if (product.length === 0) {
    return NextResponse.json({ error: "Không tìm thấy sản phẩm." }, { status: 404 });
  }

  const existing = await db
    .select({ id: cartItems.id, quantity: cartItems.quantity })
    .from(cartItems)
    .where(and(eq(cartItems.userId, auth.userId), eq(cartItems.productId, productId)));

  if (existing.length > 0) {
    await db
      .update(cartItems)
      .set({ quantity: existing[0].quantity + quantity })
      .where(eq(cartItems.id, existing[0].id));
  } else {
    await db.insert(cartItems).values({ userId: auth.userId, productId, quantity });
  }

  return NextResponse.json({ success: true, message: "Đã thêm sản phẩm vào giỏ." });
}

export async function PATCH(req: Request) {
  const auth = await requireBuyerSession();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const itemId = Number(body?.itemId);
  const quantity = Number(body?.quantity);

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "Mục giỏ hàng không hợp lệ." }, { status: 400 });
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Số lượng phải lớn hơn 0." }, { status: 400 });
  }

  const current = await db
    .select({ id: cartItems.id })
    .from(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.userId, auth.userId)));

  if (current.length === 0) {
    return NextResponse.json({ error: "Không tìm thấy mục giỏ hàng." }, { status: 404 });
  }

  await db.update(cartItems).set({ quantity }).where(eq(cartItems.id, itemId));

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const auth = await requireBuyerSession();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const itemId = Number(body?.itemId);

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "Mục giỏ hàng không hợp lệ." }, { status: 400 });
  }

  const current = await db
    .select({ id: cartItems.id })
    .from(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.userId, auth.userId)));

  if (current.length === 0) {
    return NextResponse.json({ error: "Không tìm thấy mục giỏ hàng." }, { status: 404 });
  }

  await db.delete(cartItems).where(eq(cartItems.id, itemId));

  return NextResponse.json({ success: true });
}
