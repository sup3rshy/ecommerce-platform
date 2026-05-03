import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/route";
import Link from "next/link";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <div>
      <h1>⚡ ShopPay</h1>
      <p className="muted">
        Ví điện tử cho hệ sinh thái ecommerce. Cùng tài khoản SSO với{" "}
        <a href="http://localhost:3000" style={{ color: "#ea580c" }}>
          ecommerce
        </a>{" "}
        và{" "}
        <a href="http://localhost:3100" style={{ color: "#ea580c" }}>
          seller-workspace
        </a>
        .
      </p>

      {session?.user ? (
        <div className="alert-success" style={{ marginTop: 20 }}>
          Đã đăng nhập với <strong>{session.user.name}</strong>.{" "}
          <Link
            href="/wallet"
            style={{
              color: "#065f46",
              fontWeight: 600,
              textDecoration: "underline",
            }}
          >
            Vào ví →
          </Link>
        </div>
      ) : (
        <div className="alert-info" style={{ marginTop: 20 }}>
          Chưa đăng nhập. Bấm <strong>Đăng nhập SSO</strong> để bắt đầu.
          <br />
          <span style={{ fontSize: 13, color: "#9a3412", marginTop: 8, display: "block" }}>
            ⚠️ Tài khoản <code className="code-inline">wallet1</code> được cấu hình
            <strong> bắt buộc bật MFA (TOTP)</strong> ở lần đăng nhập đầu — minh hoạ
            chính sách bảo mật ví.
          </span>
        </div>
      )}

      <section style={{ marginTop: 24, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <Feature title="🔐 MFA bắt buộc" desc="Mọi giao dịch ví đều require TOTP — Authenticator app." />
        <Feature title="📋 KYC" desc="Xác minh giấy tờ để mở giới hạn giao dịch." />
        <Feature title="🔄 Pay across apps" desc="Thanh toán đơn hàng từ ecommerce qua SSO redirect." />
      </section>
    </div>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>{title}</h3>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {desc}
      </p>
    </div>
  );
}
