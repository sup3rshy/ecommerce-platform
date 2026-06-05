import { db } from "../db";
import { userProfile } from "../db/schema";
import { sql } from "drizzle-orm";

/**
 * Cache user data từ Keycloak vào DB app. Gọi lúc user vừa login (jwt callback,
 * khi `user` object có sẵn). Mục đích: server actions / pages khác có thể đọc
 * `user_profile` thay vì gọi Keycloak Admin API mỗi request.
 */
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
