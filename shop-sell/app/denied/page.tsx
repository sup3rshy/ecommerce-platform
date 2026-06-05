import Link from "next/link";

export default function DeniedPage() {
  return (
    <div>
      <h1>🚫 Không đủ quyền hạn</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        Tài khoản của bạn không có quyền truy cập khu vực này.
      </p>

      <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <Link href="/" className="btn">
          ← Về trang chủ
        </Link>
        <Link href="/api/auth/signout?callbackUrl=/" className="btn-secondary">
          Đăng nhập tài khoản khác
        </Link>
      </div>
    </div>
  );
}
