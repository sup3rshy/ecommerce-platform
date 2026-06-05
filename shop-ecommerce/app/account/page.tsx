import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "../api/auth/[...nextauth]/route";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/api/auth/signin/keycloak");
  }

  const roles = session.user.roles ?? [];
  const businessRoles = ["buyer", "seller", "admin"];
  const visibleRoles = roles.filter((role) => businessRoles.includes(role));

  const keycloakIssuer =
    process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER ||
    process.env.KEYCLOAK_ISSUER ||
    "http://localhost:8080/realms/ecommerce-realm";

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const changePasswordUrl = `${keycloakIssuer}/protocol/openid-connect/auth?client_id=${process.env.KEYCLOAK_CLIENT_ID || "nextjs-app"}&redirect_uri=${encodeURIComponent(baseUrl + "/")}&response_type=code&scope=openid&kc_action=UPDATE_PASSWORD`;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Quản lý tài khoản</h1>
        <p className="mt-2 text-sm text-slate-600">Xem thông tin cá nhân và quản lý tài khoản của bạn.</p>
      </header>

      <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Thông tin cá nhân</h2>
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-blue-50 bg-blue-50/30 p-3">
            <span className="text-sm font-medium text-slate-500 w-32">Tên hiển thị</span>
            <span className="text-sm text-slate-900">{session.user.name ?? "Chưa đặt tên"}</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-blue-50 bg-blue-50/30 p-3">
            <span className="text-sm font-medium text-slate-500 w-32">Email</span>
            <span className="text-sm text-slate-900">{session.user.email ?? "Không có"}</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-blue-50 bg-blue-50/30 p-3">
            <span className="text-sm font-medium text-slate-500 w-32">User ID</span>
            <span className="text-sm font-mono text-slate-700">{session.user.id}</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-blue-50 bg-blue-50/30 p-3">
            <span className="text-sm font-medium text-slate-500 w-32">Vai trò</span>
            <div className="flex flex-wrap gap-1.5">
              {visibleRoles.length > 0 ? (
                visibleRoles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                  >
                    {role}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">Chưa có vai trò</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Bảo mật</h2>
        <p className="mt-1 text-sm text-slate-600">Quản lý mật khẩu và bảo mật tài khoản.</p>
        <div className="mt-4">
          <a
            href={changePasswordUrl}
            className="inline-flex items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            Đổi mật khẩu
          </a>
        </div>
      </div>
    </div>
  );
}
