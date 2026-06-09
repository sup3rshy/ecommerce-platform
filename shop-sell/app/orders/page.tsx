import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";
import { logAudit } from "@/lib/audit";
import {
  fetchSellerOrders,
  updateSellerOrderStatus,
  type SellerOrder,
} from "@/lib/orderSync";

// Ai được xử lý đơn: chủ shop (đơn của mình), quản trị Ecommerce / admin (mọi đơn).
const MANAGE_ROLES = ["seller", "ecommerce_admin", "admin"];

function canManage(roles: string[]): boolean {
  return roles.some((r) => MANAGE_ROLES.includes(r));
}
function isAdminLike(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("ecommerce_admin");
}

const STATUS_LABEL: Record<SellerOrder["status"], string> = {
  pending: "Chờ xử lý",
  shipping: "Đang giao",
  completed: "Đã hoàn thành",
};

// Bước kế tiếp hợp lệ trong vòng đời đơn (authoritative check ở phía ShopEcommerce).
const NEXT_STEP: Record<
  SellerOrder["status"],
  { status: "shipping" | "completed"; label: string } | null
> = {
  pending: { status: "shipping", label: "Đánh dấu đang giao" },
  shipping: { status: "completed", label: "Đánh dấu hoàn thành" },
  completed: null,
};

async function advanceStatus(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("unauthenticated");
  const roles = session.user.roles ?? [];
  if (!canManage(roles)) throw new Error("Forbidden");

  const orderId = Number(formData.get("orderId"));
  const status = String(formData.get("status") ?? "");
  if (!Number.isInteger(orderId) || orderId <= 0) return;
  if (status !== "shipping" && status !== "completed") return;

  const scope = { sellerId: session.user.id, all: isAdminLike(roles) };

  try {
    await updateSellerOrderStatus(scope, orderId, status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cập nhật thất bại";
    redirect(`/orders?error=${encodeURIComponent(message)}`);
  }

  await logAudit({
    actorId: session.user.id,
    action: "order.status",
    resource: String(orderId),
    metadata: { status },
  });

  // redirect (ngoài try/catch) vừa nạp lại dữ liệu mới vừa xoá ?error còn sót.
  redirect("/orders");
}

const formatVnd = (value: number) => `${value.toLocaleString("vi-VN")} đ`;

type PageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function OrdersPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/sso?callbackUrl=/orders");
  const roles = session.user.roles ?? [];
  if (!canManage(roles)) redirect("/denied");

  const adminLike = isAdminLike(roles);
  const resolved = (await searchParams) ?? {};
  const errorMessage = resolved.error;

  const orders = await fetchSellerOrders({
    sellerId: session.user.id,
    all: adminLike,
  }).catch(() => null);

  return (
    <div>
      <h1>Quản lý đơn hàng</h1>
      <p className="muted">
        Đơn hàng phát sinh ở storefront ShopEcommerce (:3000). ShopSell đọc và cập
        nhật trạng thái qua kênh nội bộ ký HMAC.
        {adminLike && " Bạn đang xem TẤT CẢ đơn hàng (quyền quản trị)."}
      </p>

      {errorMessage && (
        <div className="alert-warn" style={{ marginTop: 12 }}>
          {errorMessage}
        </div>
      )}

      <section className="card" style={{ marginTop: 16 }}>
        {orders === null ? (
          <div className="alert-warn">
            Không kết nối được tới ShopEcommerce để tải đơn hàng. Kiểm tra storefront
            (:3000) và CATALOG_SYNC_SECRET.
          </div>
        ) : orders.length === 0 ? (
          <p className="muted">Chưa có đơn hàng nào phát sinh cho gian hàng.</p>
        ) : (
          <>
            <h2>Đơn hàng ({orders.length})</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  <Th>Mã đơn</Th>
                  <Th>Người mua</Th>
                  <Th>Sản phẩm</Th>
                  {adminLike && <Th>Gian hàng</Th>}
                  <Th>SL</Th>
                  <Th>Tổng</Th>
                  <Th>Trạng thái</Th>
                  <Th>Thời gian</Th>
                  <Th>Hành động</Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const next = NEXT_STEP[order.status];
                  return (
                    <tr key={order.id}>
                      <Td>#{order.id}</Td>
                      <Td>
                        <code className="code-inline">{order.buyerId}</code>
                      </Td>
                      <Td>{order.productName}</Td>
                      {adminLike && <Td>{order.storeName}</Td>}
                      <Td>{order.quantity}</Td>
                      <Td>{formatVnd(order.unitPrice * order.quantity)}</Td>
                      <Td>
                        <span
                          className={
                            order.status === "completed" ? "alert-success" : "alert-warn"
                          }
                          style={{ padding: "2px 8px", borderRadius: 8, fontSize: 12 }}
                        >
                          {STATUS_LABEL[order.status]}
                        </span>
                      </Td>
                      <Td>
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleString("vi-VN")
                          : "Không rõ"}
                      </Td>
                      <Td>
                        {next ? (
                          <form action={advanceStatus}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="status" value={next.status} />
                            <button type="submit" className="btn btn-primary">
                              {next.label}
                            </button>
                          </form>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "8px 6px",
        borderBottom: "1px solid #e2e8f0",
        color: "#64748b",
        fontWeight: 500,
      }}
    >
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: "8px 6px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" }}>
      {children}
    </td>
  );
}
