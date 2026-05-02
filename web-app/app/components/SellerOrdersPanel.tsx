"use client";

import { useState } from "react";

type OrderStatus = "pending" | "shipping" | "completed";

type SellerOrder = {
  id: number;
  buyerId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
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
};

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["shipping"],
  shipping: ["completed"],
  completed: [],
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
    return <p className="text-slate-500">Chưa có đơn hàng nào phát sinh cho gian hàng của bạn.</p>;
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const isUpdating = updatingOrderId === order.id;

        return (
          <div key={order.id} className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="font-semibold text-slate-900">Đơn #{order.id}</p>
                <p className="text-sm text-gray-700">Sản phẩm: {order.productName}</p>
                <p className="text-sm text-gray-700">Số lượng: {order.quantity}</p>
                <p className="text-sm text-gray-700">Đơn giá: {order.unitPrice.toLocaleString("vi-VN")} VNĐ</p>
                <p className="text-sm font-medium text-gray-700">Tổng: {(order.unitPrice * order.quantity).toLocaleString("vi-VN")} VNĐ</p>
                <p className="text-sm text-gray-600">Người mua: {order.buyerId}</p>
                <p className="text-sm text-gray-600">Thời gian đặt: {order.createdAt}</p>
              </div>

              <div className="min-w-52">
                <p className="mb-1 text-sm text-gray-600">Trạng thái hiện tại: {statusLabelMap[order.status]}</p>
                {VALID_TRANSITIONS[order.status].length > 0 ? (
                  <select
                    value={order.status}
                    onChange={(event) => {
                      const value = event.target.value as OrderStatus;
                      if (value !== order.status) {
                        void updateOrderStatus(order.id, value);
                      }
                    }}
                    disabled={isUpdating}
                    className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 outline-none focus:border-blue-500 disabled:bg-slate-100"
                  >
                    <option value={order.status}>{statusLabelMap[order.status]}</option>
                    {VALID_TRANSITIONS[order.status].map((nextStatus) => (
                      <option key={nextStatus} value={nextStatus}>
                        {statusLabelMap[nextStatus]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">Đã hoàn thành</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
