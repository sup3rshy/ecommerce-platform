import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { db } from "@/db";
import { transactions, kycDocuments } from "@/db/schema";
import { getOrCreateWallet, formatVND } from "@/lib/wallet";

export default async function WalletPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin");

  const wallet = await getOrCreateWallet(session.user.id);
  const txs = await db
    .select()
    .from(transactions)
    .where(eq(transactions.walletId, wallet.id))
    .orderBy(desc(transactions.createdAt))
    .limit(20);
  const kyc = await db
    .select()
    .from(kycDocuments)
    .where(eq(kycDocuments.userId, session.user.id))
    .limit(1);

  return (
    <div>
      <h1>Ví của tôi</h1>

      <section className="card" style={{ background: "linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)" }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Số dư khả dụng
        </p>
        <div className="balance">
          {formatVND(wallet.balance)}
          <span className="currency">{wallet.currency}</span>
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: "#78716c" }}>
          KYC:{" "}
          {kyc[0] ? (
            <code className="code-inline">{kyc[0].status}</code>
          ) : (
            <code className="code-inline">chưa nộp</code>
          )}
          {" · "}
          Limit/giao dịch:{" "}
          <strong>
            {kyc[0]?.status === "approved"
              ? "không giới hạn"
              : "5,000,000 VND"}
          </strong>
        </div>
      </section>

      <section className="card">
        <h2>20 giao dịch gần nhất</h2>
        {txs.length === 0 ? (
          <p className="muted">
            Chưa có giao dịch. <a href="/topup" style={{ color: "#ea580c", textDecoration: "underline" }}>Nạp tiền</a> để bắt đầu.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Loại</th>
                <th>Số tiền</th>
                <th>Mô tả</th>
                <th>Ref</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id}>
                  <td>{t.createdAt?.toLocaleString("vi-VN") ?? "-"}</td>
                  <td>
                    <code className="code-inline">{t.type}</code>
                  </td>
                  <td
                    className={
                      t.type === "topup" || t.type === "refund"
                        ? "tx-amount-pos"
                        : "tx-amount-neg"
                    }
                  >
                    {t.type === "topup" || t.type === "refund" ? "+" : "−"}
                    {formatVND(t.amount)}
                  </td>
                  <td>{t.description ?? "-"}</td>
                  <td style={{ fontSize: 12, color: "#78716c" }}>
                    {t.externalRef ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
