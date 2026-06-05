import { desc } from "drizzle-orm";
import { db } from "../../db";
import { auditLogs } from "../../db/schema";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  if (!d) return "—";
  // ISO ổn định, không phụ thuộc locale server.
  return new Date(d).toISOString().replace("T", " ").slice(0, 19);
}

export default async function AuditPage() {
  const logs = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);

  return (
    <div className="card">
      <h1>Audit log</h1>
      <p className="muted">
        {logs.length} thao tác quản trị gần nhất (assign/revoke role, duyệt KYC,
        bật/tắt user). Ghi trong DB <code>admin_portal</code>.
      </p>
      <table>
        <thead>
          <tr>
            <th>Thời gian (UTC)</th>
            <th>Người thực hiện</th>
            <th>Hành động</th>
            <th>Đối tượng</th>
            <th>Chi tiết</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                Chưa có bản ghi nào.
              </td>
            </tr>
          )}
          {logs.map((l) => (
            <tr key={l.id}>
              <td>
                <code className="code-inline">{fmt(l.createdAt)}</code>
              </td>
              <td>{l.actorName ?? l.actorId}</td>
              <td>
                <span className="badge">{l.action}</span>
              </td>
              <td>
                <code className="code-inline">{l.resource ?? "—"}</code>
              </td>
              <td className="muted">
                {l.metadata ? JSON.stringify(l.metadata) : "—"}
              </td>
              <td className="muted">{l.ipAddress ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
