"use client";

import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

async function robustSignIn(provider: string, callbackUrl = "/") {
  try {
    const result = await signIn(provider, { callbackUrl, redirect: false });
    if (result?.url) {
      window.location.href = result.url;
      return;
    }
  } catch {
    // fall through
  }
  // Fallback nếu fetch /api/auth/csrf timeout (Turbopack đang compile lần đầu)
  window.location.href = `/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

function SignInButton() {
  const [loading, setLoading] = useState(false);
  return (
    <button
      onClick={async () => {
        setLoading(true);
        await robustSignIn("keycloak", "/");
      }}
      disabled={loading}
      className="btn"
    >
      {loading ? "Đang chuyển..." : "Đăng nhập SSO"}
    </button>
  );
}

const REVIEWER_ROLES = ["admin", "staff-finance"];

export function TopBar({
  isAuthenticated,
  userName,
  roles = [],
}: {
  isAuthenticated: boolean;
  userName?: string | null;
  roles?: string[];
}) {
  const canReviewKyc = roles.some((r) => REVIEWER_ROLES.includes(r));
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
            {canReviewKyc && <Link href="/kyc/admin">KYC Review</Link>}
            {canReviewKyc && <Link href="/audit">Audit log</Link>}
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
          <SignInButton />
        )}
      </div>
    </header>
  );
}
