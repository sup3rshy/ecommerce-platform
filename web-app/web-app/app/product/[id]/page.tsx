/* eslint-disable @next/next/no-img-element */

import { and, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "../../../db";
import { products, stores } from "../../../db/schema";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import ProductPurchasePanel from "../../components/ProductPurchasePanel";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

const formatPrice = (price: number) => `${price.toLocaleString("vi-VN")} VNĐ`;

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const productId = Number(id);

  if (!Number.isInteger(productId) || productId <= 0) {
    notFound();
  }

  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles ?? [];
  const canBuy = roles.includes("buyer");

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.price,
      imageUrl: products.imageUrl,
      storeName: stores.name,
      storeId: stores.id,
    })
    .from(products)
    .leftJoin(stores, eq(products.storeId, stores.id))
    .where(and(eq(products.id, productId)));

  const product = rows[0];

  if (!product) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-1 py-2 sm:px-2">
      <div className="mb-4">
        <Link href="/" className="text-sm font-medium text-sky-700 hover:text-sky-800">
          ← Quay lại trang chủ
        </Link>
      </div>

      <section className="grid grid-cols-1 gap-6 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm lg:grid-cols-[1.2fr_1fr]">
        <div>
          <img
            src={product.imageUrl || "/default-product.svg"}
            alt={product.name}
            className="mb-4 h-64 w-full rounded-2xl border border-blue-100 bg-blue-50 object-cover"
          />
          <h1 className="text-3xl font-bold text-slate-900">{product.name}</h1>
          <p className="mt-2 text-sm text-slate-500">
            Gian hàng: <span className="font-semibold text-slate-700">{product.storeName ?? "Chưa có gian hàng"}</span>
          </p>
          <p className="mt-3 text-2xl font-bold text-sky-700">{formatPrice(product.price)}</p>
        </div>

        <div className="space-y-4">
          {session && canBuy ? (
            <ProductPurchasePanel productId={product.id} />
          ) : session ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Tài khoản hiện tại không có vai trò buyer nên chưa thể thêm sản phẩm vào giỏ.
            </div>
          ) : (
            <div className="rounded-2xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-800">
              Vui lòng <Link href="/api/auth/signin/keycloak" className="font-semibold underline">đăng nhập</Link> để thêm sản phẩm vào giỏ hàng.
            </div>
          )}

          <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
            <p className="text-sm font-semibold text-slate-800">Thông số kỹ thuật</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              <li>Mã sản phẩm: #{product.id}</li>
              <li>Giá niêm yết: {formatPrice(product.price)}</li>
              <li>Gian hàng sở hữu: {product.storeName ?? "Chưa cập nhật"}</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Mô tả chi tiết</h2>
          <p className="mt-3 text-slate-700">{product.description ?? "Sản phẩm hiện chưa có mô tả chi tiết."}</p>
        </article>

        <article className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Đánh giá</h2>
          <p className="mt-3 text-slate-700">Chức năng đánh giá đang được cập nhật. Nội dung đánh giá sẽ hiển thị tại đây.</p>
        </article>
      </section>
    </main>
  );
}
