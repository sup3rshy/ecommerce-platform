"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ReviewFormProps = {
  productId: number;
};

export default function ReviewForm({ productId }: ReviewFormProps) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, rating, comment }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        alert(data?.error ?? "Không thể gửi đánh giá.");
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
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Viết đánh giá</h3>

      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            className={`text-2xl ${star <= rating ? "text-yellow-400" : "text-slate-300"}`}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-sm text-slate-600">{rating}/5</span>
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Nhận xét về sản phẩm (không bắt buộc)..."
        rows={3}
        className="w-full rounded-lg border border-blue-200 p-2 text-sm outline-none focus:border-blue-500"
      />

      <button
        type="submit"
        disabled={isLoading}
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
      >
        {isLoading ? "Đang gửi..." : "Gửi đánh giá"}
      </button>
    </form>
  );
}
