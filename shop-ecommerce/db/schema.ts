import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";

// Cache user data từ Keycloak (xem todo 3.1)
export const userProfile = pgTable("user_profile", {
  sub: text("sub").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  preferredUsername: text("preferred_username"),
  roles: jsonb("roles").$type<string[]>().notNull().default([]),
  groups: jsonb("groups").$type<string[]>().notNull().default([]),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
});

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Phase 1: products là BẢN SAO ĐỌC (read-copy) đồng bộ từ ShopSell.
// ShopEcommerce KHÔNG sửa catalog trực tiếp — chỉ ghi qua /api/internal/catalog/*
// (verify HMAC CATALOG_SYNC_SECRET). Khoá idempotent: (sellerId, sku).
// `stock` do người bán quyết định (đồng bộ từ ShopSell); decrement lúc mua là
// trạng thái runtime local, sẽ bị ghi đè ở lần sync tiếp theo (trade-off demo).
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // Keycloak sub của người bán (đồng nhất với stores.ownerId). Denormalize để
    // upsert theo (sellerId, sku) không cần join.
    sellerId: text("seller_id").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    price: integer("price").notNull(),
    stock: integer("stock").notNull().default(0),
    // active = hiển thị; hidden = người bán ẩn; deleted = người bán xoá (đều ẩn khỏi storefront).
    status: text("status").notNull().default("active"),
    description: text("description"),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("products_store_id_idx").on(table.storeId),
    sellerSkuUnique: uniqueIndex("products_seller_sku_unique").on(
      table.sellerId,
      table.sku
    ),
  })
);

// Yêu cầu nâng quyền self-service từ buyer. `kind` phân biệt:
//   - "seller"      -> nâng lên chủ shop ShopSell (tạo record stores, storeName = tên shop)
//   - "food-seller" -> nâng lên chủ nhà hàng ShopFood (không tạo stores, storeName = tên nhà hàng)
export const sellerUpgradeRequests = pgTable("seller_upgrade_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull().default("seller"),
  storeName: text("store_name").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  adminNote: text("admin_note"),
  requestedAt: timestamp("requested_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: integer("unit_price").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdIdx: index("orders_user_id_idx").on(table.userId),
    productIdIdx: index("orders_product_id_idx").on(table.productId),
  })
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userProductUnique: uniqueIndex("cart_user_product_unique").on(table.userId, table.productId),
    userIdIdx: index("cart_items_user_id_idx").on(table.userId),
  })
);