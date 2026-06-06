"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "../../lib/authOptions";
import {
  assignRealmRoleToUser,
  revokeRealmRoleFromUser,
} from "../../lib/keycloakAdmin";
import { approveKycDocument, rejectKycDocument } from "../../lib/platformData";
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
  revalidatePath("/audit");
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
  revalidatePath("/audit");
}

export async function approveKycRequest(formData: FormData) {
  const session = await requireReviewer();
  const kycId = parseInt(String(formData.get("kycId") ?? ""), 10);
  if (!kycId) throw new Error("missing kycId");

  const doc = await approveKycDocument(
    kycId,
    session.user!.id!,
    session.user!.name ?? null
  );
  await logAudit({
    actorId: session.user!.id!,
    actorName: session.user!.name,
    action: "kyc.approve",
    resource: `kyc:${kycId}`,
    metadata: {
      source: "admin-portal",
      targetUserId: doc.userId,
      assignedRole: KYC_ROLE,
      docType: doc.docType,
    },
  });
  revalidatePath("/kyc");
  revalidatePath("/users");
  revalidatePath("/audit");
}

export async function rejectKycRequest(formData: FormData) {
  const session = await requireReviewer();
  const kycId = parseInt(String(formData.get("kycId") ?? ""), 10);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!kycId) throw new Error("missing kycId");

  const doc = await rejectKycDocument(
    kycId,
    session.user!.id!,
    session.user!.name ?? null,
    reason || null
  );
  await logAudit({
    actorId: session.user!.id!,
    actorName: session.user!.name,
    action: "kyc.reject",
    resource: `kyc:${kycId}`,
    metadata: {
      source: "admin-portal",
      targetUserId: doc.userId,
      reason: reason || undefined,
    },
  });
  revalidatePath("/kyc");
  revalidatePath("/audit");
}
