"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

const LOGOUT_STORAGE_KEY = "sso:frontchannel-logout-at";

// Lắng nghe marker do frontchannel-logout đặt vào localStorage (Keycloak iframe).
// Khi user logout ở app khác trong SSO, tab này tự signOut + reload.
export function SingleLogoutWatcher() {
  useEffect(() => {
    let handledValue: string | null = null;

    async function handleStorage(event: StorageEvent) {
      if (event.key !== LOGOUT_STORAGE_KEY || !event.newValue) return;
      if (event.newValue === handledValue) return;

      handledValue = event.newValue;
      await signOut({ redirect: false });
      window.location.reload();
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return null;
}
