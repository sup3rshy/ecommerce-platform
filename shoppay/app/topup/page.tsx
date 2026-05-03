import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { topUp, getOrCreateWallet, formatVND } from "@/lib/wallet";

const PRESETS = [50_000, 100_000, 500_000, 1_000_000, 5_000_000];

async function doTopUp(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("unauthenticated");

  const amount = Number(formData.get("amount"));
  if (!amount || amount <= 0) return;
  if (amount > 50_000_000) throw new Error("amount too large");

  await topUp({
    userId: session.user.id,
    amount,
    description: "Nạp tiền qua mock gateway",
  });

  revalidatePath("/wallet");
  revalidatePath("/topup");
  redirect("/wallet");
}

export default async function TopUpPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin");

  const wallet = await getOrCreateWallet(session.user.id);

  return (
    <div>
      <h1>Nạp tiền vào ví</h1>
      <p className="muted">
        Số dư hiện tại: <strong>{formatVND(wallet.balance)} VND</strong>. Đây
        là gateway giả lập — production sẽ tích hợp Momo / VNPay / ZaloPay.
      </p>

      <section className="card">
        <form action={doTopUp} style={{ display: "grid", gap: 14 }}>
          <div>
            <label
              htmlFor="amount"
              style={{ display: "block", marginBottom: 6, fontSize: 14, color: "#78716c" }}
            >
              Số tiền (VND)
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              min="10000"
              max="50000000"
              step="10000"
              required
              defaultValue={100000}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="submit"
                name="amount"
                value={p}
                className="btn"
              >
                +{formatVND(p)}
              </button>
            ))}
          </div>

          <button type="submit" className="btn btn-primary">
            Xác nhận nạp tiền
          </button>
        </form>
      </section>

      <div className="alert-warn">
        🔐 Trong production: bước này sẽ require <strong>OTP / TOTP</strong> trước khi
        ghi nhận giao dịch. Hiện đang demo flow chính, MFA enforcement nằm ở
        Keycloak login (user <code className="code-inline">wallet1</code>).
      </div>
    </div>
  );
}
