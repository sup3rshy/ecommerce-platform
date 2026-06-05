import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import Link from "next/link";

import { authOptions } from "../api/auth/[...nextauth]/route";
import { db } from "@/db";
import { menuItems, cartItems, orders, orderItems } from "@/db/schema";
import { logAudit } from "@/lib/audit";

const formatVnd = (value: number) => `${value.toLocaleString("vi-VN")} đ`;

async function removeItem(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin");
  const id = Number(formData.get("cartItemId"));
  if (!Number.isInteger(id) || id <= 0) return;
  await db
    .delete(cartItems)
    .where(and(eq(cartItems.id, id), eq(cartItems.userId, session.user.id)));
  revalidatePath("/cart");
}

async function checkout() {
  "use server";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin");
  const roles = session.user.roles ?? [];
  if (!roles.includes("buyer")) return;
  const userId = session.user.id;

  const rows = await db
    .select({
      cartId: cartItems.id,
      quantity: cartItems.quantity,
      menuItemId: menuItems.id,
      name: menuItems.name,
      priceVnd: menuItems.priceVnd,
      available: menuItems.available,
    })
    .from(cartItems)
    .innerJoin(menuItems, eq(cartItems.menuItemId, menuItems.id))
    .where(eq(cartItems.userId, userId));

  const usable = rows.filter((r) => r.available);
  if (usable.length === 0) return;

  const total = usable.reduce((sum, r) => sum + r.priceVnd * r.quantity, 0);

  let orderId = 0;
  await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({ userId, status: "pending", totalVnd: total })
      .returning({ id: orders.id });
    orderId = order.id;

    await tx.insert(orderItems).values(
      usable.map((r) => ({
        orderId: order.id,
        menuItemId: r.menuItemId,
        nameSnapshot: r.name,
        unitPriceVnd: r.priceVnd,
        quantity: r.quantity,
      }))
    );

    await tx.delete(cartItems).where(eq(cartItems.userId, userId));
  });

  await logAudit({
    actorId: userId,
    action: "order.create",
    resource: String(orderId),
    metadata: { total, items: usable.length },
  });

  redirect("/orders");
}

export default async function CartPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin");
  const roles = session.user.roles ?? [];
  if (!roles.includes("buyer")) redirect("/denied");

  const rows = await db
    .select({
      cartId: cartItems.id,
      quantity: cartItems.quantity,
      name: menuItems.name,
      priceVnd: menuItems.priceVnd,
      available: menuItems.available,
    })
    .from(cartItems)
    .innerJoin(menuItems, eq(cartItems.menuItemId, menuItems.id))
    .where(eq(cartItems.userId, session.user.id));

  const total = rows
    .filter((r) => r.available)
    .reduce((sum, r) => sum + r.priceVnd * r.quantity, 0);

  return (
    <div className="card">
      <h1>Giỏ hàng</h1>
      {rows.length === 0 ? (
        <p className="muted">
          Giỏ trống. <Link href="/" className="badge badge-active">Xem thực đơn</Link>
        </p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Món</th>
                <th>Đơn giá</th>
                <th>Số lượng</th>
                <th>Thành tiền</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.cartId}>
                  <td>
                    {r.name}
                    {!r.available && (
                      <span className="badge badge-pending" style={{ marginLeft: 8 }}>
                        hết món
                      </span>
                    )}
                  </td>
                  <td>{formatVnd(r.priceVnd)}</td>
                  <td>{r.quantity}</td>
                  <td>{formatVnd(r.priceVnd * r.quantity)}</td>
                  <td>
                    <form action={removeItem}>
                      <input type="hidden" name="cartItemId" value={r.cartId} />
                      <button type="submit" className="btn">Xoá</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <span className="price" style={{ fontSize: 20 }}>
              Tổng: {formatVnd(total)}
            </span>
            <form action={checkout}>
              <button type="submit" className="btn btn-primary" disabled={total <= 0}>
                Đặt đơn
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
