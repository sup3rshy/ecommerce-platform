import { db } from "../db";
import { userProfile } from "../db/schema";
import { sql } from "drizzle-orm";

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
