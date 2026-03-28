/* eslint-disable @next/next/no-img-element */

import { getServerSession } from "next-auth";
import Link from "next/link";
import { and, eq, gte, ilike, lte } from "drizzle-orm";

import { authOptions } from "./api/auth/[...nextauth]/route";
import LogoutButton from "./components/LogoutButton";
import CheckoutButton from "./components/CheckoutButton";
import AddToCartButton from "./components/AddToCartButton";
import ProductSearchFilters from "./components/ProductSearchFilters";
import { db } from "../db";
import { cartItems, products } from "../db/schema";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    minPrice?: string;
    maxPrice?: string;
  }>;
};

const formatPrice = (price: number) => `${price.toLocaleString("vi-VN")} VNĐ`;

export default async function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles ?? [];
  const businessRoles = ["buyer", "seller", "admin"];
  const visibleRoles = roles.filter((role) => businessRoles.includes(role));
  const canBuy = roles.includes("buyer");

  const keyword = resolvedSearchParams.q?.trim() ?? "";
  const minPrice = Number(resolvedSearchParams.minPrice);
  const maxPrice = Number(resolvedSearchParams.maxPrice);

  const hasMinPrice = Number.isFinite(minPrice) && minPrice >= 0;
  const hasMaxPrice = Number.isFinite(maxPrice) && maxPrice >= 0;

  const filters = [];

  if (keyword) {
    filters.push(ilike(products.name, `%${keyword}%`));
  }

  if (hasMinPrice) {
    filters.push(gte(products.price, minPrice));
  }

  if (hasMaxPrice) {
    filters.push(lte(products.price, maxPrice));
  }

  const allProducts = await db
    .select()
    .from(products)
    .where(filters.length > 0 ? and(...filters) : undefined);

  let cartCount = 0;

  if (session?.user?.id && canBuy) {
    const buyerCart = await db
      .select({ quantity: cartItems.quantity })
      .from(cartItems)
      .where(eq(cartItems.userId, session.user.id));

    cartCount = buyerCart.reduce((sum, item) => sum + item.quantity, 0);
  }

  return (
    <main className="w-full space-y-6">
      <section className="rounded-3xl bg-gradient-to-r from-blue-800 via-blue-700 to-sky-600 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-blue-100">Ecommerce Platform</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Nền tảng thương mại</h1>
            <p className="mt-2 max-w-2xl text-blue-50">
              Tìm kiếm sản phẩm nhanh, lọc theo giá tức thì và chuyển sang trang chi tiết để mua hàng thuận tiện.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {session && canBuy && (
              <Link
                href="/orders"
                className="rounded-lg bg-white/20 px-4 py-2 text-sm font-medium backdrop-blur hover:bg-white/30"
              >
                Lịch sử mua hàng
              </Link>
            )}
            {session && canBuy && (
              <Link
                href="/cart"
                className="rounded-lg bg-white/20 px-4 py-2 text-sm font-medium backdrop-blur hover:bg-white/30"
              >
                Giỏ hàng ({cartCount})
              </Link>
            )}
            {!session && (
              <Link
                href="/api/auth/signin/keycloak"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Đăng nhập với Keycloak
              </Link>
            )}
          </div>
        </div>
      </section>

      {session ? (
        <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5 shadow-sm">
          <p className="text-base font-semibold text-slate-900">Đã đăng nhập thành công</p>
          <div className="mt-3 grid gap-2 text-sm text-slate-700">
            <p>
              Tên: <span className="font-semibold">{session.user?.name}</span>
            </p>
            <p>
              Vai trò:{" "}
              <span className="font-semibold">
                {visibleRoles.length > 0 ? visibleRoles.join(", ") : "Không có vai trò nghiệp vụ"}
              </span>
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {roles.includes("seller") && (
              <Link href="/seller" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
                Vào trang Người Bán
              </Link>
            )}
            {roles.includes("buyer") && !roles.includes("seller") && (
              <Link
                href="/seller/register"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Đăng ký bán hàng
              </Link>
            )}
            {roles.includes("admin") && (
              <Link href="/admin" className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900">
                Vào trang Quản Trị
              </Link>
            )}
            <div className="min-w-40">
              <LogoutButton idToken={session.idToken} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <ProductSearchFilters />

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold text-slate-900">Danh sách sản phẩm</h2>
            <p className="text-sm text-slate-500">Tìm thấy {allProducts.length} sản phẩm</p>
          </div>

          {allProducts.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {allProducts.map((product) => (
                <article
                  key={product.id}
                  className="flex h-full flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <Link href={`/product/${product.id}`} className="block bg-gradient-to-br from-blue-100 to-sky-50 p-4">
                    <img
                      src={product.imageUrl || "/default-product.svg"}
                      alt={product.name}
                      className="h-32 w-full rounded-xl border border-blue-200 bg-white object-cover"
                    />
                  </Link>

                  <div className="flex flex-1 flex-col p-4">
                    <Link href={`/product/${product.id}`} className="text-lg font-semibold text-slate-900 hover:text-sky-700">
                      {product.name}
                    </Link>
                    <p className="mt-2 text-sm text-slate-600">{product.description ?? "Sản phẩm chưa có mô tả."}</p>

                    <div className="mt-4 space-y-3">
                      <p className="text-base font-bold text-sky-700">{formatPrice(product.price)}</p>
                      <Link
                        href={`/product/${product.id}`}
                        className="inline-block rounded-lg border border-blue-200 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50"
                      >
                        Xem chi tiết
                      </Link>

                      {session && canBuy ? (
                        <div className="flex items-center gap-2">
                          <AddToCartButton productId={product.id} />
                          <CheckoutButton product={{ id: product.id, name: product.name, price: product.price }} />
                        </div>
                      ) : session ? (
                        <button disabled className="rounded bg-blue-50 px-3 py-1 text-sm font-medium text-slate-500">
                          Chỉ buyer được mua
                        </button>
                      ) : (
                        <Link
                          href="/api/auth/signin/keycloak"
                          className="inline-block rounded bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 hover:bg-blue-200"
                        >
                          Đăng nhập để mua
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-8 text-center">
              <p className="text-slate-600">Không tìm thấy sản phẩm phù hợp với tiêu chí hiện tại.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
