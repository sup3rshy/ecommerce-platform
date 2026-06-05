"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type AddToCartButtonProps = {
  productId: number;
  quantity?: number;
};

export default function AddToCartButton({ productId, quantity = 1 }: AddToCartButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);

  const handleAddToCart = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productId, quantity }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error ?? "Không thể thêm sản phẩm vào giỏ hàng.");
        setLoading(false);
        return;
      }

      setAdded(true);
      router.refresh();
      setTimeout(() => setAdded(false), 1200);
    } catch {
      alert("Đã có lỗi khi thêm vào giỏ hàng.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleAddToCart}
      disabled={loading}
      className="rounded-lg bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? "Đang thêm..." : added ? "Đã thêm" : "Thêm vào giỏ"}
    </button>
  );
}
