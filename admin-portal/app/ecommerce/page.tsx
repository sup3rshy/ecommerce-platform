import { getServerSession } from "next-auth";

import { authOptions } from "../api/auth/[...nextauth]/route";
import { getKeycloakUsersWithRoles } from "../../lib/keycloakAdmin";
import { getEcommerceOverview, type UpgradeRequest } from "../../lib/platformData";
import { canManageEcommerce } from "../../lib/scope";
import { approveSellerRequest, rejectSellerRequest } from "./actions";

export const dynamic = "force-dynamic";

const ECOMMERCE_ROLES = ["buyer", "seller", "staff"];

function formatVnd(value: number): string {
  return `${value.toLocaleString("vi-VN")} đ`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

function statusBadgeClass(status: string): string {
  if (status === "active" || status === "completed") return "badge badge-kyc";
  if (status === "hidden" || status === "deleted") return "badge badge-muted";
  return "badge";
}

function RequestRows({ requests }: { requests: UpgradeRequest[] }) {
  if (requests.length === 0) {
    return <p className="muted">Không có yêu cầu seller đang chờ.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Mã</th>
          <th>User</th>
          <th>Gian hàng</th>
          <th>Thời gian</th>
          <th>Thao tác</th>
        </tr>
      </thead>
      <tbody>
        {requests.map((request) => (
          <tr key={request.id}>
            <td>#{request.id}</td>
            <td>
              <code className="code-inline">{request.userId}</code>
            </td>
            <td>{request.storeName}</td>
            <td>{formatDate(request.requestedAt)}</td>
            <td>
              <div className="row-actions">
                <form action={approveSellerRequest} className="inline-form">
                  <input type="hidden" name="requestId" value={request.id} />
                  <button type="submit" className="btn btn-sm btn-primary">
                    Duyệt
                  </button>
                </form>
                <form action={rejectSellerRequest} className="inline-form">
                  <input type="hidden" name="requestId" value={request.id} />
                  <input name="reason" placeholder="Lý do" />
                  <button type="submit" className="btn btn-sm btn-danger">
                    Từ chối
                  </button>
                </form>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function EcommerceAdminPage() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles ?? [];

  if (!canManageEcommerce(roles)) {
    return (
      <div className="card">
        <h1>Hệ thống Ecommerce</h1>
        <p className="muted">
          Cần role <code>admin</code> hoặc <code>ecommerce_admin</code>.
        </p>
      </div>
    );
  }

  const [overview, users] = await Promise.all([
    getEcommerceOverview(),
    getKeycloakUsersWithRoles(300).catch(() => []),
  ]);
  const ecommerceUsers = users.filter((user) =>
    user.effectiveRoles.some((role) => ECOMMERCE_ROLES.includes(role))
  );
  const sellerCount = ecommerceUsers.filter((user) => user.effectiveRoles.includes("seller")).length;
  const staffCount = ecommerceUsers.filter((user) => user.effectiveRoles.includes("staff")).length;

  return (
    <>
      <div className="card">
        <h1>Hệ thống Ecommerce</h1>
        <p className="muted">
          Phạm vi <code>ecommerce_admin</code>: ShopEcommerce storefront + ShopSell
          back-office, bao gồm gian hàng, catalog, đơn hàng và tài khoản buyer/seller/staff.
        </p>
        <div className="stat-grid" style={{ marginTop: 16 }}>
          <div className="stat">
            <div className="n">{overview.stats.stores}</div>
            <div className="l">Gian hàng</div>
          </div>
          <div className="stat">
            <div className="n">{overview.stats.activeProducts}/{overview.stats.products}</div>
            <div className="l">Sản phẩm đang bán / tổng</div>
          </div>
          <div className="stat">
            <div className="n">{overview.stats.orders}</div>
            <div className="l">Đơn hàng</div>
          </div>
          <div className="stat">
            <div className="n">{formatVnd(overview.stats.revenueVnd)}</div>
            <div className="l">Doanh thu ước tính</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Yêu cầu seller</h2>
        <RequestRows requests={overview.pendingSellerRequests} />
      </div>

      <div className="card">
        <h2>Gian hàng</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Tên gian hàng</th>
              <th>Chủ shop</th>
              <th>Sản phẩm</th>
              <th>Đơn hàng</th>
              <th>Doanh thu</th>
            </tr>
          </thead>
          <tbody>
            {overview.stores.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">Chưa có gian hàng nào.</td>
              </tr>
            )}
            {overview.stores.map((store) => (
              <tr key={store.id}>
                <td>#{store.id}</td>
                <td>{store.name}</td>
                <td><code className="code-inline">{store.ownerId}</code></td>
                <td>{store.activeProductCount}/{store.productCount}</td>
                <td>{store.orderCount}</td>
                <td>{formatVnd(store.revenueVnd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Đơn hàng gần đây</h2>
        <table>
          <thead>
            <tr>
              <th>Mã</th>
              <th>Người mua</th>
              <th>Sản phẩm</th>
              <th>Gian hàng</th>
              <th>SL</th>
              <th>Tổng</th>
              <th>Trạng thái</th>
              <th>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {overview.recentOrders.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">Chưa có đơn hàng nào.</td>
              </tr>
            )}
            {overview.recentOrders.map((order) => (
              <tr key={order.id}>
                <td>#{order.id}</td>
                <td><code className="code-inline">{order.buyerId}</code></td>
                <td>{order.productName ?? "-"}</td>
                <td>{order.storeName ?? "-"}</td>
                <td>{order.quantity}</td>
                <td>{formatVnd(order.unitPrice * order.quantity)}</td>
                <td><span className={statusBadgeClass(order.status)}>{order.status}</span></td>
                <td>{formatDate(order.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Catalog đang bán</h2>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Sản phẩm</th>
              <th>Gian hàng</th>
              <th>Giá</th>
              <th>Tồn</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {overview.products.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">Chưa có sản phẩm nào.</td>
              </tr>
            )}
            {overview.products.map((product) => (
              <tr key={product.id}>
                <td><code className="code-inline">{product.sku}</code></td>
                <td>{product.name}</td>
                <td>{product.storeName ?? product.sellerId}</td>
                <td>{formatVnd(product.priceVnd)}</td>
                <td>{product.stock}</td>
                <td><span className={statusBadgeClass(product.status)}>{product.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Tài khoản Ecommerce</h2>
        <p className="muted">
          {ecommerceUsers.length} tài khoản có quyền buyer/seller/staff. Seller: {sellerCount}; staff: {staffCount}.
        </p>
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Quyền hiệu lực</th>
            </tr>
          </thead>
          <tbody>
            {ecommerceUsers.slice(0, 80).map((user) => (
              <tr key={user.id}>
                <td><code className="code-inline">{user.username ?? user.id.slice(0, 8)}</code></td>
                <td>{user.email ?? "-"}</td>
                <td>
                  {user.effectiveRoles
                    .filter((role) => ECOMMERCE_ROLES.includes(role))
                    .map((role) => <span className="badge" key={role}>{role}</span>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
