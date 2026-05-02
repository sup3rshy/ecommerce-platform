import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../api/auth/[...nextauth]/route";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  seller: "Chủ shop — toàn quyền trên shop của mình",
  "staff-warehouse": "Nhân viên kho — quản lý tồn kho, vận đơn",
  "staff-cs": "Nhân viên CSKH — chat, hỗ trợ khách",
  "staff-finance": "Nhân viên tài chính — xem báo cáo doanh thu",
  admin: "Quản trị viên platform",
};

export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin");

  const roles = session.user.roles ?? [];
  const groups = session.user.groups ?? [];
  const relevantRoles = roles.filter((r) => r in ROLE_DESCRIPTIONS);

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="muted">Thông tin user lấy từ Keycloak (ID Token claims).</p>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Identity</h2>
        <dl className="kv">
          <dt>Sub</dt>
          <dd><code className="code-inline">{session.user.id}</code></dd>
          <dt>Tên</dt>
          <dd>{session.user.name}</dd>
          <dt>Email</dt>
          <dd>{session.user.email}</dd>
        </dl>
      </section>

      <section className="card">
        <h2>Quyền của bạn</h2>
        {relevantRoles.length === 0 ? (
          <div className="alert-warn">
            Bạn không có role phù hợp với Seller Workspace. Liên hệ chủ shop
            để được mời.
          </div>
        ) : (
          <ul className="role-list">
            {relevantRoles.map((r) => (
              <li key={r}>
                <code className="code-inline">{r}</code>
                <span className="muted">{ROLE_DESCRIPTIONS[r]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Shop / Group</h2>
        {groups.length === 0 ? (
          <p className="muted">
            Không thuộc group nào. (Cần bật <code>groups</code> mapper trong
            Keycloak client scope.)
          </p>
        ) : (
          <ul className="role-list">
            {groups.map((g) => (
              <li key={g}>
                <code className="code-inline">{g}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
