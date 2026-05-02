/* eslint-disable @next/next/no-img-element */

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "../../../db";
import { cartItems, orders, products, stores } from "../../../db/schema";

const formatCurrency = (value: number) => `${value.toLocaleString("vi-VN")} VNĐ`;

export default async function AdminStoresPage() {
  const allStores = await db.select().from(stores);

  const storeProducts = allStores.length
    ? await db
        .select({
          id: products.id,
          storeId: products.storeId,
          name: products.name,
          price: products.price,
          imageUrl: products.imageUrl,
        })
        .from(products)
        .where(inArray(products.storeId, allStores.map((store) => store.id)))
    : [];

  const productsByStoreId = storeProducts.reduce<Record<number, typeof storeProducts>>((acc, product) => {
    const key = product.storeId ?? -1;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(product);
    return acc;
  }, {});

  return (
    <div className="space-y-4 rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Quản lý gian hàng</h1>
        <p className="mt-2 text-slate-600">Xem toàn bộ gian hàng và xóa sản phẩm hoặc gian hàng không còn hoạt động.</p>
      </div>

      {allStores.length === 0 ? (
        <p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-slate-600">Hiện chưa có gian hàng nào.</p>
      ) : (
        <div className="space-y-4">
          {allStores.map((store) => {
            const productsInStore = productsByStoreId[store.id] ?? [];

            return (
              <article key={store.id} className="rounded-xl border border-blue-100 bg-blue-50/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{store.name}</h2>
                    <p className="text-sm text-slate-600">Chủ gian hàng: {store.ownerId}</p>
                    <p className="text-sm text-slate-500">Số sản phẩm: {productsInStore.length}</p>
                  </div>

                  <form
                    action={async () => {
                      "use server";
                      const { getServerSession: gss } = await import("next-auth");
                      const { authOptions: ao } = await import("../../api/auth/[...nextauth]/route");
                      const s = await gss(ao);
                      if (!s?.user?.id || !s.user.roles?.includes("admin")) return;

                      const ownedProducts = await db
                        .select({ id: products.id })
                        .from(products)
                        .where(eq(products.storeId, store.id));

                      const ownedProductIds = ownedProducts.map((item) => item.id);

                      await db.transaction(async (tx) => {
                        if (ownedProductIds.length > 0) {
                          await tx.delete(cartItems).where(inArray(cartItems.productId, ownedProductIds));
                          await tx.delete(orders).where(inArray(orders.productId, ownedProductIds));
                        }

                        await tx.delete(products).where(eq(products.storeId, store.id));
                        await tx.delete(stores).where(and(eq(stores.id, store.id), eq(stores.ownerId, store.ownerId)));
                      });

                      revalidatePath("/admin/stores");
                      revalidatePath("/");
                      revalidatePath("/seller");
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                    >
                      Xóa gian hàng
                    </button>
                  </form>
                </div>

                <div className="mt-4 space-y-2">
                  {productsInStore.length === 0 ? (
                    <p className="text-sm text-slate-500">Gian hàng chưa có sản phẩm.</p>
                  ) : (
                    productsInStore.map((product) => (
                      <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white p-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <img
                            src={product.imageUrl || "/default-product.svg"}
                            alt={product.name}
                            className="h-12 w-12 rounded-lg border border-blue-100 object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{product.name}</p>
                            <p className="text-xs text-slate-600">{formatCurrency(product.price)}</p>
                          </div>
                        </div>

                        <form
                          action={async () => {
                            "use server";
                            const { getServerSession: gss } = await import("next-auth");
                            const { authOptions: ao } = await import("../../api/auth/[...nextauth]/route");
                            const s = await gss(ao);
                            if (!s?.user?.id || !s.user.roles?.includes("admin")) return;

                            await db.transaction(async (tx) => {
                              await tx.delete(cartItems).where(eq(cartItems.productId, product.id));
                              await tx.delete(orders).where(eq(orders.productId, product.id));
                              await tx.delete(products).where(eq(products.id, product.id));
                            });

                            revalidatePath("/admin/stores");
                            revalidatePath("/");
                            revalidatePath("/seller");
                          }}
                        >
                          <button
                            type="submit"
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                          >
                            Xóa mặt hàng
                          </button>
                        </form>
                      </div>
                    ))
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}