"use client";

import { useState } from "react";
import AddToCartButton from "./AddToCartButton";

type ProductPurchasePanelProps = {
  productId: number;
};

export default function ProductPurchasePanel({ productId }: ProductPurchasePanelProps) {
  const [quantity, setQuantity] = useState(1);

  const decrease = () => setQuantity((prev) => Math.max(1, prev - 1));
  const increase = () => setQuantity((prev) => prev + 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-800">Chọn số lượng</p>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={decrease}
          className="h-9 w-9 rounded-lg border border-slate-300 text-lg font-semibold text-slate-700 hover:bg-slate-100"
        >
          -
        </button>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(event) => {
            const next = Number(event.target.value);
            setQuantity(Number.isFinite(next) && next > 0 ? next : 1);
          }}
          className="h-9 w-20 rounded-lg border border-slate-300 px-2 text-center text-sm"
        />
        <button
          type="button"
          onClick={increase}
          className="h-9 w-9 rounded-lg border border-slate-300 text-lg font-semibold text-slate-700 hover:bg-slate-100"
        >
          +
        </button>
      </div>
      <div className="mt-4">
        <AddToCartButton productId={productId} quantity={quantity} />
      </div>
    </div>
  );
}
