import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";

// Audit log MỌI thao tác quản trị: assign/revoke role, duyệt KYC, vô hiệu hoá user...
// Admin Portal không sở hữu nghiệp vụ nào khác (user/role nằm ở Keycloak), nên đây
// là DB duy nhất của nó — chỉ để truy vết ai làm gì, khi nào, trên ai.
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name"),
  action: text("action").notNull(), // role.assign | role.revoke | kyc.grant | kyc.revoke
  resource: text("resource"), // vd user:<id>
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Cache hồ sơ admin đăng nhập (sub -> roles), giảm việc gọi Admin API và để hiển
// thị "ai đang đăng nhập". Đồng bộ từ JWT trong NextAuth jwt callback.
export const userProfile = pgTable("user_profile", {
  sub: text("sub").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  preferredUsername: text("preferred_username"),
  roles: jsonb("roles").$type<string[]>().notNull().default([]),
  groups: jsonb("groups").$type<string[]>().notNull().default([]),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
});
