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
      className="btn btn-primary"
    >
      {loading ? "Đang chuyển..." : "Đăng nhập SSO"}
    </button>
  );
}

export function TopBar({
  isAuthenticated,
  userName,
  roles,
  showNav = true,
  idToken,
}: {
  isAuthenticated: boolean;
  userName?: string | null;
  roles: string[];
  showNav?: boolean;
  idToken?: string;
}) {
  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Link href="/" className="brand">
          Seller Workspace
        </Link>
        {isAuthenticated && showNav && (
          <nav>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/products">Sản phẩm</Link>
            <Link href="/orders">Đơn hàng</Link>
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
              onClick={async () => {
                const keycloakIssuer = process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER || "http://localhost:8080/realms/ecommerce-realm";
                if (idToken) {
                  const url = new URL(`${keycloakIssuer}/protocol/openid-connect/logout`);
                  url.searchParams.set("id_token_hint", idToken);
                  url.searchParams.set("post_logout_redirect_uri", `${window.location.origin}/`);
                  await signOut({ redirect: false });
                  window.location.href = url.toString();
                } else {
                  await signOut({ redirect: true, callbackUrl: "/" });
                }
              }}
              className="btn"
            >
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
