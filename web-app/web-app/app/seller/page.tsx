/* eslint-disable @next/next/no-img-element */

import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { db } from "../../db";
import { stores, products, orders } from "../../db/schema";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import SellerOrdersPanel from "../components/SellerOrdersPanel";

type StoreProduct = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  imageUrl: string | null;
};

type OrderStatus = "pending" | "shipping" | "completed";

const toOrderStatus = (status: string | null): OrderStatus => {
  if (status === "shipping" || status === "completed") {
    return status;
  }

  return "pending";
};

export default async function SellerDashboard() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user.id) {
    redirect("/");
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("seller")) {
    redirect("/");
  }

  // Truy vấn cơ sở dữ liệu xem người dùng này đã tạo gian hàng chưa
  const userStores = await db.select().from(stores).where(eq(stores.ownerId, session.user.id));
  const hasStore = userStores.length > 0;
  const userStore = userStores[0];
  let storeProducts: StoreProduct[] = [];
  let storeOrders: Array<{
    id: number;
    buyerId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    status: OrderStatus;
    createdAt: string;
  }> = [];

  if (hasStore) {
    storeProducts = await db.select().from(products).where(eq(products.storeId, userStore.id));

    const orderRows = await db
      .select({
        id: orders.id,
        buyerId: orders.userId,
        quantity: orders.quantity,
        unitPrice: orders.unitPrice,
        status: orders.status,
        createdAt: orders.createdAt,
        productName: products.name,
      })
      .from(orders)
      .innerJoin(products, eq(orders.productId, products.id))
      .innerJoin(stores, eq(products.storeId, stores.id))
      .where(and(eq(stores.ownerId, session.user.id), eq(stores.id, userStore.id)))
      .orderBy(desc(orders.createdAt));

    storeOrders = orderRows.map((order) => ({
      id: order.id,
      buyerId: order.buyerId,
      productName: order.productName,
      quantity: order.quantity,
      unitPrice: order.unitPrice,
      status: toOrderStatus(order.status),
      createdAt: order.createdAt ? new Date(order.createdAt).toLocaleString("vi-VN") : "Không rõ",
    }));
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Bảng điều khiển Người Bán</h1>
        <p className="mt-2 text-sm text-slate-600">Theo dõi gian hàng, quản lý sản phẩm và cập nhật trạng thái đơn hàng tại một nơi.</p>
      </header>

      {hasStore ? (
        <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Gian hàng của bạn: {userStore.name}</h2>
          <div className="mt-6">
            <h3 className="mb-3 text-lg font-medium text-slate-900">Thêm sản phẩm mới</h3>
            <form className="flex max-w-md flex-col gap-3" action={async (formData) => {
              "use server";
              const { getServerSession: gss } = await import("next-auth");
              const { authOptions: ao } = await import("../api/auth/[...nextauth]/route");
              const s = await gss(ao);
              if (!s?.user?.id || !s.user.roles?.includes("seller")) return;

              const name = formData.get("name") as string;
              const price = Number(formData.get("price"));
              const description = formData.get("description") as string;
              const imageUrl = (formData.get("imageUrl") as string | null)?.trim() || null;
              const stock = Math.max(0, Math.floor(Number(formData.get("stock")) || 0));

              if (name && price > 0) {
                // Verify store ownership
                const myStore = await db.select({ id: stores.id }).from(stores)
                  .where(and(eq(stores.id, userStore.id), eq(stores.ownerId, s.user.id))).limit(1);
                if (myStore.length === 0) return;

                await db.insert(products).values({
                  storeId: userStore.id,
                  name,
                  price,
                  stock,
                  description,
                  imageUrl,
                });
                revalidatePath("/seller");
                revalidatePath("/");
              }
            }}>
              <input
                type="text"
                name="name"
                placeholder="Tên sản phẩm"
                className="rounded-lg border border-blue-200 p-2 outline-none focus:border-blue-500"
                required
              />
              <input
                type="number"
                name="price"
                placeholder="Giá tiền"
                className="rounded-lg border border-blue-200 p-2 outline-none focus:border-blue-500"
                required
              />
              <input
                type="number"
                name="stock"
                placeholder="Số lượng tồn kho"
                min={0}
                className="rounded-lg border border-blue-200 p-2 outline-none focus:border-blue-500"
                required
              />
              <textarea
                name="description"
                placeholder="Mô tả sản phẩm"
                className="rounded-lg border border-blue-200 p-2 outline-none focus:border-blue-500"
              ></textarea>
              <input
                type="url"
                name="imageUrl"
                placeholder="Đường dẫn ảnh sản phẩm (không bắt buộc)"
                className="rounded-lg border border-blue-200 p-2 outline-none focus:border-blue-500"
              />
              <button type="submit" className="w-fit rounded-lg bg-blue-700 px-4 py-2 text-white hover:bg-blue-800">
                Thêm sản phẩm
              </button>
            </form>
          </div>

          <div className="mt-8">
            <h3 className="mb-3 text-lg font-medium text-slate-900">Danh sách sản phẩm</h3>
            {storeProducts.length > 0 ? (
              <ul className="space-y-2">
                {storeProducts.map((product) => (
                  <li
                    key={product.id}
                    className="rounded-xl border border-blue-100 bg-blue-50/40 p-3"
                  >
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[120px_1fr]">
                      <img
                        src={product.imageUrl || "/default-product.svg"}
                        alt={product.name}
                        className="h-24 w-full rounded-lg border border-blue-100 object-cover bg-white"
                      />

                      <div className="space-y-2">
                        <p className="font-semibold text-slate-900">{product.name}</p>
                        <p className="text-sm text-gray-600">{product.description || "Sản phẩm chưa có mô tả."}</p>
                        <p className="font-bold text-blue-600">{product.price.toLocaleString("vi-VN")} VNĐ</p>
                        <p className="text-sm text-gray-600">Tồn kho: {product.stock}</p>

                        <details className="rounded-lg border border-blue-100 bg-white/80 p-2">
                          <summary className="cursor-pointer list-none rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">
                            Chỉnh sửa thông tin mặt hàng
                          </summary>

                          <form
                            className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2"
                            action={async (formData) => {
                              "use server";
                              const { getServerSession: gss } = await import("next-auth");
                              const { authOptions: ao } = await import("../api/auth/[...nextauth]/route");
                              const s = await gss(ao);
                              if (!s?.user?.id || !s.user.roles?.includes("seller")) return;

                              const productId = Number(formData.get("productId"));
                              const nextName = (formData.get("name") as string | null)?.trim() || "";
                              const nextPrice = Number(formData.get("price"));
                              const nextDescription = (formData.get("description") as string | null)?.trim() || null;
                              const nextImageUrl = (formData.get("imageUrl") as string | null)?.trim() || null;
                              const nextStock = Math.max(0, Math.floor(Number(formData.get("stock")) || 0));

                              if (!Number.isInteger(productId) || productId <= 0 || !nextName || nextPrice <= 0) {
                                return;
                              }

                              // Verify store ownership
                              const myStore = await db.select({ id: stores.id }).from(stores)
                                .where(and(eq(stores.id, userStore.id), eq(stores.ownerId, s.user.id))).limit(1);
                              if (myStore.length === 0) return;

                              await db
                                .update(products)
                                .set({
                                  name: nextName,
                                  price: nextPrice,
                                  stock: nextStock,
                                  description: nextDescription,
                                  imageUrl: nextImageUrl,
                                })
                                .where(and(eq(products.id, productId), eq(products.storeId, userStore.id)));

                              revalidatePath("/seller");
                              revalidatePath("/");
                            }}
                          >
                            <input type="hidden" name="productId" value={product.id} />
                            <input
                              name="name"
                              defaultValue={product.name}
                              className="rounded-lg border border-blue-200 p-2 text-sm outline-none focus:border-blue-500"
                              required
                            />
                            <input
                              name="price"
                              type="number"
                              min={1}
                              defaultValue={product.price}
                              className="rounded-lg border border-blue-200 p-2 text-sm outline-none focus:border-blue-500"
                              required
                            />
                            <input
                              name="stock"
                              type="number"
                              min={0}
                              defaultValue={product.stock}
                              placeholder="Tồn kho"
                              className="rounded-lg border border-blue-200 p-2 text-sm outline-none focus:border-blue-500"
                              required
                            />
                            <textarea
                              name="description"
                              defaultValue={product.description ?? ""}
                              className="rounded-lg border border-blue-200 p-2 text-sm outline-none focus:border-blue-500 md:col-span-2"
                              rows={2}
                            />
                            <input
                              name="imageUrl"
                              type="url"
                              defaultValue={product.imageUrl ?? ""}
                              placeholder="Đường dẫn ảnh"
                              className="rounded-lg border border-blue-200 p-2 text-sm outline-none focus:border-blue-500 md:col-span-2"
                            />
                            <div className="flex flex-wrap gap-2 md:col-span-2">
                              <button
                                type="submit"
                                className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
                              >
                                Lưu thay đổi
                              </button>
                            </div>
                          </form>
                        </details>

                        <div className="flex flex-wrap gap-2">
                          <form
                            action={async (formData) => {
                              "use server";
                              const { getServerSession: gss } = await import("next-auth");
                              const { authOptions: ao } = await import("../api/auth/[...nextauth]/route");
                              const s = await gss(ao);
                              if (!s?.user?.id || !s.user.roles?.includes("seller")) return;

                              const productId = Number(formData.get("productId"));

                              if (!Number.isInteger(productId) || productId <= 0) {
                                return;
                              }

                              await db
                                .update(products)
                                .set({ imageUrl: null })
                                .where(and(eq(products.id, productId), eq(products.storeId, userStore.id)));

                              revalidatePath("/seller");
                              revalidatePath("/");
                            }}
                          >
                            <input type="hidden" name="productId" value={product.id} />
                            <button
                              type="submit"
                              className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                            >
                              Dùng ảnh mặc định
                            </button>
                          </form>

                          <form
                            action={async (formData) => {
                              "use server";
                              const { getServerSession: gss } = await import("next-auth");
                              const { authOptions: ao } = await import("../api/auth/[...nextauth]/route");
                              const s = await gss(ao);
                              if (!s?.user?.id || !s.user.roles?.includes("seller")) return;

                              const productId = Number(formData.get("productId"));

                              if (!Number.isInteger(productId) || productId <= 0) {
                                return;
                              }

                              await db
                                .delete(products)
                                .where(and(eq(products.id, productId), eq(products.storeId, userStore.id)));

                              revalidatePath("/seller");
                              revalidatePath("/");
                            }}
                          >
                            <input type="hidden" name="productId" value={product.id} />
                            <button
                              type="submit"
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                            >
                              Xóa sản phẩm
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">Chưa có sản phẩm nào.</p>
            )}
          </div>

          <div className="mt-8">
            <h3 className="mb-3 text-lg font-medium text-slate-900">Đơn hàng của gian hàng</h3>
            <SellerOrdersPanel initialOrders={storeOrders} />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm">
          <p className="mb-4 text-slate-700">Bạn chưa thiết lập gian hàng nào.</p>
          <form className="flex gap-2" action={async (formData) => {
            "use server";
            const { getServerSession: gss } = await import("next-auth");
            const { authOptions: ao } = await import("../api/auth/[...nextauth]/route");
            const { redirect: redir } = await import("next/navigation");
            const s = await gss(ao);
            if (!s?.user?.id || !s.user.roles?.includes("seller")) return;

            const storeName = formData.get("name") as string;
            if (storeName) {
              await db.insert(stores).values({
                ownerId: s.user.id,
                name: storeName,
              });
              redir("/seller");
            }
          }}>
            <input 
              type="text" 
              name="name" 
              placeholder="Nhập tên gian hàng mới..." 
              className="w-64 rounded-lg border border-blue-200 p-2 outline-none focus:border-blue-500"
              required 
            />
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-white hover:bg-blue-800">
              Tạo gian hàng
            </button>
          </form>
        </div>
      )}
    </div>
  );
}