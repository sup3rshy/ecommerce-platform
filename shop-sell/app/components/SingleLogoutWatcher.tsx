"use client";

import { useEffect } from "react";
import { signOut, useSession } from "next-auth/react";

const LOGOUT_STORAGE_KEY = "sso:frontchannel-logout-at";

export function SingleLogoutWatcher() {
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.error !== "RefreshAccessTokenError") return;
    if (window.location.pathname.startsWith("/auth/sso")) return;

    let cancelled = false;
    const callbackUrl = `${window.location.pathname}${window.location.search}`;
    void signOut({ redirect: false }).then(() => {
      if (!cancelled) {
        window.location.assign(
          `/auth/sso?callbackUrl=${encodeURIComponent(callbackUrl)}`
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [session?.error]);

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
