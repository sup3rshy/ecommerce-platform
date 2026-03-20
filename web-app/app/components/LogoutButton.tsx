"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export default function LogoutButton({ logoutUrl }: { logoutUrl?: string }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      console.log("Logout button clicked, logoutUrl:", logoutUrl);
      
      if (logoutUrl) {
        console.log("Logging out with Keycloak redirect");
        await signOut({ redirect: false });
        console.log("About to redirect to:", logoutUrl);
        window.location.href = logoutUrl;
      } else {
        console.log("No logoutUrl provided, using fallback");
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
      className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:bg-gray-500 transition"
    >
      {isLoading ? "Đang đăng xuất..." : "Đăng xuất"}
    </button>
  );
}