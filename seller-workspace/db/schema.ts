import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id"),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  resource: text("resource"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});
