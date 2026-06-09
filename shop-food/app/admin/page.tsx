import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { desc, eq, inArray } from "drizzle-orm";

import { authOptions } from "@/lib/authOptions";
import { db } from "@/db";
import { menuItems, orders, orderItems } from "@/db/schema";
import { logAudit } from "@/lib/audit";

const ADMIN_ROLES = ["food_admin", "admin"];
function isFoodAdmin(roles: string[]): boolean {
  return roles.some((r) => ADMIN_ROLES.includes(r));
}

const formatVnd = (value: number) => `${value.toLocaleString("vi-VN")} đ`;

const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ xác nhận",
  preparing: "Đang chuẩn bị",
  delivering: "Đang giao",
  completed: "Hoàn thành",
  cancelled: "Đã huỷ",
};

// Bước kế tiếp trong vòng đời đơn (food_admin đẩy trạng thái).
const NEXT_STEP: Record<string, { status: string; label: string } | null> = {
  pending: { status: "preparing", label: "Bắt đầu chuẩn bị" },
  preparing: { status: "delivering", label: "Giao đi" },
  delivering: { status: "completed", label: "Hoàn thành" },
  completed: null,
  cancelled: null,
};

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/sso?callbackUrl=/admin");
  if (!isFoodAdmin(session.user.roles ?? [])) redirect("/denied");
  return session.user.id as string;
}

async function createMenuItem(formData: FormData) {
  "use server";
  const actorId = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const priceVnd = Math.max(0, Math.floor(Number(formData.get("price")) || 0));
  const description = String(formData.get("description") ?? "").trim() || null;
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  if (!name || priceVnd <= 0) return;

  const [created] = await db
    .insert(menuItems)
    .values({ name, priceVnd, description, imageUrl, available: true })
    .returning({ id: menuItems.id });

  await logAudit({
    actorId,
    action: "menu.create",
    resource: String(created.id),
    metadata: { name, priceVnd },
  });
  revalidatePath("/admin");
  revalidatePath("/");
}

async function toggleMenuItem(formData: FormData) {
  "use server";
  const actorId = await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const [item] = await db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1);
  if (!item) return;
  await db
    .update(menuItems)
    .set({ available: !item.available })
    .where(eq(menuItems.id, id));
  await logAudit({
    actorId,
    action: "menu.toggle",
    resource: String(id),
    metadata: { available: !item.available },
  });
  revalidatePath("/admin");
  revalidatePath("/");
}

async function deleteMenuItem(formData: FormData) {
  "use server";
  const actorId = await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  await db.delete(menuItems).where(eq(menuItems.id, id));
  await logAudit({ actorId, action: "menu.delete", resource: String(id) });
  revalidatePath("/admin");
  revalidatePath("/");
}

async function advanceOrder(formData: FormData) {
  "use server";
  const actorId = await requireAdmin();
  const orderId = Number(formData.get("orderId"));
  const nextStatus = String(formData.get("status") ?? "");
  if (!Number.isInteger(orderId) || orderId <= 0) return;
  if (!["preparing", "delivering", "completed"].includes(nextStatus)) return;

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return;
  // Chỉ cho bước hợp lệ theo vòng đời.
  if (NEXT_STEP[order.status]?.status !== nextStatus) return;

  await db.update(orders).set({ status: nextStatus }).where(eq(orders.id, orderId));
  await logAudit({
    actorId,
    action: "order.status",
    resource: String(orderId),
    metadata: { status: nextStatus },
  });
  revalidatePath("/admin");
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/sso?callbackUrl=/admin");
  if (!isFoodAdmin(session.user.roles ?? [])) redirect("/denied");

  const menu = await db.select().from(menuItems).orderBy(desc(menuItems.createdAt));
  const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));
  const lines = allOrders.length
    ? await db
        .select()
        .from(orderItems)
        .where(inArray(orderItems.orderId, allOrders.map((o) => o.id)))
    : [];
  const linesByOrder = lines.reduce<Record<number, typeof lines>>((acc, line) => {
    (acc[line.orderId] ??= []).push(line);
    return acc;
  }, {});

  return (
    <div>
      <div className="card">
        <h1>Quản trị ShopFood</h1>
        <p className="muted">Vai trò food_admin: quản lý thực đơn và xử lý đơn đặt món.</p>
      </div>

      <div className="card">
        <h2>Thêm món mới</h2>
        <form action={createMenuItem} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input name="name" placeholder="Tên món" required />
          <input name="price" type="number" min={1} placeholder="Giá (VNĐ)" required />
          <input name="imageUrl" type="url" placeholder="URL ảnh (tùy chọn)" />
          <textarea name="description" placeholder="Mô tả" rows={2} />
          <button type="submit" className="btn btn-primary" style={{ width: "fit-content" }}>
            Thêm món
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Thực đơn ({menu.length})</h2>
        {menu.length === 0 ? (
          <p className="muted">Chưa có món nào.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tên</th>
                <th>Giá</th>
                <th>Trạng thái</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {menu.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{formatVnd(item.priceVnd)}</td>
                  <td>
                    <span className={`badge ${item.available ? "badge-active" : "badge-pending"}`}>
                      {item.available ? "đang bán" : "đã ẩn"}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <form action={toggleMenuItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="btn">
                        {item.available ? "Ẩn" : "Hiện"}
                      </button>
                    </form>
                    <form action={deleteMenuItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="btn">Xoá</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Đơn đặt món ({allOrders.length})</h2>
        {allOrders.length === 0 ? (
          <p className="muted">Chưa có đơn nào.</p>
        ) : (
          allOrders.map((order) => {
            const next = NEXT_STEP[order.status];
            return (
              <div
                key={order.id}
                style={{
                  borderTop: "1px solid #fef3c7",
                  paddingTop: 12,
                  marginTop: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <strong>Đơn #{order.id}</strong>
                  <span
                    className={`badge ${
                      order.status === "completed" ? "badge-active" : "badge-pending"
                    }`}
                  >
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </div>
                <p className="muted" style={{ margin: "4px 0" }}>
                  Khách: <code className="code-inline">{order.userId}</code> ·{" "}
                  {order.createdAt
                    ? new Date(order.createdAt).toLocaleString("vi-VN")
                    : "Không rõ"}
                </p>
                <ul style={{ paddingLeft: 18, margin: "4px 0" }}>
                  {(linesByOrder[order.id] ?? []).map((line) => (
                    <li key={line.id}>
                      {line.nameSnapshot} × {line.quantity}
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
                  <span className="price">{formatVnd(order.totalVnd)}</span>
                  {next && (
                    <form action={advanceOrder}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="status" value={next.status} />
                      <button type="submit" className="btn btn-primary">{next.label}</button>
                    </form>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
