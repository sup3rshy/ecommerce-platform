import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { wallets, transactions } from "@/db/schema";

export async function getOrCreateWallet(userId: string) {
  const existing = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  if (existing.length) return existing[0];

  const [created] = await db
    .insert(wallets)
    .values({ userId, currency: "VND", balance: 0 })
    .returning();
  return created;
}

export async function topUp(params: {
  userId: string;
  amount: number;
  description?: string;
}) {
  if (params.amount <= 0) throw new Error("amount must be positive");
  const wallet = await getOrCreateWallet(params.userId);

  await db.transaction(async (tx) => {
    await tx
      .update(wallets)
      .set({ balance: sql`${wallets.balance} + ${params.amount}` })
      .where(eq(wallets.id, wallet.id));
    await tx.insert(transactions).values({
      walletId: wallet.id,
      type: "topup",
      amount: params.amount,
      status: "completed",
      description: params.description ?? "Nạp tiền (mock)",
    });
  });
}

export async function pay(params: {
  userId: string;
  amount: number;
  description?: string;
  externalRef?: string;
}) {
  if (params.amount <= 0) throw new Error("amount must be positive");
  const wallet = await getOrCreateWallet(params.userId);
  if (wallet.balance < params.amount) throw new Error("insufficient balance");

  await db.transaction(async (tx) => {
    await tx
      .update(wallets)
      .set({ balance: sql`${wallets.balance} - ${params.amount}` })
      .where(eq(wallets.id, wallet.id));
    await tx.insert(transactions).values({
      walletId: wallet.id,
      type: "pay",
      amount: params.amount,
      status: "completed",
      externalRef: params.externalRef,
      description: params.description ?? "Thanh toán",
    });
  });
}

export function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}
