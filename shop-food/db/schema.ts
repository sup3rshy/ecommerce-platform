// ShopFood schema — DB độc lập `shopfood` (xem scripts/init-app-dbs.sql).
// Phase 2: menu (food_admin quản lý) + giỏ + đơn món (buyer) + cache user + audit.
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// Món ăn trong thực đơn. food_admin tạo/sửa/ẩn; buyer chỉ xem món `available`.
export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  priceVnd: integer("price_vnd").notNull(),
  imageUrl: text("image_url"),
  available: boolean("available").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Cache user data từ Keycloak (đồng bộ ở jwt callback lúc login). Giảm gọi Admin API.
export const userProfile = pgTable("user_profile", {
  sub: text("sub").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  preferredUsername: text("preferred_username"),
  roles: jsonb("roles").$type<string[]>().notNull().default([]),
  groups: jsonb("groups").$type<string[]>().notNull().default([]),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
});

// Giỏ hàng của buyer (1 dòng / món). userId = Keycloak sub.
export const cartItems = pgTable(
  "food_cart_items",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    menuItemId: integer("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userItemUnique: uniqueIndex("food_cart_user_item_unique").on(
      table.userId,
      table.menuItemId
    ),
    userIdIdx: index("food_cart_user_id_idx").on(table.userId),
  })
);

// Đơn đặt món. Vòng đời: pending -> preparing -> delivering -> completed.
// pending có thể chuyển sang cancelled (buyer huỷ khi còn pending).
export const orders = pgTable(
  "food_orders",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    status: text("status").notNull().default("pending"),
    totalVnd: integer("total_vnd").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdIdx: index("food_orders_user_id_idx").on(table.userId),
  })
);

// Dòng món trong đơn. Snapshot tên + giá lúc đặt (đơn không đổi khi menu sửa sau).
export const orderItems = pgTable(
  "food_order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    menuItemId: integer("menu_item_id").references(() => menuItems.id, {
      onDelete: "set null",
    }),
    nameSnapshot: text("name_snapshot").notNull(),
    unitPriceVnd: integer("unit_price_vnd").notNull(),
    quantity: integer("quantity").notNull().default(1),
  },
  (table) => ({
    orderIdIdx: index("food_order_items_order_id_idx").on(table.orderId),
  })
);

// Audit mọi thao tác nhạy cảm: đặt đơn, đổi trạng thái, sửa menu.
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  resource: text("resource"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
