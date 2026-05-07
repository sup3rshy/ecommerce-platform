import { desc, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import crypto from "node:crypto";

import { authOptions } from "../api/auth/[...nextauth]/route";
import { db } from "../../db";
import { orders, products } from "../../db/schema";
import { sign } from "../../lib/sig";

const SHOPPAY_BASE = process.env.SHOPPAY_BASE_URL ?? "http://localhost:3200";

function buildPayUrl(orderId: number, amount: number): string {
  const nonce = crypto.randomBytes(8).toString("hex");
  const returnUrl = "http://localhost:3000/payment/return";
  const fields = {
    merchant: "ecommerce",
    orderId: String(orderId),
    amount: String(amount),
    returnUrl,
    nonce,
  };
  const sig = sign(fields);
  const url = new URL("/pay", SHOPPAY_BASE);
  Object.entries(fields).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("sig", sig);
  return url.toString();
}

type OrderStatus = "pending" | "shipping" | "completed";

const statusLabelMap: Record<OrderStatus, string> = {
  pending: "Chờ xử lý",
  shipping: "Đang giao hàng",
  completed: "Đã hoàn thành",
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
      quantity: orders.quantity,
      unitPrice: orders.unitPrice,
      createdAt: orders.createdAt,
      productName: products.name,
    })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .where(eq(orders.userId, session.user.id))
    .orderBy(desc(orders.createdAt));

  return (
    <main className="mx-auto w-full max-w-5xl px-1 py-2 sm:px-2">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lịch sử mua hàng</h1>
        <Link href="/" className="text-blue-700 hover:underline">
          Quay lại trang chủ
        </Link>
      </div>

      {buyerOrders.length === 0 ? (
        <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
          <p className="text-gray-600">Bạn chưa có đơn hàng nào thành công.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {buyerOrders.map((order) => {
            const status = (order.status ?? "pending") as OrderStatus;

            return (
              <div key={order.id} className="rounded-2xl border border-blue-100 p-4 bg-white shadow-sm">
                <div className="flex flex-wrap justify-between items-start gap-3">
                  <div>
                    <p className="font-semibold">{order.productName}</p>
                    <p className="text-sm text-gray-600">Mã đơn: #{order.id}</p>
                    <p className="text-sm text-gray-600">
                      Thời gian giao dịch: {order.createdAt ? new Date(order.createdAt).toLocaleString("vi-VN") : "Không rõ"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">SL: {order.quantity} x {order.unitPrice.toLocaleString("vi-VN")} VNĐ</p>
                    <p className="font-bold text-blue-700">{(order.unitPrice * order.quantity).toLocaleString("vi-VN")} VNĐ</p>
                    <p className="text-sm text-gray-700 mt-1">Trạng thái: {statusLabelMap[status] ?? status}</p>
                    {status === "pending" && (
                      <a
                        href={buildPayUrl(order.id, order.unitPrice * order.quantity)}
                        className="inline-block mt-2 px-3 py-1 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600"
                      >
                        ⚡ Pay với ShopPay
                      </a>
                    )}
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
