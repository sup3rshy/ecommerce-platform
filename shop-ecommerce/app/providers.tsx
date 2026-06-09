"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { SingleLogoutWatcher } from "./components/SingleLogoutWatcher";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <SingleLogoutWatcher />
      {children}
    </SessionProvider>
  );
}
