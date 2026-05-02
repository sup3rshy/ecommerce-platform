"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CartItem = {
  id: number;
  productId: number;
  quantity: number;
  name: string;
  description: string | null;
  price: number;
  subtotal: number;
};

type CartResponse = {
  items: CartItem[];
  totalAmount: number;
  totalItems: number;
};

export default function CartClient() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCheckout = useMemo(() => items.length > 0 && !checkingOut, [items.length, checkingOut]);

  const fetchCart = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/cart", { cache: "no-store" });
      const data = (await response.json()) as CartResponse & { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Không thể tải giỏ hàng.");
        setItems([]);
        setTotalAmount(0);
        setTotalItems(0);
        return;
      }

      setItems(data.items ?? []);
      setTotalAmount(data.totalAmount ?? 0);
      setTotalItems(data.totalItems ?? 0);
    } catch {
      setError("Đã có lỗi khi kết nối máy chủ.");
      setItems([]);
      setTotalAmount(0);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const updateQuantity = async (itemId: number, quantity: number) => {
    if (quantity <= 0) {
      await removeItem(itemId);
      return;
    }

    const response = await fetch("/api/cart", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ itemId, quantity }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error ?? "Không thể cập nhật số lượng.");
      return;
    }

    await fetchCart();
  };

  const removeItem = async (itemId: number) => {
    const response = await fetch("/api/cart", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ itemId }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error ?? "Không thể xóa sản phẩm khỏi giỏ.");
      return;
    }

    await fetchCart();
  };

  const checkoutAll = async () => {
    try {
      setCheckingOut(true);
      const response = await fetch("/api/cart/checkout", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error ?? "Thanh toán thất bại.");
        setCheckingOut(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      alert("Không nhận được URL chuyển hướng sau thanh toán.");
      setCheckingOut(false);
    } catch {
      alert("Đã có lỗi khi xử lý thanh toán.");
      setCheckingOut(false);
    }
  };

  if (loading) {
    return <p className="text-slate-500">Đang tải giỏ hàng...</p>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
        <p>{error}</p>
        <Link href="/" className="inline-block mt-3 text-blue-700 underline">
          Quay lại trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Giỏ hàng của bạn</h1>
        <Link href="/" className="text-blue-700 hover:underline">
          Tiếp tục mua sắm
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
          <p className="text-gray-600">Giỏ hàng đang trống.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
              <div className="flex justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{item.name}</h2>
                  <p className="text-sm text-gray-600">{item.description}</p>
                  <p className="mt-2 text-blue-700 font-semibold">{item.price} VNĐ</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Thành tiền</p>
                  <p className="font-bold">{item.subtotal} VNĐ</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="h-8 w-8 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100"
                  >
                    -
                  </button>
                  <span className="min-w-8 text-center font-semibold">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="h-8 w-8 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100"
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={() => removeItem(item.id)}
                  className="text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                  Xóa
                </button>
              </div>
            </div>
          ))}

          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 shadow-sm">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Tổng số lượng</span>
              <span>{totalItems}</span>
            </div>
            <div className="flex justify-between text-lg font-bold mt-2">
              <span>Tổng tiền</span>
              <span>{totalAmount} VNĐ</span>
            </div>

            <button
              onClick={checkoutAll}
              disabled={!canCheckout}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded disabled:opacity-50"
            >
              {checkingOut ? "Đang xử lý thanh toán..." : "Xác nhận thanh toán toàn bộ giỏ"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
