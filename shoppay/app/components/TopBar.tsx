"use client";

import { signIn, signOut } from "next-auth/react";
import Link from "next/link";

export function TopBar({
  isAuthenticated,
  userName,
}: {
  isAuthenticated: boolean;
  userName?: string | null;
}) {
  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Link href="/" className="brand">
          ⚡ ShopPay
        </Link>
        {isAuthenticated && (
          <nav>
            <Link href="/wallet">Ví của tôi</Link>
            <Link href="/topup">Nạp tiền</Link>
            <Link href="/kyc">KYC</Link>
          </nav>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {isAuthenticated ? (
          <>
            <span style={{ fontSize: 14 }}>{userName}</span>
            <button onClick={() => signOut({ callbackUrl: "/" })} className="btn">
              Đăng xuất
            </button>
          </>
        ) : (
          <button onClick={() => signIn("keycloak")} className="btn">
            Đăng nhập SSO
          </button>
        )}
      </div>
    </header>
  );
}
