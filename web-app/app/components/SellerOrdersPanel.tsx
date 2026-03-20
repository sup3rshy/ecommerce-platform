"use client";

import { useState } from "react";

type OrderStatus = "pending" | "shipping" | "completed" | "paid";

type SellerOrder = {
  id: number;
  buyerId: string;
  productName: string;
  price: number;
  status: OrderStatus;
  createdAt: string;
};

type SellerOrdersPanelProps = {
  initialOrders: SellerOrder[];
};

const STATUS_OPTIONS: Array<{ value: OrderStatus; label: string }> = [
  { value: "pending", label: "Chờ xử lý" },
  { value: "shipping", label: "Đang giao hàng" },
  { value: "completed", label: "Đã hoàn thành" },
];

const statusLabelMap: Record<OrderStatus, string> = {
  pending: "Chờ xử lý",
  shipping: "Đang giao hàng",
  completed: "Đã hoàn thành",
  paid: "Đã thanh toán",
};

export default function SellerOrdersPanel({ initialOrders }: SellerOrdersPanelProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

  const updateOrderStatus = async (orderId: number, nextStatus: OrderStatus) => {
    setUpdatingOrderId(orderId);

    try {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        alert(data?.error ?? "Không thể cập nhật trạng thái đơn hàng.");
        return;
      }

      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status: nextStatus,
              }
            : order
        )
      );
    } catch {
      alert("Đã có lỗi khi cập nhật trạng thái đơn hàng.");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  if (orders.length === 0) {
    return <p className="text-gray-500">Chưa có đơn hàng nào phát sinh cho gian hàng của bạn.</p>;
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const isUpdating = updatingOrderId === order.id;

        return (
          <div key={order.id} className="border p-4 rounded bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="font-semibold">Đơn #{order.id}</p>
                <p className="text-sm text-gray-700">Sản phẩm: {order.productName}</p>
                <p className="text-sm text-gray-700">Giá: {order.price} VNĐ</p>
                <p className="text-sm text-gray-600">Người mua: {order.buyerId}</p>
                <p className="text-sm text-gray-600">Thời gian đặt: {order.createdAt}</p>
              </div>

              <div className="min-w-52">
                <p className="text-sm text-gray-600 mb-1">Trạng thái hiện tại: {statusLabelMap[order.status]}</p>
                <select
                  value={order.status === "paid" ? "pending" : order.status}
                  onChange={(event) => {
                    const value = event.target.value as OrderStatus;
                    void updateOrderStatus(order.id, value);
                  }}
                  disabled={isUpdating}
                  className="w-full border rounded px-3 py-2 bg-white disabled:bg-gray-100"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
