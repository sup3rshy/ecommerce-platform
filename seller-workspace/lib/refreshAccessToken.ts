import type { JWT } from "next-auth/jwt";

/**
 * Refresh access token với Keycloak khi gần hết hạn. Gọi từ NextAuth `jwt` callback
 * khi `Date.now() > token.accessTokenExpires`.
 *
 * Pattern: NextAuth không tự refresh — phải code tay. Nếu refresh fail (refresh
 * token expired / revoked), set `token.error = "RefreshAccessTokenError"` để
 * client-side biết và force re-login.
 */
export async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const issuer = process.env.KEYCLOAK_ISSUER;
    const clientId = process.env.KEYCLOAK_CLIENT_ID;
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
    if (!issuer || !clientId || !clientSecret) {
      throw new Error("Missing Keycloak env vars");
    }
    if (!token.refreshToken) {
      throw new Error("No refresh token");
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
      body,
    });
    const refreshed = (await resp.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
      refresh_expires_in?: number;
      id_token?: string;
      error?: string;
    };

    if (!resp.ok || refreshed.error) {
      console.error("[refreshAccessToken] failed:", refreshed);
      return { ...token, error: "RefreshAccessTokenError" };
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      // Keycloak rotates refresh token theo default — dùng cái mới nếu có
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      idToken: refreshed.id_token ?? token.idToken,
      error: undefined,
    };
  } catch (err) {
    console.error("[refreshAccessToken] exception:", err);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}
