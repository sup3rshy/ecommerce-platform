import { signCatalog } from "./catalogSig";

/**
 * Đọc/cập nhật đơn hàng của gian hàng từ ShopEcommerce (:3000).
 *
 * Đơn hàng phát sinh ở storefront ShopEcommerce và lưu trong DB `ecommerce`.
 * ShopSell KHÔNG nối trực tiếp DB đó; thay vào đó gọi endpoint nội bộ
 * /api/internal/orders/* của ShopEcommerce, ký HMAC bằng CATALOG_SYNC_SECRET
 * (dùng chung kênh tin cậy server-to-server với catalog sync).
 *
 * scope (all) do ShopSell quyết định SAU KHI đã verify role của user ở phía
 * server (seller -> chỉ đơn của mình; ecommerce_admin/admin -> tất cả). Endpoint phía
 * ShopEcommerce tin cậy quyết định này vì request đã được xác thực bằng HMAC.
 */

const TARGET =
  process.env.SHOP_ECOMMERCE_INTERNAL_URL ?? "http://localhost:3000";

export type SellerOrder = {
  id: number;
  buyerId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  status: "pending" | "shipping" | "completed";
  sellerId: string;
  storeName: string;
  createdAt: string | null;
};

type OrderScope = { sellerId: string; all: boolean };

async function postSigned(
  path: string,
  data: Record<string, unknown>
): Promise<unknown> {
  const sig = signCatalog(data);
  const resp = await fetch(`${TARGET}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, sig }),
    cache: "no-store",
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    const message =
      (json && typeof json === "object" && "error" in json
        ? String((json as { error?: unknown }).error)
        : "") || `HTTP ${resp.status}`;
    throw new Error(message);
  }
  return json;
}

const toStatus = (value: unknown): SellerOrder["status"] =>
  value === "shipping" || value === "completed"
    ? value
    : "pending";

export async function fetchSellerOrders(
  scope: OrderScope
): Promise<SellerOrder[]> {
  const data = {
    event: "orders.list",
    sellerId: scope.sellerId,
    all: scope.all,
    ts: Date.now(),
  };
  const json = (await postSigned("/api/internal/orders/list", data)) as {
    orders?: unknown[];
  } | null;

  const rows = Array.isArray(json?.orders) ? json!.orders : [];
  return rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      id: Number(row.id),
      buyerId: String(row.buyerId ?? ""),
      productName: String(row.productName ?? ""),
      quantity: Number(row.quantity ?? 0),
      unitPrice: Number(row.unitPrice ?? 0),
      status: toStatus(row.status),
      sellerId: String(row.sellerId ?? ""),
      storeName: String(row.storeName ?? ""),
      createdAt: row.createdAt ? String(row.createdAt) : null,
    };
  });
}

export async function updateSellerOrderStatus(
  scope: OrderScope,
  orderId: number,
  status: "shipping" | "completed"
): Promise<void> {
  const data = {
    event: "orders.status",
    sellerId: scope.sellerId,
    all: scope.all,
    orderId,
    status,
    ts: Date.now(),
  };
  await postSigned("/api/internal/orders/status", data);
}
