"use client";

import { signIn, signOut } from "next-auth/react";
import Link from "next/link";

export function TopBar({
  isAuthenticated,
  userName,
  roles,
}: {
  isAuthenticated: boolean;
  userName?: string | null;
  roles: string[];
}) {
  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Link href="/" className="brand">
          Seller Workspace
        </Link>
        {isAuthenticated && (
          <nav>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/staff">Nhân viên</Link>
            <Link href="/audit">Audit log</Link>
          </nav>
        )}
      </div>

      <div className="user-block">
        {isAuthenticated ? (
          <>
            <div style={{ textAlign: "right" }}>
              <div className="user-name">{userName}</div>
              <div className="user-roles">
                {roles.length ? roles.join(", ") : "no roles"}
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="btn"
            >
              Đăng xuất
            </button>
          </>
        ) : (
          <button
            onClick={() => signIn("keycloak")}
            className="btn btn-primary"
          >
            Đăng nhập SSO
          </button>
        )}
      </div>
    </header>
  );
}
