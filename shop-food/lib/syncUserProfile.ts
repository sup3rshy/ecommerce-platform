import { sql } from "drizzle-orm";
import { db } from "../db";
import { userProfile } from "../db/schema";

// Upsert cache user_profile theo Keycloak sub. Gọi từ jwt callback lúc login.
export async function syncUserProfile(args: {
  sub: string;
  email: string;
  name?: string | null;
  preferredUsername?: string | null;
  roles: string[];
  groups: string[];
}) {
  await db
    .insert(userProfile)
    .values({
      sub: args.sub,
      email: args.email,
      name: args.name ?? null,
      preferredUsername: args.preferredUsername ?? null,
      roles: args.roles,
      groups: args.groups,
    })
    .onConflictDoUpdate({
      target: userProfile.sub,
      set: {
        email: args.email,
        name: args.name ?? null,
        preferredUsername: args.preferredUsername ?? null,
        roles: args.roles,
        groups: args.groups,
        lastSyncedAt: sql`now()`,
      },
    });
}
