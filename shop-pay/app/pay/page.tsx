import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { verify } from "../../lib/sig";
import { getOrCreateWallet, formatVND } from "../../lib/wallet";
import { confirmPayment } from "./actions";

type PaySearch = {
  merchant?: string;
  orderId?: string;
  amount?: string;
  returnUrl?: string;
  nonce?: string;
  sig?: string;
};

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<PaySearch>;
}) {
  const session = await getServerSession(authOptions);
  const params = await searchParams;

  // 1. Verify required params
  const { merchant, orderId, amount, returnUrl, nonce, sig } = params;
  if (!merchant || !orderId || !amount || !returnUrl || !nonce || !sig) {
    return (
      <div className="card">
        <h1>Yêu cầu thanh toán không hợp lệ</h1>
        <p>Thiếu tham số. Quay lại merchant.</p>
      </div>
    );
  }

  // 2. Verify HMAC signature → chống tamper amount/orderId
  const sigOk = verify(
    { merchant, orderId, amount, returnUrl, nonce },
    sig
  );
  if (!sigOk) {
    return (
      <div className="card">
        <h1>🚫 Yêu cầu thanh toán đã bị thay đổi</h1>
        <p>HMAC không khớp. Có thể có MITM hoặc merchant cấu hình sai secret.</p>
      </div>
    );
  }

  // 3. Yêu cầu user login (proxy.ts đã chặn nhưng double-check)
  if (!session?.user?.id) {
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(
        `/pay?merchant=${merchant}&orderId=${orderId}&amount=${amount}&returnUrl=${encodeURIComponent(returnUrl)}&nonce=${nonce}&sig=${sig}`
      )}`
    );
  }

  const amountNum = parseInt(amount, 10);
  const wallet = await getOrCreateWallet(session.user.id);
  const enoughBalance = wallet.balance >= amountNum;

  return (
    <div className="card">
      <h1>Xác nhận thanh toán ShopPay</h1>
      <p className="muted">
        Merchant <code>{merchant}</code> yêu cầu thanh toán cho đơn{" "}
        <strong>#{orderId}</strong>.
      </p>

      <table style={{ marginTop: 16, width: "100%" }}>
        <tbody>
          <tr>
            <td className="muted">Số tiền:</td>
            <td style={{ textAlign: "right", fontWeight: 600, fontSize: 20 }}>
              {formatVND(amountNum)} đ
            </td>
          </tr>
          <tr>
            <td className="muted">Số dư ví:</td>
            <td style={{ textAlign: "right" }}>{formatVND(wallet.balance)} đ</td>
          </tr>
          <tr>
            <td className="muted">Sau giao dịch:</td>
            <td style={{ textAlign: "right" }}>
              {formatVND(wallet.balance - amountNum)} đ
            </td>
          </tr>
        </tbody>
      </table>

      {!enoughBalance && (
        <div className="alert-error" style={{ marginTop: 16 }}>
          Số dư không đủ. <a href="/topup">Nạp tiền</a> trước rồi quay lại.
        </div>
      )}

      <form action={confirmPayment} style={{ marginTop: 24 }}>
        <input type="hidden" name="merchant" value={merchant} />
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="amount" value={amount} />
        <input type="hidden" name="returnUrl" value={returnUrl} />
        <input type="hidden" name="nonce" value={nonce} />
        <input type="hidden" name="sig" value={sig} />
        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="submit"
            disabled={!enoughBalance}
            className="btn btn-primary"
          >
            Xác nhận thanh toán
          </button>
          <a href={returnUrl + `?orderId=${orderId}&status=cancelled`} className="btn">
            Huỷ
          </a>
        </div>
      </form>
    </div>
  );
}
