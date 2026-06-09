"use client";

import { signIn, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

export default function AutoSsoSignIn({ callbackUrl }: { callbackUrl: string }) {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    async function startSso() {
      try {
        await signOut({ redirect: false });
        if (!cancelled) await signIn("keycloak", { callbackUrl });
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void startSso();

    return () => {
      cancelled = true;
    };
  }, [callbackUrl]);

  return (
    <div style={{ display: "grid", minHeight: "60vh", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 360, textAlign: "center" }}>
        <p style={{ color: "#475569", marginBottom: 16 }}>
          {failed ? "Không thể tự chuyển tới SSO." : "Đang chuyển tới SSO..."}
        </p>
        {failed && (
          <button
            type="button"
            onClick={() => void signIn("keycloak", { callbackUrl })}
            style={{
              borderRadius: 10,
              background: "#2563eb",
              color: "#fff",
              fontWeight: 600,
              padding: "10px 14px",
            }}
          >
            Thử lại
          </button>
        )}
      </div>
    </div>
  );
}
