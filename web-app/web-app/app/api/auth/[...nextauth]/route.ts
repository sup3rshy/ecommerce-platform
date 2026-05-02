import NextAuth, { NextAuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import { JWT } from "next-auth/jwt";

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch(
      `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: process.env.KEYCLOAK_CLIENT_ID!,
          client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
          refresh_token: token.refreshToken as string,
        }),
      }
    );

    const refreshed = await response.json();
    if (!response.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      idToken: refreshed.id_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
    };
  } catch (error) {
    console.error("Error refreshing access token:", error);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

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
      authorization: { params: { prompt: "login" } },
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
  callbacks: {
    async jwt({ token, user, account }) {
      // Initial login — store all tokens
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.idToken = account.id_token;
        token.accessTokenExpires = (account.expires_at ?? 0) * 1000;
      }
      if (user) {
        token.roles = user.roles;
        token.id = user.id;
      }

      // Token still valid
      if (Date.now() < (token.accessTokenExpires ?? 0)) {
        return token;
      }

      // Token expired — attempt refresh
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.roles = token.roles;
        session.user.id = token.id;
      }
      session.idToken = token.idToken;
      if (token.error) {
        session.error = token.error;
      }
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