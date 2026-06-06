import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { authOptions } from "@/lib/authOptions";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { logAudit } from "@/lib/audit";

const formatVnd = (value: number) => `${value.toLocaleString("vi-VN")} đ`;

const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ xác nhận",
  preparing: "Đang chuẩn bị",
  delivering: "Đang giao",
  completed: "Hoàn thành",
  cancelled: "Đã huỷ",
};

async function cancelOrder(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin");
  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) return;

  // Chỉ huỷ được đơn của mình và chỉ khi còn pending.
  const result = await db
    .update(orders)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.userId, session.user.id),
        eq(orders.status, "pending")
      )
    )
    .returning({ id: orders.id });

  if (result.length > 0) {
    await logAudit({
      actorId: session.user.id,
      action: "order.cancel",
      resource: String(orderId),
    });
  }
  revalidatePath("/orders");
}

export default async function MyOrdersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin");

  const myOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, session.user.id))
    .orderBy(desc(orders.createdAt));

  const items = myOrders.length
    ? await db
        .select()
        .from(orderItems)
        .where(
          inArray(
            orderItems.orderId,
            myOrders.map((o) => o.id)
          )
        )
    : [];

  const itemsByOrder = items.reduce<Record<number, typeof items>>((acc, item) => {
    (acc[item.orderId] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div>
      <div className="card">
        <h1>Đơn của tôi</h1>
        <p className="muted">Theo dõi trạng thái các đơn đặt món của bạn.</p>
      </div>

      {myOrders.length === 0 ? (
        <div className="card">
          <p className="muted">
            Chưa có đơn nào. <Link href="/" className="badge badge-active">Đặt món ngay</Link>
          </p>
        </div>
      ) : (
        myOrders.map((order) => {
          const orderLines = itemsByOrder[order.id] ?? [];
          return (
            <div key={order.id} className="card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h2>Đơn #{order.id}</h2>
                <span
                  className={`badge ${
                    order.status === "completed" ? "badge-active" : "badge-pending"
                  }`}
                >
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>
              <p className="muted">
                {order.createdAt
                  ? new Date(order.createdAt).toLocaleString("vi-VN")
                  : "Không rõ"}
              </p>
              <ul style={{ paddingLeft: 18, margin: "8px 0" }}>
                {orderLines.map((line) => (
                  <li key={line.id}>
                    {line.nameSnapshot} × {line.quantity} —{" "}
                    {formatVnd(line.unitPriceVnd * line.quantity)}
                  </li>
                ))}
              </ul>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span className="price">Tổng: {formatVnd(order.totalVnd)}</span>
                {order.status === "pending" && (
                  <form action={cancelOrder}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button type="submit" className="btn">Huỷ đơn</button>
                  </form>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
