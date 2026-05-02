import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/route";
import Link from "next/link";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <div>
      <h1>Seller Workspace</h1>
      <p className="muted">
        Back-office cho chủ shop và nhân viên — dùng chung tài khoản SSO với
        ecommerce platform.
      </p>

      {session?.user ? (
        <div className="alert-success" style={{ marginTop: 20 }}>
          <p style={{ margin: 0 }}>
            Đã đăng nhập với <strong>{session.user.name}</strong>. Roles:{" "}
            <code className="code-inline">
              {session.user.roles?.join(", ") || "none"}
            </code>
          </p>
          <Link href="/dashboard" className="btn-success">
            Vào Dashboard →
          </Link>
        </div>
      ) : (
        <div className="alert-info" style={{ marginTop: 20 }}>
          Bạn chưa đăng nhập. Bấm <strong>Đăng nhập SSO</strong> ở góc trên để
          login bằng Keycloak.
        </div>
      )}

      <section className="grid-3" style={{ marginTop: 24 }}>
        <FeatureCard
          title="Quản lý shop"
          desc="Tạo shop, duyệt sản phẩm, theo dõi đơn hàng."
        />
        <FeatureCard
          title="Nhân viên"
          desc="Mời nhân viên kho / CSKH / kế toán theo Keycloak Group."
        />
        <FeatureCard
          title="Audit log"
          desc="Mọi thao tác đều được ghi lại — ai làm gì, khi nào."
        />
      </section>
    </div>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{title}</h3>
      <p className="muted" style={{ margin: 0 }}>
        {desc}
      </p>
    </div>
  );
}
