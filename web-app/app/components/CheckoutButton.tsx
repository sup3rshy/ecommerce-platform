"use client";

import { useState } from "react";

type CheckoutProduct = {
  id: number;
  name: string;
  price: number;
};

export default function CheckoutButton({ product }: { product: CheckoutProduct }) {
  const [loading, setLoading] = useState(false);

  const handleMockPayment = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/mock-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error ?? "Không thể xử lý thanh toán. Vui lòng thử lại.");
        setLoading(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      alert("Không nhận được URL chuyển hướng thanh toán.");
      setLoading(false);
    } catch {
      alert("Đã có lỗi khi kết nối cổng thanh toán mô phỏng.");
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleMockPayment}
      disabled={loading}
      className="cursor-pointer rounded-lg bg-blue-600 px-3 py-1 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
    >
      {loading ? "Đang xử lý thanh toán..." : "Mua ngay"}
    </button>
  );
}