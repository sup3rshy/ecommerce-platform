import type { JWT } from "next-auth/jwt";

/**
 * Refresh access token với Keycloak khi gần hết hạn. Gọi từ NextAuth `jwt` callback
 * khi `Date.now() > token.accessTokenExpires`.
 *
 * Pattern: NextAuth không tự refresh — phải code tay. Nếu refresh fail (refresh
 * token expired / revoked, hoặc user bị xoá khỏi AD ở Phase 4), set
 * `token.error = "RefreshAccessTokenError"` để client-side force re-login.
 */
export async function refreshAccessToken(token: JWT): Promise<JWT> {
  const expiredToken = {
    ...token,
    accessToken: undefined,
    refreshToken: undefined,
    idToken: undefined,
    accessTokenExpires: 0,
    error: "RefreshAccessTokenError",
  };

  try {
    const issuer = process.env.KEYCLOAK_ISSUER;
    const clientId = process.env.KEYCLOAK_CLIENT_ID;
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
    if (!issuer || !clientId || !clientSecret) {
      throw new Error("Missing Keycloak env vars");
    }
    if (!token.refreshToken) {
      return expiredToken;
    }

    const url = `${issuer}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken as string,
    });

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.warn(`[refreshAccessToken] HTTP ${resp.status} failed:`, text);
      return expiredToken;
    }

    const refreshed = await resp.json();
    if (refreshed.error) {
      console.warn("[refreshAccessToken] Keycloak error:", refreshed);
      return expiredToken;
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      idToken: refreshed.id_token ?? token.idToken,
      error: undefined,
    };
  } catch (err) {
    console.warn("[refreshAccessToken] exception:", err);
    return expiredToken;
  }
}
