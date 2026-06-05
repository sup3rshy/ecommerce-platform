import Link from "next/link";

export default function Denied() {
  return (
    <div className="card">
      <h1>Truy cập bị từ chối</h1>
      <p className="muted">
        Bạn không có quyền truy cập khu vực này. Admin Portal yêu cầu role admin nền
        tảng (<code>admin</code>, <code>ecommerce_admin</code>,{" "}
        <code>food_admin</code>, <code>pay_admin</code>). Việc duyệt KYC còn yêu cầu
        thêm <code>admin</code> hoặc <code>pay_admin</code>.
      </p>
      <p style={{ marginTop: 12 }}>
        <Link href="/" className="btn">
          Về trang chủ
        </Link>
      </p>
    </div>
  );
}
