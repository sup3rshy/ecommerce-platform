import { desc, eq, sql } from "drizzle-orm";

import AdminUserPanel from "../../components/AdminUserPanel";
import { db } from "../../../db";
import { orders, sellerUpgradeRequests, stores } from "../../../db/schema";
import { getKeycloakUsersWithRoles } from "../../../lib/keycloak-admin";

export default async function AdminUsersPage() {
  const [orderRows, storeRows, pendingRequests, usersFromKeycloak] = await Promise.all([
    db
      .select({
        userId: orders.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .groupBy(orders.userId),
    db
      .select({
        ownerId: stores.ownerId,
        count: sql<number>`count(*)::int`,
      })
      .from(stores)
      .groupBy(stores.ownerId),
    db
      .select({
        id: sellerUpgradeRequests.id,
        userId: sellerUpgradeRequests.userId,
        storeName: sellerUpgradeRequests.storeName,
        requestedAt: sellerUpgradeRequests.requestedAt,
      })
      .from(sellerUpgradeRequests)
      .where(eq(sellerUpgradeRequests.status, "pending"))
      .orderBy(desc(sellerUpgradeRequests.requestedAt)),
    getKeycloakUsersWithRoles().catch(() => []),
  ]);

  const orderCountByUser = orderRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.userId] = row.count;
    return acc;
  }, {});

  const storeCountByUser = storeRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.ownerId] = row.count;
    return acc;
  }, {});

  const users = usersFromKeycloak.map((user) => ({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    roles: user.roles,
    orderCount: orderCountByUser[user.id] ?? 0,
    storeCount: storeCountByUser[user.id] ?? 0,
  }));

  const requests = pendingRequests.map((request) => ({
    id: request.id,
    userId: request.userId,
    storeName: request.storeName,
    requestedAt: request.requestedAt ? new Date(request.requestedAt).toLocaleString("vi-VN") : "Không rõ",
  }));

  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">Quản lý người dùng</h1>
      <p className="mt-2 text-slate-600">Theo dõi vai trò, số đơn hàng và duyệt yêu cầu nâng cấp seller từ buyer.</p>

      <div className="mt-4">
        <AdminUserPanel initialUsers={users} initialPendingRequests={requests} />
      </div>
    </div>
  );
}