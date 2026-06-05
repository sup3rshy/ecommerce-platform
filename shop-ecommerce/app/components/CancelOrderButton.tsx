"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CancelOrderButtonProps = {
  orderId: number;
};

export default function CancelOrderButton({ orderId }: CancelOrderButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleCancel = async () => {
    if (!confirm("Bạn có chắc muốn hủy đơn hàng này?")) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "PATCH",
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        alert(data?.error ?? "Không thể hủy đơn hàng.");
        return;
      }

      router.refresh();
    } catch {
      alert("Đã có lỗi xảy ra.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleCancel}
      disabled={isLoading}
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isLoading ? "Đang hủy..." : "Hủy đơn"}
    </button>
  );
}
