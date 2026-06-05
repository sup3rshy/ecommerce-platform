"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "../api/auth/[...nextauth]/route";
import {
  assignRealmRoleToUser,
  revokeRealmRoleFromUser,
} from "../../lib/keycloakAdmin";
import { canReviewKyc } from "../../lib/scope";
import { logAudit } from "../../lib/audit";

const KYC_ROLE = "kyc-verified";

async function requireReviewer() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles ?? [];
  if (!session?.user?.id || !canReviewKyc(roles)) {
    throw new Error("Forbidden: cần role admin hoặc pay_admin để duyệt KYC");
  }
  return session;
}

/**
 * Duyệt KYC = gán role kyc-verified. Review tài liệu (CCCD/passport) nằm ở ShopPay
 * (/kyc/admin); Admin Portal chỉ quản lý lớp role xuyên nền tảng.
 * Lưu ý: user phải đăng nhập lại để token mới có role (token là snapshot).
 */
export async function grantKyc(formData: FormData) {
  const session = await requireReviewer();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("missing userId");

  await assignRealmRoleToUser(userId, KYC_ROLE);
  await logAudit({
    actorId: session.user!.id!,
    actorName: session.user!.name,
    action: "kyc.grant",
    resource: `user:${userId}`,
    metadata: { assignedRole: KYC_ROLE },
  });
  revalidatePath("/kyc");
  revalidatePath("/users");
}

export async function revokeKyc(formData: FormData) {
  const session = await requireReviewer();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("missing userId");

  await revokeRealmRoleFromUser(userId, KYC_ROLE);
  await logAudit({
    actorId: session.user!.id!,
    actorName: session.user!.name,
    action: "kyc.revoke",
    resource: `user:${userId}`,
    metadata: { revokedRole: KYC_ROLE },
  });
  revalidatePath("/kyc");
  revalidatePath("/users");
}
