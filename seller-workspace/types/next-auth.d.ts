import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    idToken?: string;
    user: {
      id?: string;
      roles?: string[];
      groups?: string[];
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    roles?: string[];
    groups?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    roles?: string[];
    groups?: string[];
    idToken?: string;
  }
}
