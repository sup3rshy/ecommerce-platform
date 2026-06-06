import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { authOptions } from "@/lib/authOptions";
import { db } from "@/db";
import { staffInvitations, storePermissions } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { currentStore } from "@/lib/store";

const STAFF_ROLES = ["staff"] as const;

async function inviteStaff(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("unauthenticated");

  // AuthZ: chỉ seller (chủ shop) hoặc admin được mời nhân viên
  const roles = (session.user.roles ?? []) as string[];
  if (!roles.includes("seller") && !roles.includes("admin")) {
    throw new Error("Forbidden: chỉ chủ shop hoặc admin được mời nhân viên");
  }

  // storeId lấy từ Keycloak group của chủ shop (không còn hardcode).
  const store = currentStore(session.user.groups);
  if (!store) {
    throw new Error("Không xác định được shop: tài khoản không thuộc group shop nào");
  }

  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!email || !STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])) {
    return;
  }

  await db
    .insert(staffInvitations)
    .values({
      storeId: store.storeId,
      email,
      role,
      invitedBy: session.user.id,
    })
    .onConflictDoNothing();

  await logAudit({
    storeId: store.storeId,
    actorId: session.user.id,
    action: "staff.invite",
    resource: email,
    metadata: { role },
  });

  revalidatePath("/staff");
}

async function revokeStaff(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("unauthenticated");

  const roles = (session.user.roles ?? []) as string[];
  if (!roles.includes("seller") && !roles.includes("admin")) {
    throw new Error("Forbidden: chỉ chủ shop hoặc admin được thu hồi");
  }

  const store = currentStore(session.user.groups);

  const id = Number(formData.get("id"));
  if (!id) return;

  await db
    .update(storePermissions)
    .set({ revokedAt: new Date() })
    .where(eq(storePermissions.id, id));

  await logAudit({
    storeId: store?.storeId,
    actorId: session.user.id,
    action: "staff.revoke",
    resource: String(id),
  });

  revalidatePath("/staff");
}

export default async function StaffPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/api/auth/signin");

  // Shop của user lấy từ Keycloak group (/store-demo-N). Không thuộc shop nào
  // (vd admin/ecommerce_admin nền tảng) thì không có roster để quản lý.
  const store = currentStore(session.user.groups);
  if (!store) {
    return (
      <div>
        <h1>Quản lý nhân viên</h1>
        <div className="alert-warn" style={{ marginTop: 16 }}>
          Tài khoản của bạn không thuộc shop nào (không có group{" "}
          <code className="code-inline">/store-demo-*</code>). Chỉ chủ shop /
          nhân viên gắn với một shop mới thấy danh sách nhân viên.
        </div>
      </div>
    );
  }

  const [invitations, permissions] = await Promise.all([
    db
      .select()
      .from(staffInvitations)
      .where(eq(staffInvitations.storeId, store.storeId))
      .orderBy(desc(staffInvitations.invitedAt)),
    db
      .select()
      .from(storePermissions)
      .where(eq(storePermissions.storeId, store.storeId))
      .orderBy(desc(storePermissions.grantedAt)),
  ]);

  return (
    <div>
      <h1>Quản lý nhân viên</h1>
      <p className="muted">
        Shop: <code className="code-inline">{store.path}</code> (storeId ={" "}
        {store.storeId}), suy từ Keycloak group của bạn.
      </p>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Mời nhân viên mới</h2>
        <form
          action={inviteStaff}
          style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
        >
          <input
            name="email"
            type="email"
            required
            placeholder="email@example.com"
            style={{
              flex: "1 1 220px",
              padding: "8px 12px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              fontSize: 14,
            }}
          />
          <select
            name="role"
            required
            defaultValue="staff"
            style={{
              padding: "8px 12px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary">
            Gửi lời mời
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Lời mời ({invitations.length})</h2>
        {invitations.length === 0 ? (
          <p className="muted">Chưa có lời mời nào.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Trạng thái</Th>
                <Th>Mời lúc</Th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((i) => (
                <tr key={i.id}>
                  <Td>{i.email}</Td>
                  <Td>
                    <code className="code-inline">{i.role}</code>
                  </Td>
                  <Td>
                    <Badge status={i.status} />
                  </Td>
                  <Td>{i.invitedAt?.toLocaleString("vi-VN") ?? "-"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="card">
        <h2>Nhân viên hiện tại ({permissions.filter((p) => !p.revokedAt).length})</h2>
        {permissions.length === 0 ? (
          <p className="muted">
            Chưa có nhân viên nào active. Lời mời sau khi nhân viên accept sẽ
            tạo record ở đây (logic accept chưa wired).
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>User ID</Th>
                <Th>Role</Th>
                <Th>Cấp lúc</Th>
                <Th>Trạng thái</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <code className="code-inline">{p.userId.slice(0, 8)}…</code>
                  </Td>
                  <Td>
                    <code className="code-inline">{p.role}</code>
                  </Td>
                  <Td>{p.grantedAt?.toLocaleString("vi-VN") ?? "-"}</Td>
                  <Td>
                    {p.revokedAt ? (
                      <Badge status="revoked" />
                    ) : (
                      <Badge status="active" />
                    )}
                  </Td>
                  <Td>
                    {!p.revokedAt && (
                      <form action={revokeStaff}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="btn">
                          Thu hồi
                        </button>
                      </form>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      {children}
    </table>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
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
      }}
    >
      {children}
    </td>
  );
}

function Badge({ status }: { status: string }) {
  const colors: Record<string, [string, string]> = {
    pending: ["#fef3c7", "#92400e"],
    accepted: ["#d1fae5", "#065f46"],
    active: ["#dbeafe", "#1e40af"],
    revoked: ["#fee2e2", "#991b1b"],
  };
  const [bg, fg] = colors[status] ?? ["#f1f5f9", "#475569"];
  return (
    <span
      style={{
        background: bg,
        color: fg,
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {status}
    </span>
  );
}
