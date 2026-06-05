import Link from "next/link";

export default function DeniedPage() {
  return (
    <div className="card">
      <h1>Không có quyền truy cập</h1>
      <p className="muted">
        Tài khoản của bạn không có vai trò phù hợp để vào khu vực này. Khu quản trị
        ShopFood yêu cầu vai trò <code className="code-inline">food_admin</code>.
      </p>
      <Link href="/" className="btn" style={{ marginTop: 12, display: "inline-block" }}>
        Về thực đơn
      </Link>
    </div>
  );
}
