"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type PricePreset = {
  label: string;
  minPrice?: number;
  maxPrice?: number;
};

const pricePresets: PricePreset[] = [
  { label: "Dưới 100.000đ", maxPrice: 100000 },
  { label: "100.000đ - 500.000đ", minPrice: 100000, maxPrice: 500000 },
  { label: "500.000đ - 1.000.000đ", minPrice: 500000, maxPrice: 1000000 },
  { label: "Trên 1.000.000đ", minPrice: 1000000 },
];

type ProductSearchFiltersProps = {
  categories?: string[];
  selectedCategory?: string;
};

export default function ProductSearchFilters({ categories = [], selectedCategory }: ProductSearchFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [keyword, setKeyword] = useState(searchParams.get("q") ?? "");
  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") ?? "");

  // Dùng ref để tránh re-create callback khi state thay đổi
  const stateRef = useRef({ keyword, minPrice, maxPrice });
  stateRef.current = { keyword, minPrice, maxPrice };

  const applySearch = useCallback(
    (next: { q?: string; minPrice?: string; maxPrice?: string }) => {
      const current = stateRef.current;
      const params = new URLSearchParams(searchParams.toString());

      // Reset page when filters change
      params.delete("page");

      const q = (next.q ?? current.keyword).trim();
      const min = (next.minPrice ?? current.minPrice).trim();
      const max = (next.maxPrice ?? current.maxPrice).trim();

      if (q) params.set("q", q); else params.delete("q");
      if (min) params.set("minPrice", min); else params.delete("minPrice");
      if (max) params.set("maxPrice", max); else params.delete("maxPrice");

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      applySearch({ q: keyword });
    }, 400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  const applyPricePreset = (preset: PricePreset) => {
    const nextMin = preset.minPrice ? String(preset.minPrice) : "";
    const nextMax = preset.maxPrice ? String(preset.maxPrice) : "";
    setMinPrice(nextMin);
    setMaxPrice(nextMax);
    applySearch({ minPrice: nextMin, maxPrice: nextMax });
  };

  const applyCustomPrice = () => {
    applySearch({ minPrice, maxPrice });
  };

  const clearFilters = () => {
    setKeyword("");
    setMinPrice("");
    setMaxPrice("");
    router.replace(pathname, { scroll: false });
  };

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Tìm kiếm và bộ lọc</h2>
      <p className="mt-1 text-sm text-slate-500">Nhập tên sản phẩm hoặc chọn khoảng giá mong muốn.</p>

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="keyword" className="mb-2 block text-sm font-medium text-slate-700">
            Tên sản phẩm
          </label>
          <input
            id="keyword"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Ví dụ: Tai nghe, áo thun..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500"
          />
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">Khoảng giá nhanh</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {pricePresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPricePreset(preset)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 hover:border-sky-500 hover:bg-sky-50"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">Tùy chỉnh khoảng giá</span>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              placeholder="Giá từ"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500"
            />
            <input
              type="number"
              min={0}
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              placeholder="Giá đến"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500"
            />
          </div>
          <button
            type="button"
            onClick={applyCustomPrice}
            className="mt-2 w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Áp dụng khoảng giá
          </button>
        </div>

        {categories.length > 0 && (
          <div>
            <span className="mb-2 block text-sm font-medium text-slate-700">Danh mục</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.delete("category");
                  params.delete("page");
                  const query = params.toString();
                  router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
                }}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  !selectedCategory
                    ? "bg-blue-700 text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-blue-50"
                }`}
              >
                Tất cả
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("category", cat);
                    params.delete("page");
                    const query = params.toString();
                    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
                  }}
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    selectedCategory === cat
                      ? "bg-blue-700 text-white"
                      : "border border-slate-300 text-slate-700 hover:bg-blue-50"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={clearFilters}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Xóa bộ lọc
        </button>
      </div>
    </aside>
  );
}
