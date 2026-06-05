"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { verify, sign } from "../../lib/sig";
import { pay } from "../../lib/wallet";
import { db } from "../../db";
import { transactions } from "../../db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "../../lib/audit";

/**
 * Server action confirm payment. Đầu vào:
 *   merchant, orderId, amount, returnUrl, nonce, sig (verify HMAC lại 1 lần
 *   nữa để chống bypass khi user fiddle với form).
 *
 * Sau khi trừ ví thành công → redirect về returnUrl với:
 *   ?orderId=X&status=success&txnId=Y&sig=<HMAC>
 *
 * Web-app verify sig đó để chắc thông báo success thật sự đến từ shoppay.
 */
export async function confirmPayment(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("not authenticated");

  const merchant = String(formData.get("merchant") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const returnUrl = String(formData.get("returnUrl") ?? "");
  const nonce = String(formData.get("nonce") ?? "");
  const sig = String(formData.get("sig") ?? "");

  // Re-verify request sig (chống user sửa amount trong DOM)
  if (!verify({ merchant, orderId, amount, returnUrl, nonce }, sig)) {
    throw new Error("invalid request signature");
  }

  const amountNum = parseInt(amount, 10);
  if (Number.isNaN(amountNum) || amountNum <= 0) {
    throw new Error("invalid amount");
  }

  // Idempotency: nếu đã có txn cho externalRef = `${merchant}:${orderId}`,
  // không trừ lần 2 — chống user reload form sau khi đã pay.
  const externalRef = `${merchant}:${orderId}`;
  const existing = await db
    .select()
    .from(transactions)
    .where(eq(transactions.externalRef, externalRef))
    .limit(1);

  let txnId: number;
  if (existing.length > 0) {
    txnId = existing[0].id;
  } else {
    await pay({
      userId: session.user.id,
      amount: amountNum,
      description: `Thanh toán ${merchant} đơn #${orderId}`,
      externalRef,
    });
    const [created] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.externalRef, externalRef))
      .limit(1);
    txnId = created.id;
  }

  await logAudit({
    actorId: session.user.id,
    actorName: session.user.name,
    action: "wallet.pay",
    resource: externalRef,
    metadata: { merchant, orderId, amount: amountNum, txnId },
  });

  // Build return URL với HMAC trên (orderId, status, txnId)
  const returnSig = sign({ orderId, status: "success", txnId });
  const url = new URL(returnUrl);
  url.searchParams.set("orderId", orderId);
  url.searchParams.set("status", "success");
  url.searchParams.set("txnId", String(txnId));
  url.searchParams.set("sig", returnSig);

  redirect(url.toString());
}
