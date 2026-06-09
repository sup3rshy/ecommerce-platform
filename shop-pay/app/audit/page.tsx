import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { authOptions } from "@/lib/authOptions";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

const VIEWER_ROLES = ["admin", "pay_admin"];

const ACTION_BADGE: Record<string, string> = {
  "wallet.topup": "#0369a1",
  "wallet.pay": "#9333ea",
  "kyc.approve": "#065f46",
  "kyc.reject": "#991b1b",
};

export default async function AuditPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/sso?callbackUrl=/audit");

  const roles = session.user.roles ?? [];
  if (!roles.some((r) => VIEWER_ROLES.includes(r))) {
    return (
      <div>
        <h1>🚫 Không đủ quyền</h1>
        <p className="muted">
          Audit log chỉ hiển thị cho user có role{" "}
          <code className="code-inline">admin</code> hoặc{" "}
          <code className="code-inline">pay_admin</code>.
        </p>
      </div>
    );
  }

  const logs = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);

  return (
    <div>
      <h1>Audit log</h1>
      <p className="muted">
        Mọi action nhạy cảm (topup, pay, kyc.approve, ...) được ghi tại đây cho compliance.
      </p>

      <table style={{ width: "100%", fontSize: 13, marginTop: 16 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
            <th style={{ padding: "8px 4px" }}>Thời gian</th>
            <th style={{ padding: "8px 4px" }}>Action</th>
            <th style={{ padding: "8px 4px" }}>Actor</th>
            <th style={{ padding: "8px 4px" }}>Resource</th>
            <th style={{ padding: "8px 4px" }}>Metadata</th>
            <th style={{ padding: "8px 4px" }}>IP</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td colSpan={6} className="muted" style={{ padding: 12 }}>
                Chưa có log nào.
              </td>
            </tr>
          ) : (
            logs.map((log) => (
              <tr key={log.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "6px 4px", whiteSpace: "nowrap" }}>
                  {log.createdAt?.toLocaleString("vi-VN")}
                </td>
                <td style={{ padding: "6px 4px" }}>
                  <code
                    className="code-inline"
                    style={{ color: ACTION_BADGE[log.action] ?? "#374151" }}
                  >
                    {log.action}
                  </code>
                </td>
                <td style={{ padding: "6px 4px" }}>
                  {log.actorName ?? "-"}
                  <br />
                  <code
                    className="code-inline"
                    style={{ fontSize: 11, color: "#9ca3af" }}
                  >
                    {log.actorId.slice(0, 8)}...
                  </code>
                </td>
                <td style={{ padding: "6px 4px" }}>
                  <code className="code-inline">{log.resource ?? "-"}</code>
                </td>
                <td style={{ padding: "6px 4px", maxWidth: 320 }}>
                  <code style={{ fontSize: 11, color: "#475569" }}>
                    {log.metadata ? JSON.stringify(log.metadata) : "-"}
                  </code>
                </td>
                <td style={{ padding: "6px 4px" }} className="muted">
                  {log.ipAddress ?? "-"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
