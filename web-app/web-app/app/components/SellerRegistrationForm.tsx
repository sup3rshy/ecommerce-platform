"use client";

import { FormEvent, useState } from "react";

type SellerRegistrationFormProps = {
  initialStoreName?: string;
};

export default function SellerRegistrationForm({ initialStoreName = "" }: SellerRegistrationFormProps) {
  const [storeName, setStoreName] = useState(initialStoreName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/seller/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ storeName: storeName.trim() }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; requiresReLogin?: boolean; message?: string }
        | null;

      if (!response.ok) {
        setError(payload?.error ?? "Không thể đăng ký gian hàng.");
        return;
      }

      alert(payload?.message ?? "Đăng ký thành công. Hệ thống sẽ đăng xuất để bạn đăng nhập lại.");

      setStoreName("");
    } catch {
      setError("Đã có lỗi xảy ra khi gửi đăng ký.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="store-name" className="block text-sm font-medium text-slate-700">
          Tên gian hàng
        </label>
        <input
          id="store-name"
          type="text"
          value={storeName}
          onChange={(event) => setStoreName(event.target.value)}
          minLength={3}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-sky-500 focus:ring"
          placeholder="Ví dụ: Cửa hàng An Nhiên"
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-lg bg-sky-700 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isSubmitting ? "Đang xử lý..." : "Hoàn tất đăng ký bán hàng"}
      </button>
    </form>
  );
}