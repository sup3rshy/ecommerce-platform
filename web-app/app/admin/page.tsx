import { desc, eq, sql } from "drizzle-orm";

import { db } from "../../db";
import { orders, products, stores } from "../../db/schema";
import { getKeycloakUserCount } from "../../lib/keycloak-admin";

const formatCurrency = (value: number) => `${value.toLocaleString("vi-VN")} VNĐ`;

export default async function AdminOverviewPage() {
  const [usersCount, storeCountRows, productCountRows, revenueRows, recentOrders] = await Promise.all([
    getKeycloakUserCount(),
    db.select({ count: sql<number>`count(*)::int` }).from(stores),
    db.select({ count: sql<number>`count(*)::int` }).from(products),
    db
      .select({ total: sql<number>`coalesce(sum(${products.price}), 0)::int` })
      .from(orders)
      .innerJoin(products, eq(orders.productId, products.id)),
    db
      .select({
        id: orders.id,
        status: orders.status,
        createdAt: orders.createdAt,
        productName: products.name,
        storeName: stores.name,
        amount: products.price,
        buyerId: orders.userId,
      })
      .from(orders)
      .innerJoin(products, eq(orders.productId, products.id))
      .innerJoin(stores, eq(products.storeId, stores.id))
      .orderBy(desc(orders.createdAt))
      .limit(10),
  ]);

  const stats = [
    {
      label: "Tổng tài khoản",
      value: usersCount ?? "N/A",
      description: usersCount === null ? "Không lấy được số liệu từ Keycloak" : "Đếm từ Keycloak realm",
    },
    {
      label: "Gian hàng hoạt động",
      value: storeCountRows[0]?.count ?? 0,
      description: "Số bản ghi trong bảng stores",
    },
    {
      label: "Sản phẩm đang có",
      value: productCountRows[0]?.count ?? 0,
      description: "Số bản ghi trong bảng products",
    },
    {
      label: "Doanh thu ước tính",
      value: formatCurrency(revenueRows[0]?.total ?? 0),
      description: "Tổng giá trị đơn hàng toàn hệ thống",
    },
  ];

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Tổng quan hệ thống</h1>
        <p className="mt-2 text-slate-600">Theo dõi sức khỏe vận hành toàn sàn theo thời gian thực.</p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{item.value}</p>
            <p className="mt-1 text-xs text-slate-500">{item.description}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Đơn hàng mới nhất</h2>
        </div>

        {recentOrders.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Chưa có đơn hàng phát sinh trong hệ thống.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã đơn</th>
                  <th className="px-4 py-3 font-medium">Người mua</th>
                  <th className="px-4 py-3 font-medium">Sản phẩm</th>
                  <th className="px-4 py-3 font-medium">Gian hàng</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                  <th className="px-4 py-3 font-medium">Giá trị</th>
                  <th className="px-4 py-3 font-medium">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">#{order.id}</td>
                    <td className="whitespace-nowrap px-4 py-3">{order.buyerId}</td>
                    <td className="whitespace-nowrap px-4 py-3">{order.productName}</td>
                    <td className="whitespace-nowrap px-4 py-3">{order.storeName}</td>
                    <td className="whitespace-nowrap px-4 py-3">{order.status ?? "pending"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatCurrency(order.amount)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {order.createdAt ? new Date(order.createdAt).toLocaleString("vi-VN") : "Không rõ"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}