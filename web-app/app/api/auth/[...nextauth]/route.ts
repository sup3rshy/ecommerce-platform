import NextAuth, { NextAuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import { syncUserProfile } from "../../../../lib/syncUserProfile";
import { refreshAccessToken } from "../../../../lib/refreshAccessToken";

export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER,
      client: {
        id_token_signed_response_alg: "ES256",
        userinfo_signed_response_alg: "ES256",
      },
      // Bỏ prompt:"login" để silent SSO hoạt động — Keycloak sẽ
      // tự nhận diện session đã có và bỏ qua màn hình đăng nhập.
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name ?? profile.preferred_username,
          email: profile.email,
          image: profile.picture,
          roles: profile.realm_access?.roles ?? [],
        };
      },
    }),
  ],
  cookies: {
    sessionToken: {
      name: "ecommerce.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    callbackUrl: {
      name: "ecommerce.callback-url",
      options: { sameSite: "lax", path: "/", secure: false },
    },
    csrfToken: {
      name: "ecommerce.csrf-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      // Initial sign-in: capture access/refresh token + expiry
      if (account) {
        token.idToken = account.id_token;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 5 * 60 * 1000;
      }
      if (user) {
        token.roles = user.roles;
        token.id = user.id;
        try {
          await syncUserProfile({
            sub: user.id as string,
            email: user.email as string,
            name: user.name ?? null,
            preferredUsername:
              (profile as { preferred_username?: string } | undefined)
                ?.preferred_username ?? null,
            roles: (user.roles as string[]) ?? [],
            groups: [],
          });
        } catch (err) {
          console.error("syncUserProfile failed:", err);
        }
      }
      // Token vẫn còn hạn — trả về như cũ
      const expires = token.accessTokenExpires as number | undefined;
      if (expires && Date.now() < expires - 60_000) {
        return token;
      }
      // Hết hạn (hoặc gần hết) → refresh
      return await refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.roles = token.roles;
        session.user.id = token.id;
      }
      session.idToken = token.idToken;
      return session;
    },
    async redirect({ baseUrl }) {
      return baseUrl;
    },
  },
  events: {
    async signOut({ token }) {
      if (token.idToken && process.env.KEYCLOAK_ISSUER) {
        try {
          const keycloakUrl = new URL(
            `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout`
          );
          keycloakUrl.searchParams.set("id_token_hint", token.idToken as string);
          
          // Gọi Keycloak logout endpoint để invalidate session
          await fetch(keycloakUrl.toString(), {
            method: "GET",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          }).catch(() => {
            // Ignore errors from Keycloak logout
          });
        } catch (error) {
          console.error("Error logging out from Keycloak:", error);
        }
      }
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };