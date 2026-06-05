import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { getKeycloakUsersWithRoles } from "../../lib/keycloakAdmin";
import { canReviewKyc } from "../../lib/scope";
import { grantKyc, revokeKyc } from "./actions";

export const dynamic = "force-dynamic";

const KYC_ROLE = "kyc-verified";

export default async function KycPage() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles ?? [];

  if (!canReviewKyc(roles)) {
    return (
      <div className="card">
        <h1>Duyệt KYC</h1>
        <p className="muted">
          Cần role <code>admin</code> hoặc <code>pay_admin</code> để duyệt KYC.
        </p>
      </div>
    );
  }

  const users = await getKeycloakUsersWithRoles(200);
  const verified = users.filter((u) => u.roles.includes(KYC_ROLE));
  const notVerified = users.filter((u) => !u.roles.includes(KYC_ROLE));

  return (
    <>
      <div className="card">
        <h1>Duyệt KYC</h1>
        <p className="muted">
          Quản lý role <code>kyc-verified</code> (mở khoá topup/giao dịch giá trị cao
          ở ShopPay). Review tài liệu CCCD/passport vẫn nằm ở ShopPay tại{" "}
          <code>/kyc/admin</code>; tại đây chỉ gán/thu hồi role.
        </p>
        <div className="alert-info" style={{ marginTop: 12 }}>
          Token là snapshot: sau khi gán <code>kyc-verified</code>, user phải đăng
          nhập lại để token mới chứa role.
        </div>
      </div>

      <div className="card">
        <h2>Chưa verified ({notVerified.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Họ tên / Email</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {notVerified.map((u) => (
              <tr key={u.id}>
                <td>
                  <code className="code-inline">{u.username ?? u.id.slice(0, 8)}</code>
                </td>
                <td>
                  {u.fullName ?? <span className="muted">—</span>}
                  <div className="muted">{u.email ?? ""}</div>
                </td>
                <td>
                  <form action={grantKyc} className="inline-form">
                    <input type="hidden" name="userId" value={u.id} />
                    <button type="submit" className="btn btn-sm btn-primary">
                      Duyệt (gán kyc-verified)
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Đã verified ({verified.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Họ tên / Email</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {verified.map((u) => (
              <tr key={u.id}>
                <td>
                  <code className="code-inline">{u.username ?? u.id.slice(0, 8)}</code>
                </td>
                <td>
                  {u.fullName ?? <span className="muted">—</span>}
                  <div className="muted">{u.email ?? ""}</div>
                </td>
                <td>
                  <form action={revokeKyc} className="inline-form">
                    <input type="hidden" name="userId" value={u.id} />
                    <button type="submit" className="btn btn-sm btn-danger">
                      Thu hồi
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
