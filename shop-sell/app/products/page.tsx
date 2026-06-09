import crypto from "node:crypto";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { authOptions } from "@/lib/authOptions";
import { db } from "@/db";
import { products } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { syncUpsert, syncDelete, flushOutboxQuietly } from "@/lib/catalogSync";

// Ai được quản lý catalog: chủ shop, quản trị Ecommerce, hoặc admin nền tảng.
const MANAGE_ROLES = ["seller", "ecommerce_admin", "admin"];

function canManage(roles: string[]): boolean {
  return roles.some((r) => MANAGE_ROLES.includes(r));
}
function isAdminLike(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("ecommerce_admin");
}

function genSku(name: string): string {
  const slug =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "sp";
  return `${slug}-${crypto.randomUUID().slice(0, 6)}`;
}

function storeNameFor(session: {
  user?: { name?: string | null; id?: string } | null;
}): string {
  return (
    session.user?.name?.trim() ||
    `Shop ${(session.user?.id ?? "").slice(0, 6)}`
  );
}

async function createProduct(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("unauthenticated");
  if (!canManage(session.user.roles ?? [])) throw new Error("Forbidden");
  await flushOutboxQuietly();

  const name = String(formData.get("name") ?? "").trim();
  const price = Math.max(0, Math.floor(Number(formData.get("price")) || 0));
  const stock = Math.max(0, Math.floor(Number(formData.get("stock")) || 0));
  const description = String(formData.get("description") ?? "").trim() || null;
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const skuInput = String(formData.get("sku") ?? "").trim();
  if (!name || price <= 0) return;

  const sellerId = session.user.id;
  const sku = skuInput || genSku(name);

  await db
    .insert(products)
    .values({
      sellerId,
      sku,
      name,
      priceVnd: price,
      stock,
      status: "active",
      description,
      imageUrl,
    })
    .onConflictDoNothing({
      target: [products.sellerId, products.sku],
    });

  await logAudit({
    actorId: sellerId,
    action: "product.create",
    resource: sku,
    metadata: { name, price, stock },
  });

  await syncUpsert({
    sellerId,
    sku,
    name,
    price,
    stock,
    status: "active",
    description,
    imageUrl,
    storeName: storeNameFor(session),
  });

  revalidatePath("/products");
}

async function updateProduct(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("unauthenticated");
  const roles = session.user.roles ?? [];
  if (!canManage(roles)) throw new Error("Forbidden");
  await flushOutboxQuietly();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;

  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) return;
  // Seller chỉ sửa sản phẩm của mình; admin/ecommerce_admin sửa tất cả.
  if (!isAdminLike(roles) && existing.sellerId !== session.user.id) {
    throw new Error("Forbidden: không phải sản phẩm của bạn");
  }

  const name = String(formData.get("name") ?? "").trim() || existing.name;
  const price = Math.max(0, Math.floor(Number(formData.get("price")) || 0));
  const stock = Math.max(0, Math.floor(Number(formData.get("stock")) || 0));
  const description = String(formData.get("description") ?? "").trim() || null;
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  if (price <= 0) return;

  await db
    .update(products)
    .set({ name, priceVnd: price, stock, description, imageUrl, updatedAt: new Date() })
    .where(eq(products.id, id));

  await logAudit({
    actorId: session.user.id,
    action: "product.update",
    resource: existing.sku,
    metadata: { name, price, stock },
  });

  await syncUpsert({
    sellerId: existing.sellerId,
    sku: existing.sku,
    name,
    price,
    stock,
    status: existing.status,
    description,
    imageUrl,
    storeName: storeNameFor(session),
  });

  revalidatePath("/products");
}

async function toggleStatus(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("unauthenticated");
  const roles = session.user.roles ?? [];
  if (!canManage(roles)) throw new Error("Forbidden");
  await flushOutboxQuietly();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;

  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) return;
  if (!isAdminLike(roles) && existing.sellerId !== session.user.id) {
    throw new Error("Forbidden");
  }

  const nextStatus = existing.status === "active" ? "hidden" : "active";
  await db
    .update(products)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(products.id, id));

  await logAudit({
    actorId: session.user.id,
    action: "product.toggleStatus",
    resource: existing.sku,
    metadata: { status: nextStatus },
  });

  await syncUpsert({
    sellerId: existing.sellerId,
    sku: existing.sku,
    name: existing.name,
    price: existing.priceVnd,
    stock: existing.stock,
    status: nextStatus,
    description: existing.description,
    imageUrl: existing.imageUrl,
    storeName: storeNameFor(session),
  });

  revalidatePath("/products");
}

