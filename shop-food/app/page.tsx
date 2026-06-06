/* eslint-disable @next/next/no-img-element */
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql, desc } from "drizzle-orm";
import Link from "next/link";

import { authOptions } from "@/lib/authOptions";
import { db } from "@/db";
import { menuItems, cartItems } from "@/db/schema";

const formatVnd = (value: number) => `${value.toLocaleString("vi-VN")} đ`;

async function addToCart(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin");
  const roles = session.user.roles ?? [];
  if (!roles.includes("buyer")) return;

  const menuItemId = Number(formData.get("menuItemId"));
  const quantity = Math.max(1, Math.floor(Number(formData.get("quantity")) || 1));
  if (!Number.isInteger(menuItemId) || menuItemId <= 0) return;

  const [item] = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.id, menuItemId))
    .limit(1);
  if (!item || !item.available) return;

  await db
    .insert(cartItems)
    .values({ userId: session.user.id, menuItemId, quantity })
    .onConflictDoUpdate({
      target: [cartItems.userId, cartItems.menuItemId],
      set: { quantity: sql`${cartItems.quantity} + ${quantity}` },
    });

  revalidatePath("/");
  revalidatePath("/cart");
}

export default async function MenuPage() {
  const session = await getServerSession(authOptions);
  const isAuthenticated = Boolean(session?.user?.id);
  const roles = session?.user?.roles ?? [];
  const canOrder = roles.includes("buyer");

  const items = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.available, true))
    .orderBy(desc(menuItems.createdAt));

  return (
    <div>
      <div className="card">
        <h1>Thực đơn ShopFood</h1>
        <p className="muted">
          Đặt món trong hệ sinh thái ecommerce. Đăng nhập một lần (SSO Keycloak) là
          dùng được mọi app.
        </p>
        {!isAuthenticated ? (
          <p className="alert-info" style={{ marginTop: 12 }}>
            Bạn chưa đăng nhập. Dùng nút &quot;Đăng nhập SSO&quot; ở góc phải để đặt món.
          </p>
        ) : !canOrder ? (
          <p className="alert-warn" style={{ marginTop: 12 }}>
            Tài khoản của bạn không có vai trò <code>buyer</code> nên không đặt món được.
          </p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="card">
          <p className="muted">
            Thực đơn đang trống. {roles.includes("food_admin") || roles.includes("admin") ? (
              <Link href="/admin" className="badge badge-active">Thêm món ở trang Quản trị</Link>
            ) : "Quay lại sau nhé."}
          </p>
        </div>
      ) : (
        <div className="menu-grid">
          {items.map((item) => (
            <div key={item.id} className="card" style={{ marginBottom: 0 }}>
              <img
                src={item.imageUrl || "/default-food.svg"}
                alt={item.name}
                style={{
                  width: "100%",
                  height: 140,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid #fecaca",
                  background: "#fff1f2",
                }}
              />
              <h2 style={{ marginTop: 12 }}>{item.name}</h2>
              <p className="muted" style={{ minHeight: 40 }}>
                {item.description || "Món ngon đang chờ bạn."}
              </p>
              <p className="price" style={{ fontSize: 18 }}>{formatVnd(item.priceVnd)}</p>

              {canOrder ? (
                <form action={addToCart} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input type="hidden" name="menuItemId" value={item.id} />
                  <input
                    name="quantity"
                    type="number"
                    min={1}
                    defaultValue={1}
                    style={{ width: 72 }}
                    aria-label="Số lượng"
                  />
                  <button type="submit" className="btn btn-primary">Thêm vào giỏ</button>
                </form>
              ) : (
                <button disabled className="btn" style={{ marginTop: 8 }}>
                  {isAuthenticated ? "Chỉ buyer được đặt" : "Đăng nhập để đặt"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
