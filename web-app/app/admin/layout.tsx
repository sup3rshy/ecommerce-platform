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
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[250px_1fr] lg:px-8">
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Admin</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">Bảng điều khiển</h2>

          <nav className="mt-6 space-y-2">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <section>{children}</section>
      </div>
    </main>
  );
}