async function deleteProduct(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("unauthenticated");
  const roles = session.user.roles ?? [];
  if (!canManage(roles)) throw new Error("Forbidden");
  await flushOutboxQuietly();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;

  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) return;
  if (!isAdminLike(roles) && existing.sellerId !== session.user.id) {
    throw new Error("Forbidden");
  }

  await db.delete(products).where(eq(products.id, id));

  await logAudit({
    actorId: session.user.id,
    action: "product.delete",
    resource: existing.sku,
  });

  // Báo ShopEcommerce ẩn sản phẩm khỏi storefront (soft-delete bên đó).
  await syncDelete({ sellerId: existing.sellerId, sku: existing.sku });

  revalidatePath("/products");
}

export default async function ProductsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/sso?callbackUrl=/products");
  const roles = session.user.roles ?? [];
  if (!canManage(roles)) redirect("/denied");

  await flushOutboxQuietly();

  const adminLike = isAdminLike(roles);
  const rows = adminLike
    ? await db.select().from(products).orderBy(desc(products.updatedAt))
    : await db
        .select()
        .from(products)
        .where(eq(products.sellerId, session.user.id))
        .orderBy(desc(products.updatedAt));

  return (
    <div>
      <h1>Quản lý sản phẩm</h1>
      <p className="muted">
        ShopSell là nguồn quản lý sản phẩm (source of truth). Mỗi thay đổi được ký
        HMAC và đồng bộ sang storefront ShopEcommerce (:3000).
        {adminLike && " Bạn đang xem TẤT CẢ sản phẩm (quyền quản trị)."}
      </p>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Thêm sản phẩm mới</h2>
        <form
          action={createProduct}
          style={{ display: "grid", gap: 10, maxWidth: 520 }}
        >
          <input name="name" placeholder="Tên sản phẩm" required />
          <div style={{ display: "flex", gap: 10 }}>
            <input
              name="price"
              type="number"
              min={1}
              placeholder="Giá (VNĐ)"
              required
              style={{ flex: 1 }}
            />
            <input
              name="stock"
              type="number"
              min={0}
              defaultValue={0}
              placeholder="Tồn kho"
              style={{ flex: 1 }}
            />
          </div>
          <input
            name="sku"
            placeholder="SKU (để trống sẽ tự sinh)"
          />
          <input name="imageUrl" type="url" placeholder="URL ảnh (tùy chọn)" />
          <textarea name="description" placeholder="Mô tả" rows={2} />
          <button type="submit" className="btn btn-primary" style={{ width: "fit-content" }}>
            Thêm sản phẩm
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Sản phẩm ({rows.length})</h2>
        {rows.length === 0 ? (
          <p className="muted">Chưa có sản phẩm nào. Thêm ở trên để đồng bộ sang storefront.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Tên</Th>
                <Th>Giá</Th>
                <Th>Tồn</Th>
                <Th>Trạng thái</Th>
                <Th>Sửa / Hành động</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <code className="code-inline">{p.sku}</code>
                  </Td>
                  <Td>{p.name}</Td>
                  <Td>{p.priceVnd.toLocaleString("vi-VN")} đ</Td>
                  <Td>{p.stock}</Td>
                  <Td>
                    <span className={p.status === "active" ? "alert-success" : "alert-warn"} style={{ padding: "2px 8px", borderRadius: 8, fontSize: 12 }}>
                      {p.status}
                    </span>
                  </Td>
                  <Td>
                    <details>
                      <summary style={{ cursor: "pointer" }}>Sửa</summary>
                      <form action={updateProduct} style={{ display: "grid", gap: 6, marginTop: 8, maxWidth: 420 }}>
                        <input type="hidden" name="id" value={p.id} />
                        <input name="name" defaultValue={p.name} required />
                        <div style={{ display: "flex", gap: 6 }}>
                          <input name="price" type="number" min={1} defaultValue={p.priceVnd} required style={{ flex: 1 }} />
                          <input name="stock" type="number" min={0} defaultValue={p.stock} required style={{ flex: 1 }} />
                        </div>
                        <input name="imageUrl" type="url" defaultValue={p.imageUrl ?? ""} placeholder="URL ảnh" />
                        <textarea name="description" defaultValue={p.description ?? ""} rows={2} />
                        <button type="submit" className="btn btn-primary" style={{ width: "fit-content" }}>
                          Lưu
                        </button>
                      </form>
                    </details>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <form action={toggleStatus}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="btn">
                          {p.status === "active" ? "Ẩn" : "Hiện"}
                        </button>
                      </form>
                      <form action={deleteProduct}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="btn">
                          Xóa
                        </button>
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontWeight: 500 }}>
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "8px 6px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" }}>{children}</td>;
}
