import NextAuth, { NextAuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";

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
      // Bỏ prompt:"login" để silent SSO hoạt động.
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name ?? profile.preferred_username,
          email: profile.email,
          image: profile.picture,
          roles: profile.realm_access?.roles ?? [],
          groups: (profile as { groups?: string[] }).groups ?? [],
        };
      },
    }),
  ],
  cookies: {
    sessionToken: {
      name: "seller-workspace.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    callbackUrl: {
      name: "seller-workspace.callback-url",
      options: { sameSite: "lax", path: "/", secure: false },
    },
    csrfToken: {
      name: "seller-workspace.csrf-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account) token.idToken = account.id_token;
      if (user) {
        token.id = user.id;
        token.roles = user.roles;
        token.groups = user.groups;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.roles = token.roles;
        session.user.groups = token.groups;
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
          const url = new URL(
            `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout`
          );
          url.searchParams.set("id_token_hint", token.idToken as string);
          await fetch(url.toString(), { method: "GET" }).catch(() => {});
        } catch (err) {
          console.error("Keycloak logout error:", err);
        }
      }
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
