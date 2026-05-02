import { desc, eq, sql } from "drizzle-orm";

import { db } from "../../db";
import { reviews } from "../../db/schema";

type ReviewListProps = {
  productId: number;
};

export default async function ReviewList({ productId }: ReviewListProps) {
  const [productReviews, avgResult] = await Promise.all([
    db
      .select()
      .from(reviews)
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt)),
    db
      .select({
        avg: sql<number>`coalesce(avg(${reviews.rating}), 0)::numeric(2,1)`,
        count: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .where(eq(reviews.productId, productId)),
  ]);

  const avgRating = Number(avgResult[0]?.avg ?? 0);
  const totalReviews = avgResult[0]?.count ?? 0;

  if (totalReviews === 0) {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-4">
        <p className="text-sm text-slate-500">Chưa có đánh giá nào cho sản phẩm này.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <span key={star} className={`text-lg ${star <= Math.round(avgRating) ? "text-yellow-400" : "text-slate-300"}`}>
              ★
            </span>
          ))}
        </div>
        <span className="text-sm text-slate-600">
          {avgRating} / 5 ({totalReviews} đánh giá)
        </span>
      </div>

      <div className="space-y-2">
        {productReviews.map((review) => (
          <div key={review.id} className="rounded-lg border border-blue-100 bg-white p-3">
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span key={star} className={`text-sm ${star <= review.rating ? "text-yellow-400" : "text-slate-300"}`}>
                    ★
                  </span>
                ))}
              </div>
              <span className="text-xs text-slate-500">
                {review.createdAt ? new Date(review.createdAt).toLocaleDateString("vi-VN") : ""}
              </span>
            </div>
            {review.comment && <p className="mt-1 text-sm text-slate-700">{review.comment}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
