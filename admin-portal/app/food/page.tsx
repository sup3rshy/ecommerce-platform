import { getServerSession } from "next-auth";

import { authOptions } from "../../lib/authOptions";
import { getKeycloakUsersWithRoles } from "../../lib/keycloakAdmin";
import { getFoodOverview, type UpgradeRequest } from "../../lib/platformData";
import { canManageFood } from "../../lib/scope";
import {
  advanceFoodOrder,
  approveFoodSellerRequest,
  rejectFoodSellerRequest,
  toggleFoodMenuItem,
} from "./actions";

export const dynamic = "force-dynamic";

const FOOD_ROLES = ["buyer", "food-seller", "food_admin"];
const NEXT_FOOD_STATUS: Record<string, string> = {
  pending: "Bắt đầu chuẩn bị",
  preparing: "Giao đi",
  delivering: "Hoàn thành",
};

function formatVnd(value: number): string {
  return `${value.toLocaleString("vi-VN")} đ`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

function statusBadgeClass(status: string): string {
  if (status === "available" || status === "completed") return "badge badge-kyc";
  if (status === "hidden" || status === "cancelled") return "badge badge-muted";
  return "badge";
}

function FoodSellerRequests({ requests }: { requests: UpgradeRequest[] }) {
  if (requests.length === 0) {
    return <p className="muted">Không có yêu cầu food-seller đang chờ.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Mã</th>
          <th>User</th>
          <th>Nhà hàng</th>
          <th>Thời gian</th>
          <th>Thao tác</th>
        </tr>
      </thead>
      <tbody>
        {requests.map((request) => (
          <tr key={request.id}>
            <td>#{request.id}</td>
            <td><code className="code-inline">{request.userId}</code></td>
            <td>{request.storeName}</td>
            <td>{formatDate(request.requestedAt)}</td>
            <td>
              <div className="row-actions">
                <form action={approveFoodSellerRequest} className="inline-form">
                  <input type="hidden" name="requestId" value={request.id} />
                  <button type="submit" className="btn btn-sm btn-primary">
                    Duyệt
                  </button>
                </form>
                <form action={rejectFoodSellerRequest} className="inline-form">
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

export default async function FoodAdminPage() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles ?? [];

  if (!canManageFood(roles)) {
    return (
      <div className="card">
        <h1>ShopFood</h1>
        <p className="muted">
          Cần role <code>admin</code> hoặc <code>food_admin</code>.
        </p>
      </div>
    );
  }

  const [overview, users] = await Promise.all([
    getFoodOverview(),
    getKeycloakUsersWithRoles(300).catch(() => []),
  ]);
  const foodUsers = users.filter((user) =>
    user.effectiveRoles.some((role) => FOOD_ROLES.includes(role))
  );
  const foodSellerCount = foodUsers.filter((user) => user.effectiveRoles.includes("food-seller")).length;
  const restaurantUserIds = new Set(overview.restaurants.map((restaurant) => restaurant.userId));
  const restaurants = [
    ...overview.restaurants,
    ...foodUsers
      .filter((user) => user.effectiveRoles.includes("food-seller") && !restaurantUserIds.has(user.id))
      .map((user) => ({
        userId: user.id,
        name: user.fullName ?? user.username ?? "Nhà hàng ShopFood",
        approvedAt: null,
      })),
  ];

  return (
    <>
      <div className="card">
        <h1>ShopFood</h1>
        <p className="muted">
          Phạm vi <code>food_admin</code>: nhà hàng/food-seller, thực đơn, đơn đặt món
          và tài khoản tham gia hệ thống Food.
        </p>
        <div className="stat-grid" style={{ marginTop: 16 }}>
          <div className="stat">
            <div className="n">{restaurants.length}</div>
            <div className="l">Nhà hàng / food-seller</div>
          </div>
          <div className="stat">
            <div className="n">{overview.stats.availableItems}/{overview.stats.menuItems}</div>
            <div className="l">Món đang bán / tổng</div>
          </div>
          <div className="stat">
            <div className="n">{overview.stats.orders}</div>
            <div className="l">Đơn món</div>
          </div>
          <div className="stat">
            <div className="n">{formatVnd(overview.stats.revenueVnd)}</div>
            <div className="l">Doanh thu ước tính</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Yêu cầu food-seller</h2>
        <FoodSellerRequests requests={overview.pendingFoodSellerRequests} />
      </div>

      <div className="card">
        <h2>Nhà hàng ShopFood</h2>
        <table>
          <thead>
            <tr>
              <th>Tên nhà hàng</th>
              <th>Chủ nhà hàng</th>
              <th>Ngày duyệt</th>
            </tr>
          </thead>
          <tbody>
            {restaurants.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">Chưa có nhà hàng nào được duyệt.</td>
              </tr>
            )}
            {restaurants.map((restaurant) => (
              <tr key={`${restaurant.userId}-${restaurant.name}`}>
                <td>{restaurant.name}</td>
                <td><code className="code-inline">{restaurant.userId}</code></td>
                <td>{formatDate(restaurant.approvedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Thực đơn</h2>
        <table>
          <thead>
            <tr>
              <th>Mã</th>
              <th>Món</th>
              <th>Giá</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {overview.menu.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">Chưa có món nào.</td>
              </tr>
            )}
            {overview.menu.map((item) => (
              <tr key={item.id}>
                <td>#{item.id}</td>
                <td>{item.name}</td>
                <td>{formatVnd(item.priceVnd)}</td>
                <td>
                  <span className={statusBadgeClass(item.available ? "available" : "hidden")}>
                    {item.available ? "đang bán" : "đã ẩn"}
                  </span>
                </td>
                <td>
                  <form action={toggleFoodMenuItem} className="inline-form">
                    <input type="hidden" name="itemId" value={item.id} />
                    <button type="submit" className="btn btn-sm">
                      {item.available ? "Ẩn" : "Hiện"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Đơn đặt món gần đây</h2>
        <table>
          <thead>
            <tr>
              <th>Mã</th>
              <th>Khách</th>
              <th>Món</th>
              <th>Tổng</th>
              <th>Trạng thái</th>
              <th>Thời gian</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {overview.recentOrders.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">Chưa có đơn món nào.</td>
              </tr>
            )}
            {overview.recentOrders.map((order) => {
              const next = NEXT_FOOD_STATUS[order.status];
              return (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td><code className="code-inline">{order.buyerId}</code></td>
                  <td>{order.items ?? "-"}</td>
                  <td>{formatVnd(order.totalVnd)}</td>
                  <td><span className={statusBadgeClass(order.status)}>{order.status}</span></td>
                  <td>{formatDate(order.createdAt)}</td>
                  <td>
                    {next ? (
                      <form action={advanceFoodOrder} className="inline-form">
                        <input type="hidden" name="orderId" value={order.id} />
                        <button type="submit" className="btn btn-sm btn-primary">
                          {next}
                        </button>
                      </form>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Tài khoản Food</h2>
        <p className="muted">
          {foodUsers.length} tài khoản có quyền buyer/food-seller/food_admin. Food-seller: {foodSellerCount}.
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
            {foodUsers.slice(0, 80).map((user) => (
              <tr key={user.id}>
                <td><code className="code-inline">{user.username ?? user.id.slice(0, 8)}</code></td>
                <td>{user.email ?? "-"}</td>
                <td>
                  {user.effectiveRoles
                    .filter((role) => FOOD_ROLES.includes(role))
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
