"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

type LogoutButtonProps = {
  idToken?: string;
};

export default function LogoutButton({ idToken }: LogoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    try {
      setIsLoading(true);

      // Fully terminate SSO session at Keycloak and then return to homepage.
      if (idToken && process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER) {
        const keycloakLogoutUrl = new URL(
          `${process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER}/protocol/openid-connect/logout`
        );
        keycloakLogoutUrl.searchParams.set("id_token_hint", idToken);
        keycloakLogoutUrl.searchParams.set("client_id", "nextjs-app");
        keycloakLogoutUrl.searchParams.set(
          "post_logout_redirect_uri",
          `${window.location.origin}/`
        );

        // Clear NextAuth cookie first.
        await signOut({ redirect: false });

        // Then go to Keycloak logout endpoint.
        window.location.href = keycloakLogoutUrl.toString();
      } else {
        // Fallback if token is missing.
        await signOut({ redirect: true, callbackUrl: "/" });
      }
    } catch (error) {
      console.error("Logout error:", error);
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoading}
      className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
    >
      {isLoading ? "Đang đăng xuất..." : "Đăng xuất"}
    </button>
  );
}