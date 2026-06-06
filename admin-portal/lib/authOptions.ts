import type { NextAuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import { syncUserProfile } from "./syncUserProfile";
import { refreshAccessToken } from "./refreshAccessToken";

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
      name: "admin-portal.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    callbackUrl: {
      name: "admin-portal.callback-url",
      options: { sameSite: "lax", path: "/", secure: false },
    },
    csrfToken: {
      name: "admin-portal.csrf-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    pkceCodeVerifier: {
      name: "admin-portal.pkce.code_verifier",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    state: {
      name: "admin-portal.state",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    nonce: {
      name: "admin-portal.nonce",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account) {
        token.idToken = account.id_token;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 5 * 60 * 1000;
        token.error = undefined;
      }
      if (user) {
        token.id = user.id;
        token.roles = user.roles;
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
      if (token.error === "RefreshAccessTokenError") return token;
      const expires = token.accessTokenExpires as number | undefined;
      if (expires && Date.now() < expires - 60_000) return token;
      return await refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (token.error === "RefreshAccessTokenError") {
        if (session.user) {
          session.user.id = undefined;
          session.user.name = undefined;
          session.user.email = undefined;
          session.user.image = undefined;
          session.user.roles = [];
        }
        session.idToken = undefined;
        session.error = token.error;
        return session;
      }
      if (session.user) {
        session.user.id = token.id;
        session.user.roles = token.roles;
      }
      session.idToken = token.idToken;
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
  events: {},
};
