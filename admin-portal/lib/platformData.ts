import { Pool } from "pg";

import { assignRealmRoleToUser } from "./keycloakAdmin";

type DbName = "ecommerce" | "shopfood" | "shoppay";

declare global {
  // eslint-disable-next-line no-var
  var __adminPortalPlatformPools: Partial<Record<DbName, Pool>> | undefined;
}

function databaseUrlFor(envName: string, dbName: DbName): string {
  const explicit = process.env[envName];
  if (explicit) return explicit;

  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(`Missing DATABASE_URL or ${envName}.`);
  }

  const url = new URL(base);
  url.pathname = `/${dbName}`;
  return url.toString();
}

function envNameFor(dbName: DbName): string {
  if (dbName === "ecommerce") return "ECOMMERCE_DATABASE_URL";
  if (dbName === "shopfood") return "SHOPFOOD_DATABASE_URL";
  return "SHOPPAY_DATABASE_URL";
}

function poolFor(dbName: DbName): Pool {
  const key = dbName;
  globalThis.__adminPortalPlatformPools ??= {};
  if (!globalThis.__adminPortalPlatformPools[key]) {
    globalThis.__adminPortalPlatformPools[key] = new Pool({
      connectionString: databaseUrlFor(envNameFor(dbName), dbName),
    });
  }
  return globalThis.__adminPortalPlatformPools[key]!;
}

async function query<T>(
  dbName: DbName,
  sqlText: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await poolFor(dbName).query(sqlText, params);
  return result.rows as T[];
}

function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  return new Date(value as string | Date).toISOString();
}

export type UpgradeRequest = {
  id: number;
  userId: string;
  kind: "seller" | "food-seller";
  storeName: string;
  requestedAt: string | null;
};

export type EcommerceStoreSummary = {
  id: number;
  name: string;
  ownerId: string;
  productCount: number;
  activeProductCount: number;
  orderCount: number;
  revenueVnd: number;
};

export type EcommerceProductSummary = {
  id: number;
  storeName: string | null;
  sellerId: string;
  sku: string;
  name: string;
  priceVnd: number;
  stock: number;
  status: string;
};

export type EcommerceOrderSummary = {
  id: number;
  buyerId: string;
  productName: string | null;
  storeName: string | null;
  quantity: number;
  unitPrice: number;
  status: string;
  createdAt: string | null;
};

export type EcommerceOverview = {
  stats: {
    stores: number;
    products: number;
    activeProducts: number;
    orders: number;
    revenueVnd: number;
  };
  stores: EcommerceStoreSummary[];
  products: EcommerceProductSummary[];
  recentOrders: EcommerceOrderSummary[];
  pendingSellerRequests: UpgradeRequest[];
};

