import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/route";
import { getKeycloakUserCount } from "../lib/keycloakAdmin";
import {
  canManageEcommerce,
  canManageFood,
  canReviewKyc,
  isPlatformAdmin,
  isSuperAdmin,
} from "../lib/scope";

export const dynamic = "force-dynamic";

const PLATFORM_LABEL: Record<string, string> = {
  admin: "Toàn hệ sinh thái",
  ecommerce_admin: "ShopEcommerce + ShopSell",
  food_admin: "ShopFood",
  pay_admin: "ShopPay + KYC",
};

export default async function Home() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles ?? [];
  const authed = Boolean(session?.user?.id);

  if (!authed) {
    return (
      <div className="card">
        <h1>Admin Portal</h1>
        <p className="muted">
          Cổng quản trị tập trung cho hệ sinh thái. Quản lý vận hành từng nền tảng,
          tài khoản, role và duyệt KYC qua Keycloak Admin API. Mọi thao tác được ghi audit.
        </p>
        <div className="alert-info" style={{ marginTop: 12 }}>
          Đăng nhập SSO bằng tài khoản có role <code>admin</code> hoặc{" "}
          <code>*_admin</code> để tiếp tục (nút Đăng nhập ở góc trên phải).
        </div>
      </div>
    );
  }

  if (!isPlatformAdmin(roles)) {
    return (
      <div className="card">
        <h1>Không đủ quyền</h1>
        <p className="muted">
          Tài khoản của bạn ({session?.user?.name}) không có role admin nền tảng.
          Cần một trong: <code>admin</code>, <code>ecommerce_admin</code>,{" "}
          <code>food_admin</code>, <code>pay_admin</code>.
        </p>
      </div>
    );
  }

  const userCount = await getKeycloakUserCount();
  const platforms = isSuperAdmin(roles)
    ? ["Toàn hệ sinh thái"]
    : roles.map((r) => PLATFORM_LABEL[r]).filter(Boolean);

  return (
    <>
      <div className="card">
        <h1>Bảng điều khiển</h1>
        <p className="muted">
          Xin chào {session?.user?.name}. Phạm vi quản trị:{" "}
          {platforms.map((p) => (
            <span className="badge badge-admin" key={p}>
              {p}
            </span>
          ))}
        </p>
        <div className="stat-grid" style={{ marginTop: 16 }}>
          <div className="stat">
            <div className="n">{userCount ?? "—"}</div>
            <div className="l">Người dùng trong realm</div>
          </div>
          <div className="stat">
            <div className="n">{roles.length}</div>
            <div className="l">Role của bạn</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Quản trị vận hành</h2>
        <div className="row-actions">
          {canManageEcommerce(roles) && (
            <Link href="/ecommerce" className="btn btn-primary">
              Hệ thống Ecommerce
            </Link>
          )}
          {canManageFood(roles) && (
            <Link href="/food" className="btn btn-primary">
              ShopFood
            </Link>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Danh tính & audit</h2>
        <div className="row-actions">
          <Link href="/users" className="btn btn-primary">
            Quản lý người dùng & role
          </Link>
          {canReviewKyc(roles) && (
            <Link href="/kyc" className="btn">
              Duyệt KYC
            </Link>
          )}
          <Link href="/audit" className="btn">
            Audit log
          </Link>
        </div>
      </div>
    </>
  );
}
