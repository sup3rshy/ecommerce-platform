import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/authOptions";
import {
  getKeycloakUsersWithRoles,
  getAssignableRealmRoles,
  getStoreGroups,
  getStoreMembershipByUser,
  type StoreMembership,
} from "../../lib/keycloakAdmin";
import { manageableRoles, isSuperAdmin, canManageShop } from "../../lib/scope";
import { assignRole, revokeRole, toggleUserEnabled, setStoreGroup } from "./actions";

export const dynamic = "force-dynamic";

// Role gắn với shop: nếu user có (effective) các role này mà chưa thuộc group shop nào
// thì cảnh báo "chưa gán shop" (vi phạm bất biến: staff/seller thuộc đúng 1 shop).
const SHOP_BOUND_ROLES = ["staff", "seller"];

function roleBadgeClass(role: string): string {
  if (role === "kyc-verified") return "badge badge-kyc";
  if (role === "admin" || role.endsWith("_admin")) return "badge badge-admin";
  return "badge";
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const adminRoles = session?.user?.roles ?? [];
  const { role: roleFilter } = await searchParams;

  const [users, assignable, storeGroups, membership] = await Promise.all([
    getKeycloakUsersWithRoles(200),
    getAssignableRealmRoles(),
    getStoreGroups().catch(() => []),
    getStoreMembershipByUser().catch((): Record<string, StoreMembership> => ({})),
  ]);

  const allRoleNames = assignable.map((r) => r.name);
  const manageable = manageableRoles(adminRoles, allRoleNames);
  const canDisable = isSuperAdmin(adminRoles);
  const canShop = canManageShop(adminRoles);

  // Lọc theo effective role (toàn bộ quyền), nên lọc "buyer" hiện cả seller/staff/...
  const filtered = roleFilter
    ? users.filter((u) => u.effectiveRoles.includes(roleFilter))
    : users;

  return (
    <>
      <div className="card">
        <h1>Người dùng</h1>
        <p className="muted">
          {filtered.length} / {users.length} user trong realm <code>ecommerce-realm</code>.
          Hiển thị <strong>toàn bộ quyền</strong> (đã resolve composite); role kế thừa có dấu{" "}
          <span className="muted">(kế thừa)</span> và không thu hồi trực tiếp được. Bạn quản lý được{" "}
          {manageable.length} role:{" "}
          {manageable.map((r) => (
            <span className={roleBadgeClass(r)} key={r}>
              {r}
            </span>
          ))}
        </p>

        <form
          method="get"
          className="inline-form"
          style={{ marginTop: 12, flexWrap: "wrap" }}
        >
          <label className="muted">Lọc theo quyền:</label>
          <select name="role" defaultValue={roleFilter ?? ""}>
            <option value="">Tất cả</option>
            {allRoleNames.map((r) => (
              <option value={r} key={r}>
                {r}
              </option>
            ))}
          </select>
          <button className="btn btn-sm" type="submit">
            Lọc
          </button>
        </form>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Họ tên / Email</th>
              <th>Trạng thái</th>
              <th>Toàn bộ quyền</th>
              <th>Shop</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const directSet = new Set(u.roles);
              // Gợi ý gán: role quản lý được mà user CHƯA có (kể cả qua composite).
              const assignableForUser = manageable.filter(
                (r) => !u.effectiveRoles.includes(r)
              );
              const userStore = membership[u.id] ?? null;
              const isShopBound = u.effectiveRoles.some((r) => SHOP_BOUND_ROLES.includes(r));
              return (
                <tr key={u.id}>
                  <td>
                    <code className="code-inline">{u.username ?? u.id.slice(0, 8)}</code>
                  </td>
                  <td>
                    {u.fullName ?? <span className="muted">—</span>}
                    <div className="muted">{u.email ?? ""}</div>
                  </td>
                  <td>
                    {u.enabled ? (
                      <span className="badge badge-kyc">enabled</span>
                    ) : (
                      <span className="badge badge-muted">disabled</span>
                    )}
                  </td>
                  <td>
                    {u.effectiveRoles.length === 0 && <span className="muted">—</span>}
                    {u.effectiveRoles.map((r) => {
                      const isDirect = directSet.has(r);
                      const canRevoke = isDirect && manageable.includes(r);
                      return (
                        <span
                          key={r}
                          className={roleBadgeClass(r)}
                          style={isDirect ? undefined : { opacity: 0.65 }}
                          title={isDirect ? `${r} (gán trực tiếp)` : `${r} (kế thừa qua composite)`}
                        >
                          {r}
                          {!isDirect && <span className="muted"> (kế thừa)</span>}
                          {canRevoke && (
                            <form action={revokeRole} className="inline-form">
                              <input type="hidden" name="userId" value={u.id} />
                              <input type="hidden" name="roleName" value={r} />
                              <button
                                type="submit"
                                title={`Thu hồi ${r}`}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "inherit",
                                  padding: "0 0 0 4px",
                                  fontWeight: 700,
                                }}
                              >
                                ×
                              </button>
                            </form>
                          )}
                        </span>
                      );
                    })}
                  </td>
                  <td>
                    {canShop ? (
                      <form action={setStoreGroup} className="inline-form">
                        <input type="hidden" name="userId" value={u.id} />
                        <select name="groupId" defaultValue={userStore?.groupId ?? ""}>
                          <option value="">— không —</option>
                          {storeGroups.map((g) => (
                            <option value={g.id} key={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn btn-sm">
                          Đặt
                        </button>
                        {isShopBound && !userStore && (
                          <span className="badge badge-muted" title="staff/seller nên thuộc 1 shop">
                            ⚠ chưa gán shop
                          </span>
                        )}
                      </form>
                    ) : userStore ? (
                      <code className="code-inline">{userStore.path}</code>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      {assignableForUser.length > 0 ? (
                        <form action={assignRole} className="inline-form">
                          <input type="hidden" name="userId" value={u.id} />
                          <select name="roleName" defaultValue={assignableForUser[0]}>
                            {assignableForUser.map((r) => (
                              <option value={r} key={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="btn btn-sm btn-primary">
                            Gán
                          </button>
                        </form>
                      ) : (
                        <span className="muted">—</span>
                      )}
                      {canDisable && (
                        <form action={toggleUserEnabled} className="inline-form">
                          <input type="hidden" name="userId" value={u.id} />
                          <input
                            type="hidden"
                            name="enabled"
                            value={(!u.enabled).toString()}
                          />
                          <button
                            type="submit"
                            className={`btn btn-sm ${u.enabled ? "btn-danger" : ""}`}
                          >
                            {u.enabled ? "Vô hiệu hoá" : "Kích hoạt"}
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