export async function getEcommerceOverview(): Promise<EcommerceOverview> {
  const [storeRows, productRows, orderRows, stores, products, orders, requests] = await Promise.all([
    query<{ count: string }>("ecommerce", "select count(*)::int as count from stores"),
    query<{ total: string; active: string }>(
      "ecommerce",
      "select count(*)::int as total, count(*) filter (where status = 'active')::int as active from products"
    ),
    query<{ total: string; revenue: string }>(
      "ecommerce",
      "select count(*)::int as total, coalesce(sum(unit_price * quantity), 0)::int as revenue from orders"
    ),
    query<Record<string, unknown>>(
      "ecommerce",
      `
        select
          s.id,
          s.name,
          s.owner_id as "ownerId",
          count(distinct p.id)::int as "productCount",
          count(distinct p.id) filter (where p.status = 'active')::int as "activeProductCount",
          count(o.id)::int as "orderCount",
          coalesce(sum(o.unit_price * o.quantity), 0)::int as "revenueVnd"
        from stores s
        left join products p on p.store_id = s.id
        left join orders o on o.product_id = p.id
        group by s.id, s.name, s.owner_id
        order by s.id
      `
    ),
    query<Record<string, unknown>>(
      "ecommerce",
      `
        select
          p.id,
          s.name as "storeName",
          p.seller_id as "sellerId",
          p.sku,
          p.name,
          p.price as "priceVnd",
          p.stock,
          p.status
        from products p
        left join stores s on s.id = p.store_id
        order by p.updated_at desc nulls last, p.id desc
        limit 80
      `
    ),
    query<Record<string, unknown>>(
      "ecommerce",
      `
        select
          o.id,
          o.user_id as "buyerId",
          p.name as "productName",
          s.name as "storeName",
          o.quantity,
          o.unit_price as "unitPrice",
          o.status,
          o.created_at as "createdAt"
        from orders o
        left join products p on p.id = o.product_id
        left join stores s on s.id = p.store_id
        order by o.created_at desc nulls last, o.id desc
        limit 30
      `
    ),
    getPendingUpgradeRequests("seller"),
  ]);

  return {
    stats: {
      stores: num(storeRows[0]?.count),
      products: num(productRows[0]?.total),
      activeProducts: num(productRows[0]?.active),
      orders: num(orderRows[0]?.total),
      revenueVnd: num(orderRows[0]?.revenue),
    },
    stores: stores.map((row) => ({
      id: num(row.id),
      name: String(row.name ?? ""),
      ownerId: String(row.ownerId ?? ""),
      productCount: num(row.productCount),
      activeProductCount: num(row.activeProductCount),
      orderCount: num(row.orderCount),
      revenueVnd: num(row.revenueVnd),
    })),
    products: products.map((row) => ({
      id: num(row.id),
      storeName: str(row.storeName),
      sellerId: String(row.sellerId ?? ""),
      sku: String(row.sku ?? ""),
      name: String(row.name ?? ""),
      priceVnd: num(row.priceVnd),
      stock: num(row.stock),
      status: String(row.status ?? "active"),
    })),
    recentOrders: orders.map((row) => ({
      id: num(row.id),
      buyerId: String(row.buyerId ?? ""),
      productName: str(row.productName),
      storeName: str(row.storeName),
      quantity: num(row.quantity),
      unitPrice: num(row.unitPrice),
      status: String(row.status ?? "pending"),
      createdAt: iso(row.createdAt),
    })),
    pendingSellerRequests: requests,
  };
}

export type FoodRestaurantSummary = {
  userId: string;
  name: string;
  approvedAt: string | null;
};

export type FoodMenuSummary = {
  id: number;
  name: string;
  priceVnd: number;
  available: boolean;
  createdAt: string | null;
};

export type FoodOrderSummary = {
  id: number;
  buyerId: string;
  status: string;
  totalVnd: number;
  items: string | null;
  createdAt: string | null;
};

export type FoodOverview = {
  stats: {
    restaurants: number;
    menuItems: number;
    availableItems: number;
    orders: number;
    revenueVnd: number;
  };
  restaurants: FoodRestaurantSummary[];
  menu: FoodMenuSummary[];
  recentOrders: FoodOrderSummary[];
  pendingFoodSellerRequests: UpgradeRequest[];
};

export type KycDocumentSummary = {
  id: number;
  userId: string;
  fullName: string;
  docType: string;
  docNumber: string;
  status: "pending" | "approved" | "rejected" | string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewerNote: string | null;
};

export type KycOverview = {
  pending: KycDocumentSummary[];
  reviewed: KycDocumentSummary[];
  stats: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
};

function mapKycDocument(row: Record<string, unknown>): KycDocumentSummary {
  return {
    id: num(row.id),
    userId: String(row.userId ?? ""),
    fullName: String(row.fullName ?? ""),
    docType: String(row.docType ?? ""),
    docNumber: String(row.docNumber ?? ""),
    status: String(row.status ?? "pending"),
    submittedAt: iso(row.submittedAt),
    reviewedAt: iso(row.reviewedAt),
    reviewerNote: str(row.reviewerNote),
  };
}

