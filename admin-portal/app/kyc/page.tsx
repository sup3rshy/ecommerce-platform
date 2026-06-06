import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/authOptions";
import { getKeycloakUsersWithRoles } from "../../lib/keycloakAdmin";
import { getKycOverview, type KycDocumentSummary } from "../../lib/platformData";
import { canReviewKyc } from "../../lib/scope";
import { approveKycRequest, grantKyc, rejectKycRequest, revokeKyc } from "./actions";

export const dynamic = "force-dynamic";

const KYC_ROLE = "kyc-verified";

const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Bị từ chối",
};

function fmt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN");
}

function statusClass(status: string): string {
  if (status === "approved") return "badge badge-kyc";
  if (status === "rejected") return "badge badge-muted";
  return "badge badge-admin";
}

function maskDocNumber(docNumber: string): string {
  if (docNumber.length <= 4) return docNumber;
  return `${"*".repeat(Math.max(docNumber.length - 4, 0))}${docNumber.slice(-4)}`;
}

function isManualKycCandidate(
  user: Awaited<ReturnType<typeof getKeycloakUsersWithRoles>>[number]
): boolean {
  const roles = user.effectiveRoles;
  const isPlatformAdmin = roles.includes("admin") || roles.some((role) => role.endsWith("_admin"));
  return !isPlatformAdmin && !roles.includes(KYC_ROLE) && roles.includes("buyer");
}

function UserCell({
  user,
  fallbackUserId,
}: {
  user:
    | Awaited<ReturnType<typeof getKeycloakUsersWithRoles>>[number]
    | undefined;
  fallbackUserId: string;
}) {
  if (!user) {
    return <code className="code-inline">{fallbackUserId}</code>;
  }
  return (
    <>
      <code className="code-inline">{user.username ?? user.id.slice(0, 8)}</code>
      <div className="muted">{user.fullName ?? user.email ?? user.id}</div>
    </>
  );
}

function KycDocumentRows({
  docs,
  usersById,
}: {
  docs: KycDocumentSummary[];
  usersById: Map<string, Awaited<ReturnType<typeof getKeycloakUsersWithRoles>>[number]>;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>User</th>
          <th>Hồ sơ</th>
          <th>Trạng thái</th>
          <th>Nộp lúc</th>
          <th>Thao tác</th>
        </tr>
      </thead>
      <tbody>
        {docs.length === 0 && (
          <tr>
            <td colSpan={5} className="muted">
              Không có hồ sơ nào.
            </td>
          </tr>
        )}
        {docs.map((doc) => {
          const user = usersById.get(doc.userId);
          const hasKycRole = user?.effectiveRoles.includes(KYC_ROLE) ?? false;
          return (
            <tr key={doc.id}>
              <td>
                <UserCell user={user} fallbackUserId={doc.userId} />
              </td>
              <td>
                <strong>{doc.fullName}</strong>
                <div className="muted">
                  <code className="code-inline">{doc.docType}</code>{" "}
                  <code className="code-inline">{maskDocNumber(doc.docNumber)}</code>
                </div>
                {doc.reviewerNote && (
                  <div className="muted">Ghi chú: {doc.reviewerNote}</div>
                )}
              </td>
              <td>
                <span className={statusClass(doc.status)}>
                  {STATUS_LABEL[doc.status] ?? doc.status}
                </span>
                {hasKycRole && (
                  <span className="badge badge-kyc" title="User đang có role kyc-verified">
                    role đã có
                  </span>
                )}
              </td>
              <td>{fmt(doc.submittedAt)}</td>
              <td>
                {doc.status === "pending" ? (
                  <div className="row-actions">
                    <form action={approveKycRequest} className="inline-form">
                      <input type="hidden" name="kycId" value={doc.id} />
                      <button type="submit" className="btn btn-sm btn-primary">
                        Duyệt + gán role
                      </button>
                    </form>
                    <form action={rejectKycRequest} className="inline-form">
                      <input type="hidden" name="kycId" value={doc.id} />
                      <input name="reason" placeholder="Lý do từ chối" />
                      <button type="submit" className="btn btn-sm">
                        Từ chối
                      </button>
                    </form>
                  </div>
                ) : (
                  <span className="muted">Đã xử lý {fmt(doc.reviewedAt)}</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

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

  const [users, kycOverview] = await Promise.all([
    getKeycloakUsersWithRoles(200),
    getKycOverview(),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const verified = users.filter((u) => u.effectiveRoles.includes(KYC_ROLE));
  const notVerified = users.filter(isManualKycCandidate);

  return (
    <>
      <div className="card">
        <h1>Duyệt KYC</h1>
        <p className="muted">
          Hàng đợi lấy từ DB <code>shoppay.kyc_documents</code>. Khi duyệt, Admin
          Portal cập nhật trạng thái hồ sơ và gán role <code>kyc-verified</code> qua
          Keycloak Admin API.
        </p>
        <div className="alert-info" style={{ marginTop: 12 }}>
          Token là snapshot: sau khi gán <code>kyc-verified</code>, user phải đăng
          nhập lại để token mới chứa role.
        </div>
      </div>

      <div className="card">
        <h2>Hồ sơ chờ duyệt ({kycOverview.pending.length})</h2>
        <KycDocumentRows docs={kycOverview.pending} usersById={usersById} />
      </div>

      <div className="card">
        <h2>Đã xử lý ({kycOverview.reviewed.length})</h2>
        <KycDocumentRows docs={kycOverview.reviewed} usersById={usersById} />
      </div>

      <div className="card">
        <h2>Gán role thủ công ({notVerified.length})</h2>
        <p className="muted">
          Dùng khi cần sửa ngoại lệ Keycloak. Luồng chuẩn vẫn là duyệt hồ sơ ShopPay ở
          phía trên để DB và role đồng bộ.
        </p>
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
        <h2>Đã có role kyc-verified ({verified.length})</h2>
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
