import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { db } from "@/db";
import { kycDocuments } from "@/db/schema";
import { approveKyc, rejectKyc } from "./actions";

const REVIEWER_ROLES = ["admin", "staff-finance"];

const STATUS_BADGE: Record<string, [string, string]> = {
  pending: ["Chờ duyệt", "#92400e"],
  approved: ["Đã duyệt", "#065f46"],
  rejected: ["Bị từ chối", "#991b1b"],
};

export default async function KycAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin?callbackUrl=/kyc/admin");

  const roles = session.user.roles ?? [];
  const canReview = roles.some((r) => REVIEWER_ROLES.includes(r));
  if (!canReview) {
    return (
      <div>
        <h1>🚫 Không đủ quyền</h1>
        <p className="muted">
          Chỉ user có role <code className="code-inline">admin</code> hoặc{" "}
          <code className="code-inline">staff-finance</code> mới review được KYC.
        </p>
      </div>
    );
  }

  const submissions = await db
    .select()
    .from(kycDocuments)
    .orderBy(desc(kycDocuments.submittedAt))
    .limit(100);

  const pending = submissions.filter((s) => s.status === "pending");
  const reviewed = submissions.filter((s) => s.status !== "pending");

  return (
    <div>
      <h1>KYC Review</h1>
      <p className="muted">
        Reviewer: <strong>{session.user.name}</strong> (
        {roles.filter((r) => REVIEWER_ROLES.includes(r)).join(", ")})
      </p>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Chờ duyệt ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="muted">Không có hồ sơ nào.</p>
        ) : (
          <ul style={{ display: "grid", gap: 12, padding: 0, listStyle: "none" }}>
            {pending.map((doc) => (
              <li
                key={doc.id}
                className="card"
                style={{ padding: 12, borderColor: "#fcd34d" }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "140px 1fr",
                    gap: "4px 12px",
                    fontSize: 14,
                  }}
                >
                  <span className="muted">User ID</span>
                  <code className="code-inline">{doc.userId}</code>
                  <span className="muted">Họ tên</span>
                  <span>{doc.fullName}</span>
                  <span className="muted">Loại</span>
                  <code className="code-inline">{doc.docType}</code>
                  <span className="muted">Số</span>
                  <code className="code-inline">{doc.docNumber}</code>
                  <span className="muted">Nộp lúc</span>
                  <span>{doc.submittedAt?.toLocaleString("vi-VN") ?? "-"}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <form action={approveKyc}>
                    <input type="hidden" name="kycId" value={doc.id} />
                    <button className="btn btn-primary" type="submit">
                      ✓ Approve + cấp role kyc-verified
                    </button>
                  </form>
                  <form
                    action={rejectKyc}
                    style={{ display: "flex", gap: 8, flex: 1 }}
                  >
                    <input type="hidden" name="kycId" value={doc.id} />
                    <input
                      name="note"
                      placeholder="Lý do reject (optional)"
                      style={{ flex: 1 }}
                    />
                    <button className="btn" type="submit">
                      ✗ Reject
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Đã review ({reviewed.length})</h2>
        {reviewed.length === 0 ? (
          <p className="muted">Chưa có.</p>
        ) : (
          <table style={{ width: "100%", fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>User</th>
                <th style={{ textAlign: "left" }}>Status</th>
                <th style={{ textAlign: "left" }}>Reviewed</th>
                <th style={{ textAlign: "left" }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {reviewed.map((doc) => {
                const [label, color] = STATUS_BADGE[doc.status] ?? [doc.status, ""];
                return (
                  <tr key={doc.id}>
                    <td>{doc.fullName}</td>
                    <td style={{ color }}>
                      <strong>{label}</strong>
                    </td>
                    <td>{doc.reviewedAt?.toLocaleString("vi-VN") ?? "-"}</td>
                    <td className="muted">{doc.reviewerNote ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="alert-info" style={{ marginTop: 16 }}>
        💡 Approve flow: server action call{" "}
        <code className="code-inline">backend-admin-client</code> token endpoint
        (client_credentials grant) → POST{" "}
        <code className="code-inline">
          /admin/realms/ecommerce-realm/users/{"{userId}"}/role-mappings/realm
        </code>{" "}
        gán role <code className="code-inline">kyc-verified</code>. User cần
        logout/login lại để JWT có role mới.
      </div>
    </div>
  );
}
