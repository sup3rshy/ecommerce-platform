import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { verify } from "../../../lib/sig";
import { db } from "../../../db";
import { orders } from "../../../db/schema";

/**
 * Callback từ ShopPay sau khi user xác nhận thanh toán.
 * URL: /payment/return?orderId=X&status=success&txnId=Y&sig=Z
 *
 * Verify sig trước khi tin gì cả — không thì user có thể bịa URL gọi thẳng
 * vào đây để "tự duyệt" đơn hàng.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const sp = req.nextUrl.searchParams;
  const orderId = sp.get("orderId");
  const status = sp.get("status");
  const txnId = sp.get("txnId");
  const sig = sp.get("sig");

  if (status === "cancelled") {
    return NextResponse.redirect(
      new URL(`/orders?payment=cancelled`, req.url)
    );
  }

  if (!orderId || !status || !txnId || !sig) {
    return NextResponse.redirect(
      new URL(`/orders?payment=error&reason=missing`, req.url)
    );
  }

  const sigOk = verify({ orderId, status, txnId }, sig);
  if (!sigOk) {
    return NextResponse.redirect(
      new URL(`/orders?payment=error&reason=bad_sig`, req.url)
    );
  }

  if (status === "success") {
    // Mark order as shipping (= đã thanh toán, chuyển sang đang giao).
    // Chỉ update đơn của chính user → tránh user A bịa orderId của user B.
    await db
      .update(orders)
      .set({ status: "shipping" })
      .where(
        and(
          eq(orders.id, parseInt(orderId, 10)),
          eq(orders.userId, session.user.id)
        )
      );
    return NextResponse.redirect(
      new URL(`/orders?payment=success&txnId=${txnId}`, req.url)
    );
  }

  return NextResponse.redirect(
    new URL(`/orders?payment=failed`, req.url)
  );
}
