import {
  pgTable,
  serial,
  text,
  integer,
  bigint,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const wallets = pgTable(
  "wallets",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    currency: text("currency").notNull().default("VND"),
    balance: bigint("balance", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    uniqueUserCurrency: uniqueIndex("wallets_user_currency_unique").on(
      table.userId,
      table.currency
    ),
  })
);

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id")
    .notNull()
    .references(() => wallets.id),
  type: text("type").notNull(), // topup | pay | refund
  amount: bigint("amount", { mode: "number" }).notNull(),
  status: text("status").notNull().default("completed"),
  externalRef: text("external_ref"),
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const kycDocuments = pgTable("kyc_documents", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  fullName: text("full_name").notNull(),
  docType: text("doc_type").notNull(), // cccd | passport
  docNumber: text("doc_number").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  submittedAt: timestamp("submitted_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewerNote: text("reviewer_note"),
});