export async function getKycOverview(): Promise<KycOverview> {
  const rows = await query<Record<string, unknown>>(
    "shoppay",
    `
      select
        id,
        user_id as "userId",
        full_name as "fullName",
        doc_type as "docType",
        doc_number as "docNumber",
        status,
        submitted_at as "submittedAt",
        reviewed_at as "reviewedAt",
        reviewer_note as "reviewerNote"
      from kyc_documents
      order by
        case when status = 'pending' then 0 else 1 end,
        submitted_at desc nulls last,
        id desc
      limit 200
    `
  );
  const docs = rows.map(mapKycDocument);
  const pending = docs.filter((doc) => doc.status === "pending");
  const reviewed = docs.filter((doc) => doc.status !== "pending");

  return {
    pending,
    reviewed,
    stats: {
      total: docs.length,
      pending: pending.length,
      approved: docs.filter((doc) => doc.status === "approved").length,
      rejected: docs.filter((doc) => doc.status === "rejected").length,
    },
  };
}

export async function approveKycDocument(
  kycId: number,
  actorId: string,
  actorName: string | null
): Promise<KycDocumentSummary> {
  const pool = poolFor("shoppay");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      `
        select
          id,
          user_id as "userId",
          full_name as "fullName",
          doc_type as "docType",
          doc_number as "docNumber",
          status,
          submitted_at as "submittedAt",
          reviewed_at as "reviewedAt",
          reviewer_note as "reviewerNote"
        from kyc_documents
        where id = $1
        for update
      `,
      [kycId]
    );
    const row = current.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("Không tìm thấy hồ sơ KYC.");

    if (row.status !== "pending" && row.status !== "approved") {
      throw new Error("Chỉ hồ sơ pending mới có thể duyệt.");
    }

    const updated = await client.query(
      `
        update kyc_documents
        set
          status = 'approved',
          reviewed_at = now(),
          reviewer_note = $2
        where id = $1
        returning
          id,
          user_id as "userId",
          full_name as "fullName",
          doc_type as "docType",
          doc_number as "docNumber",
          status,
          submitted_at as "submittedAt",
          reviewed_at as "reviewedAt",
          reviewer_note as "reviewerNote"
      `,
      [kycId, `Approved from Admin Portal by ${actorName ?? actorId}`]
    );
    const updatedDoc = mapKycDocument(updated.rows[0] as Record<string, unknown>);

    await client.query(
      `
        insert into audit_logs (actor_id, actor_name, action, resource, metadata)
        values ($1, $2, 'kyc.approve', $3, $4::jsonb)
      `,
      [
        actorId,
        actorName,
        `kyc:${kycId}`,
        JSON.stringify({
          source: "admin-portal",
          targetUserId: updatedDoc.userId,
          assignedRole: "kyc-verified",
          docType: row.docType,
        }),
      ]
    );

    await assignRealmRoleToUser(updatedDoc.userId, "kyc-verified");
    await client.query("commit");
    return updatedDoc;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectKycDocument(
  kycId: number,
  actorId: string,
  actorName: string | null,
  reason: string | null
): Promise<KycDocumentSummary> {
  const pool = poolFor("shoppay");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const updated = await client.query(
      `
        update kyc_documents
        set
          status = 'rejected',
          reviewed_at = now(),
          reviewer_note = $2
        where id = $1 and status = 'pending'
        returning
          id,
          user_id as "userId",
          full_name as "fullName",
          doc_type as "docType",
          doc_number as "docNumber",
          status,
          submitted_at as "submittedAt",
          reviewed_at as "reviewedAt",
          reviewer_note as "reviewerNote"
      `,
      [kycId, reason || `Rejected from Admin Portal by ${actorName ?? actorId}`]
    );
    const row = updated.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("Không tìm thấy hồ sơ KYC đang chờ để từ chối.");

    await client.query(
      `
        insert into audit_logs (actor_id, actor_name, action, resource, metadata)
        values ($1, $2, 'kyc.reject', $3, $4::jsonb)
      `,
      [
        actorId,
        actorName,
        `kyc:${kycId}`,
        JSON.stringify({
          source: "admin-portal",
          targetUserId: row.userId,
          reason: reason || undefined,
        }),
      ]
    );
    await client.query("commit");
    return mapKycDocument(row);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getFoodOverview(): Promise<FoodOverview> {
  const [restaurants, menuStats, orderStats, menu, orders, requests] = await Promise.all([
    query<Record<string, unknown>>(
      "ecommerce",
      `
        select distinct on (user_id)
          user_id as "userId",
          store_name as name,
          reviewed_at as "approvedAt"
        from seller_upgrade_requests
        where kind = 'food-seller' and status = 'approved'
        order by user_id, reviewed_at desc nulls last, id desc
      `
    ),
    query<{ total: string; available: string }>(
      "shopfood",
      "select count(*)::int as total, count(*) filter (where available = true)::int as available from menu_items"
    ),
    query<{ total: string; revenue: string }>(
      "shopfood",
      "select count(*)::int as total, coalesce(sum(total_vnd), 0)::int as revenue from food_orders"
    ),
    query<Record<string, unknown>>(
      "shopfood",
      `
        select id, name, price_vnd as "priceVnd", available, created_at as "createdAt"
        from menu_items
        order by created_at desc nulls last, id desc
        limit 80
      `
    ),
    query<Record<string, unknown>>(
      "shopfood",
      `
        select
          o.id,
          o.user_id as "buyerId",
          o.status,
          o.total_vnd as "totalVnd",
          o.created_at as "createdAt",
          string_agg(oi.name_snapshot || ' x' || oi.quantity::text, ', ' order by oi.id) as items
        from food_orders o
        left join food_order_items oi on oi.order_id = o.id
        group by o.id, o.user_id, o.status, o.total_vnd, o.created_at
        order by o.created_at desc nulls last, o.id desc
        limit 30
      `
    ),
    getPendingUpgradeRequests("food-seller"),
  ]);

  return {
    stats: {
      restaurants: restaurants.length,
      menuItems: num(menuStats[0]?.total),
      availableItems: num(menuStats[0]?.available),
      orders: num(orderStats[0]?.total),
      revenueVnd: num(orderStats[0]?.revenue),
    },
    restaurants: restaurants.map((row) => ({
      userId: String(row.userId ?? ""),
      name: String(row.name ?? ""),
      approvedAt: iso(row.approvedAt),
    })),
    menu: menu.map((row) => ({
      id: num(row.id),
      name: String(row.name ?? ""),
      priceVnd: num(row.priceVnd),
      available: row.available === true,
      createdAt: iso(row.createdAt),
    })),
    recentOrders: orders.map((row) => ({
      id: num(row.id),
      buyerId: String(row.buyerId ?? ""),
      status: String(row.status ?? "pending"),
      totalVnd: num(row.totalVnd),
      items: str(row.items),
      createdAt: iso(row.createdAt),
    })),
    pendingFoodSellerRequests: requests,
  };
}

async function getPendingUpgradeRequests(kind: "seller" | "food-seller"): Promise<UpgradeRequest[]> {
  const rows = await query<Record<string, unknown>>(
    "ecommerce",
    `
      select id, user_id as "userId", kind, store_name as "storeName", requested_at as "requestedAt"
      from seller_upgrade_requests
      where kind = $1 and status = 'pending'
      order by requested_at asc nulls last, id asc
    `,
    [kind]
  );

  return rows.map((row) => ({
    id: num(row.id),
    userId: String(row.userId ?? ""),
    kind: row.kind === "food-seller" ? "food-seller" : "seller",
    storeName: String(row.storeName ?? ""),
    requestedAt: iso(row.requestedAt),
  }));
}

export async function approveUpgradeRequest(
  requestId: number,
  actorId: string,
  expectedKind?: "seller" | "food-seller"
): Promise<UpgradeRequest> {
  const pool = poolFor("ecommerce");
  const client = await pool.connect();
  try {
    const requestResult = await client.query(
      `
        select id, user_id as "userId", kind, store_name as "storeName", requested_at as "requestedAt", status
        from seller_upgrade_requests
        where id = $1
        limit 1
      `,
      [requestId]
    );
    const row = requestResult.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("Không tìm thấy yêu cầu nâng quyền.");
    if (row.status !== "pending") throw new Error("Yêu cầu này không còn ở trạng thái chờ duyệt.");

    const kind = row.kind === "food-seller" ? "food-seller" : "seller";
    if (expectedKind && kind !== expectedKind) {
      throw new Error("Yêu cầu không thuộc phạm vi quản trị này.");
    }
    await assignRealmRoleToUser(String(row.userId), kind);

    await client.query("begin");
    if (kind === "seller") {
      await client.query(
        `
          insert into stores (owner_id, name)
          select $1, $2
          where not exists (select 1 from stores where owner_id = $1)
        `,
        [row.userId, row.storeName]
      );
    }
    await client.query(
      `
        update seller_upgrade_requests
        set status = 'approved', reviewed_at = now(), reviewed_by = $2
        where id = $1 and status = 'pending'
      `,
      [requestId, actorId]
    );
    await client.query("commit");

    return {
      id: num(row.id),
      userId: String(row.userId ?? ""),
      kind,
      storeName: String(row.storeName ?? ""),
      requestedAt: iso(row.requestedAt),
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectUpgradeRequest(
  requestId: number,
  actorId: string,
  reason: string | null,
  expectedKind?: "seller" | "food-seller"
): Promise<UpgradeRequest> {
  const rows = await query<Record<string, unknown>>(
    "ecommerce",
    `
      update seller_upgrade_requests
      set status = 'rejected', reviewed_at = now(), reviewed_by = $2, admin_note = $3
      where id = $1
        and status = 'pending'
        and ($4::text is null or kind = $4)
      returning id, user_id as "userId", kind, store_name as "storeName", requested_at as "requestedAt"
    `,
    [requestId, actorId, reason, expectedKind ?? null]
  );
  const row = rows[0];
  if (!row) throw new Error("Không tìm thấy yêu cầu đang chờ để từ chối.");
  const kind = row.kind === "food-seller" ? "food-seller" : "seller";
  if (expectedKind && kind !== expectedKind) {
    throw new Error("Yêu cầu không thuộc phạm vi quản trị này.");
  }
  return {
    id: num(row.id),
    userId: String(row.userId ?? ""),
    kind,
    storeName: String(row.storeName ?? ""),
    requestedAt: iso(row.requestedAt),
  };
}

const FOOD_NEXT_STEP: Record<string, string> = {
  pending: "preparing",
  preparing: "delivering",
  delivering: "completed",
};

export async function advanceFoodOrderStatus(orderId: number, actorId: string): Promise<string> {
  const pool = poolFor("shopfood");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select status from food_orders where id = $1 for update",
      [orderId]
    );
    const status = (current.rows[0] as { status?: string } | undefined)?.status;
    const next = status ? FOOD_NEXT_STEP[status] : null;
    if (!next) {
      throw new Error("Đơn hàng không có bước chuyển trạng thái hợp lệ.");
    }
    await client.query("update food_orders set status = $2 where id = $1", [orderId, next]);
    await client.query(
      `
        insert into audit_logs (actor_id, action, resource, metadata)
        values ($1, 'order.status', $2, $3::jsonb)
      `,
      [actorId, String(orderId), JSON.stringify({ status: next, source: "admin-portal" })]
    );
    await client.query("commit");
    return next;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function toggleFoodMenuAvailability(itemId: number, actorId: string): Promise<boolean> {
  const pool = poolFor("shopfood");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select available from menu_items where id = $1 for update",
      [itemId]
    );
    const available = (current.rows[0] as { available?: boolean } | undefined)?.available;
    if (available === undefined) {
      throw new Error("Không tìm thấy món ăn.");
    }
    const next = !available;
    await client.query("update menu_items set available = $2 where id = $1", [itemId, next]);
    await client.query(
      `
        insert into audit_logs (actor_id, action, resource, metadata)
        values ($1, 'menu.toggle', $2, $3::jsonb)
      `,
      [actorId, String(itemId), JSON.stringify({ available: next, source: "admin-portal" })]
    );
    await client.query("commit");
    return next;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
