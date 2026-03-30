"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import LogoutButton from "./LogoutButton";

type SidebarNavProps = {
  isAuthenticated: boolean;
  userName?: string | null;
  roles: string[];
  idToken?: string;
};

type NavItem = {
  href: string;
  label: string;
  visible: boolean;
};

const navItemBaseClass =
  "block rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

const isLinkActive = (pathname: string, href: string) => {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
};

export default function SidebarNav({ isAuthenticated, userName, roles, idToken }: SidebarNavProps) {
  const pathname = usePathname();

  const hasBuyerRole = roles.includes("buyer");
  const hasSellerRole = roles.includes("seller");
  const hasAdminRole = roles.includes("admin");

  const navItems: NavItem[] = [
    { href: "/", label: "Trang chủ", visible: true },
    { href: "/cart", label: "Giỏ hàng", visible: hasBuyerRole },
    { href: "/orders", label: "Lịch sử mua", visible: hasBuyerRole },
    { href: "/seller", label: "Người bán", visible: hasSellerRole },
    { href: "/seller/register", label: "Đăng ký bán", visible: hasBuyerRole && !hasSellerRole },
    { href: "/admin", label: "Quản trị", visible: hasAdminRole },
  ];

  return (
    <aside className="sticky top-4 h-fit rounded-2xl border border-blue-100 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Ecommerce</p>
      <h1 className="mt-2 text-xl font-bold text-slate-900">Bảng điều hướng</h1>
      <p className="mt-1 min-h-5 text-sm text-slate-600" suppressHydrationWarning>
        {isAuthenticated ? `Xin chào, ${userName ?? "bạn"}` : "Đăng nhập để mở khóa đầy đủ tính năng"}
      </p>

      <nav className="mt-5 space-y-1.5" aria-label="Điều hướng chính">
        {navItems
          .filter((item) => item.visible)
          .map((item) => {
            const active = isLinkActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${navItemBaseClass} ${
                  active
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-700 hover:bg-blue-50 hover:text-blue-800"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
      </nav>

      <div className="mt-6 space-y-3 border-t border-blue-100 pt-4">
        {isAuthenticated ? (
          <>
            <Link
              href="/account"
              className="inline-flex w-full items-center justify-center rounded-xl border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              Quản lý tài khoản
            </Link>
            <LogoutButton idToken={idToken} />
          </>
        ) : (
          <Link
            href="/api/auth/signin/keycloak"
            className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Đăng nhập với Keycloak
          </Link>
        )}
      </div>
    </aside>
  );
}
