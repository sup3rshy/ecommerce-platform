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
  window.location.href = `/auth/sso?callbackUrl=${encodeURIComponent(callbackUrl)}`;
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

const ADMIN_ROLES = ["food_admin", "admin"];

export function TopBar({
  isAuthenticated,
  userName,
  roles = [],
  idToken,
}: {
  isAuthenticated: boolean;
  userName?: string | null;
  roles?: string[];
  idToken?: string;
}) {
  const isAdmin = roles.some((r) => ADMIN_ROLES.includes(r));
  const isBuyer = roles.includes("buyer");
  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Link href="/" className="brand">
          🍜 ShopFood
        </Link>
        <nav>
          <Link href="/">Thực đơn</Link>
          {isAuthenticated && isBuyer && <Link href="/cart">Giỏ hàng</Link>}
          {isAuthenticated && isBuyer && <Link href="/orders">Đơn của tôi</Link>}
          {isAuthenticated && isAdmin && <Link href="/admin">Quản trị</Link>}
        </nav>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {isAuthenticated ? (
          <>
            <span style={{ fontSize: 14 }}>{userName}</span>
            <button
              onClick={async () => {
                const keycloakIssuer =
                  process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER ||
                  "http://localhost:8080/realms/ecommerce-realm";
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
