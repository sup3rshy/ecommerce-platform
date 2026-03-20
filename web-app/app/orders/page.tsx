import { desc, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "../api/auth/[...nextauth]/route";
import { db } from "../../db";
import { orders, products } from "../../db/schema";

type OrderStatus = "pending" | "shipping" | "completed" | "paid";

const statusLabelMap: Record<OrderStatus, string> = {
  pending: "Chờ xử lý",
  shipping: "Đang giao hàng",
  completed: "Đã hoàn thành",
  paid: "Đã thanh toán",
};

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("buyer")) {
    redirect("/");
  }

  const buyerOrders = await db
    .select({
      id: orders.id,
      status: orders.status,
      createdAt: orders.createdAt,
      productName: products.name,
      productPrice: products.price,
    })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .where(eq(orders.userId, session.user.id))
    .orderBy(desc(orders.createdAt));

  return (
    <main className="p-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Lịch sử mua hàng</h1>
        <Link href="/" className="text-blue-700 hover:underline">
          Quay lại trang chủ
        </Link>
      </div>

      {buyerOrders.length === 0 ? (
        <div className="border rounded p-6 bg-white">
          <p className="text-gray-600">Bạn chưa có đơn hàng nào thành công.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {buyerOrders.map((order) => {
            const status = (order.status ?? "pending") as OrderStatus;

            return (
              <div key={order.id} className="border rounded p-4 bg-white shadow-sm">
                <div className="flex flex-wrap justify-between items-start gap-3">
                  <div>
                    <p className="font-semibold">{order.productName}</p>
                    <p className="text-sm text-gray-600">Mã đơn: #{order.id}</p>
                    <p className="text-sm text-gray-600">
                      Thời gian giao dịch: {order.createdAt ? new Date(order.createdAt).toLocaleString("vi-VN") : "Không rõ"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-700">{order.productPrice} VNĐ</p>
                    <p className="text-sm text-gray-700 mt-1">Trạng thái: {statusLabelMap[status] ?? status}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
