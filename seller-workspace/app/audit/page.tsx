import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

const PAGE_SIZE = 50;

export default async function AuditPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin");

  const logs = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(PAGE_SIZE);

  return (
    <div>
      <h1>Audit log</h1>
      <p className="muted">
        {PAGE_SIZE} thao tác gần nhất trên Seller Workspace. Mọi action mời/thu
        hồi nhân viên đều ghi lại đây.
      </p>

      <section className="card" style={{ marginTop: 16 }}>
        {logs.length === 0 ? (
          <p className="muted">
            Chưa có sự kiện nào. Thử mời 1 nhân viên ở{" "}
            <a href="/staff" style={{ color: "#0f172a", textDecoration: "underline" }}>
              /staff
            </a>{" "}
            để tạo log đầu tiên.
          </p>
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr>
                <Th>Thời gian</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Resource</Th>
                <Th>Store</Th>
                <Th>Metadata</Th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <Td>{l.createdAt?.toLocaleString("vi-VN") ?? "-"}</Td>
                  <Td>
                    <code className="code-inline">
                      {l.actorId.slice(0, 8)}…
                    </code>
                  </Td>
                  <Td>
                    <code className="code-inline">{l.action}</code>
                  </Td>
                  <Td>{l.resource ?? "-"}</Td>
                  <Td>{l.storeId ?? "-"}</Td>
                  <Td>
                    {l.metadata ? (
                      <code style={{ fontSize: 11, color: "#475569" }}>
                        {JSON.stringify(l.metadata)}
                      </code>
                    ) : (
                      "-"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "8px 6px",
        borderBottom: "1px solid #e2e8f0",
        color: "#64748b",
        fontWeight: 500,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: "8px 6px",
        borderBottom: "1px solid #f1f5f9",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}
