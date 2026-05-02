import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ReactNode } from "react";

import { authOptions } from "../api/auth/[...nextauth]/route";

type AdminLayoutProps = {
  children: ReactNode;
};

const NAV_ITEMS = [
  { href: "/admin", label: "Tổng quan" },
  { href: "/admin/users", label: "Quản lý người dùng" },
  { href: "/admin/stores", label: "Quản lý gian hàng" },
];

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const roles = session.user.roles ?? [];
  if (!roles.includes("admin")) {
    redirect("/");
  }

  return (
    <main className="space-y-4">
      <header className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-blue-700">Admin</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">Bảng điều khiển quản trị</h2>

        <nav className="mt-4 flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <section>{children}</section>
    </main>
  );
}