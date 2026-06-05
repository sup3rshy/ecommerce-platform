import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// === Phase 1: ShopSell là SOURCE OF TRUTH cho catalog ===
// Người bán quản lý sản phẩm ở đây; mỗi thay đổi được ký HMAC (CATALOG_SYNC_SECRET)
// và đẩy sang ShopEcommerce qua /api/internal/catalog/*. Xem PLAN.md Phase 1.
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    // sellerId = Keycloak sub của chủ shop (đồng nhất với owner_id bên ShopEcommerce).
    sellerId: text("seller_id").notNull(),
    // sku do người bán đặt (hoặc auto-gen). Khoá đồng bộ idempotent là (sellerId, sku).
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    priceVnd: integer("price_vnd").notNull(),
    stock: integer("stock").notNull().default(0),
    // active | hidden. "deleted" KHÔNG lưu ở đây (xoá hẳn record); chỉ gửi sự kiện delete.
    status: text("status").notNull().default("active"),
    description: text("description"),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sellerSkuUnique: uniqueIndex("products_seller_sku_unique").on(
      table.sellerId,
      table.sku
    ),
    sellerIdIdx: index("products_seller_id_idx").on(table.sellerId),
  })
);

// Outbox đảm bảo đồng bộ tin cậy: ghi sự kiện trước, gửi sau. Nếu mạng lỗi,
// row ở trạng thái pending/failed và được flushOutbox() gửi lại (xem lib/catalogSync.ts).
export const catalogOutbox = pgTable(
  "catalog_outbox",
  {
    id: serial("id").primaryKey(),
    eventType: text("event_type").notNull(), // upsert | delete
    sellerId: text("seller_id").notNull(),
    sku: text("sku").notNull(),
    // payload đã chuẩn hoá (chính là data được ký) — resend giữ nguyên chữ ký.
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"), // pending | sent | failed
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    sentAt: timestamp("sent_at"),
  },
  (table) => ({
    statusIdx: index("catalog_outbox_status_idx").on(table.status),
  })
);

export const staffInvitations = pgTable(
  "staff_invitations",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("pending"),
    invitedBy: text("invited_by").notNull(),
    invitedAt: timestamp("invited_at").defaultNow(),
    acceptedAt: timestamp("accepted_at"),
    acceptedBy: text("accepted_by"),
  },
  (table) => ({
    uniqueStoreEmail: uniqueIndex("staff_invitations_store_email_unique").on(
      table.storeId,
      table.email
    ),
  })
);

export const storePermissions = pgTable(
  "store_permissions",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    grantedBy: text("granted_by").notNull(),
    grantedAt: timestamp("granted_at").defaultNow(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => ({
    uniqueStoreUser: uniqueIndex("store_permissions_store_user_unique").on(
      table.storeId,
      table.userId
    ),
  })
);

// Cache user data từ Keycloak để khỏi gọi Admin API mỗi request.
// Sync mỗi lần user login (jwt callback). Đây không phải nguồn truth — chỉ là cache.
export const userProfile = pgTable("user_profile", {
  sub: text("sub").primaryKey(), // Keycloak user id (subject claim)
  email: text("email").notNull(),
  name: text("name"),
  preferredUsername: text("preferred_username"),
  roles: jsonb("roles").$type<string[]>().notNull().default([]),
  groups: jsonb("groups").$type<string[]>().notNull().default([]),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id"),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  resource: text("resource"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});
