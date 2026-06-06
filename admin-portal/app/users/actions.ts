"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "../../lib/authOptions";
import {
  assignRealmRoleToUser,
  revokeRealmRoleFromUser,
  setUserEnabled,
  getAssignableRealmRoles,
  setUserStoreGroup,
} from "../../lib/keycloakAdmin";
import { canManageRole, canManageShop, isPlatformAdmin, isSuperAdmin } from "../../lib/scope";
import { logAudit } from "../../lib/audit";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles ?? [];
  if (!session?.user?.id || !isPlatformAdmin(roles)) {
    throw new Error("Forbidden: cần role admin nền tảng");
  }
  return { session, roles };
}

async function allRealmRoleNames(): Promise<string[]> {
  const roles = await getAssignableRealmRoles();
  return roles.map((r) => r.name);
}

export async function assignRole(formData: FormData) {
  const { session, roles } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const roleName = String(formData.get("roleName") ?? "");
  if (!userId || !roleName) throw new Error("missing userId/roleName");

  const allRoles = await allRealmRoleNames();
  if (!canManageRole(roles, roleName, allRoles)) {
    throw new Error(`Forbidden: không có quyền gán role '${roleName}'`);
  }

  await assignRealmRoleToUser(userId, roleName);
  await logAudit({
    actorId: session!.user!.id!,
    actorName: session!.user!.name,
    action: "role.assign",
    resource: `user:${userId}`,
    metadata: { roleName },
  });
  revalidatePath("/users");
}

export async function revokeRole(formData: FormData) {
  const { session, roles } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const roleName = String(formData.get("roleName") ?? "");
  if (!userId || !roleName) throw new Error("missing userId/roleName");

  const allRoles = await allRealmRoleNames();
  if (!canManageRole(roles, roleName, allRoles)) {
    throw new Error(`Forbidden: không có quyền thu hồi role '${roleName}'`);
  }

  await revokeRealmRoleFromUser(userId, roleName);
  await logAudit({
    actorId: session!.user!.id!,
    actorName: session!.user!.name,
    action: "role.revoke",
    resource: `user:${userId}`,
    metadata: { roleName },
  });
  revalidatePath("/users");
}

// Gán/đổi shop (Keycloak group) cho staff/seller. Enforce 1 shop: setUserStoreGroup
// gỡ user khỏi mọi store group khác trước khi add. groupId rỗng = gỡ khỏi shop.
export async function setStoreGroup(formData: FormData) {
  const { session, roles } = await requireAdmin();
  if (!canManageShop(roles)) {
    throw new Error("Forbidden: chỉ admin / ecommerce_admin được gán shop");
  }
  const userId = String(formData.get("userId") ?? "");
  const groupId = String(formData.get("groupId") ?? "");
  if (!userId) throw new Error("missing userId");

  await setUserStoreGroup(userId, groupId || null);
  await logAudit({
    actorId: session!.user!.id!,
    actorName: session!.user!.name,
    action: groupId ? "shop.assign" : "shop.unassign",
    resource: `user:${userId}`,
    metadata: { groupId: groupId || null },
  });
  revalidatePath("/users");
}

// Bật/tắt tài khoản. Chỉ super admin (`admin`) — đây là thao tác account-level,
// không nằm trong phạm vi role per-platform.
export async function toggleUserEnabled(formData: FormData) {
  const { session, roles } = await requireAdmin();
  if (!isSuperAdmin(roles)) {
    throw new Error("Forbidden: chỉ admin được bật/tắt tài khoản");
  }
  const userId = String(formData.get("userId") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!userId) throw new Error("missing userId");

  await setUserEnabled(userId, enabled);
  await logAudit({
    actorId: session!.user!.id!,
    actorName: session!.user!.name,
    action: enabled ? "user.enable" : "user.disable",
    resource: `user:${userId}`,
    metadata: { enabled },
  });
  revalidatePath("/users");
}
