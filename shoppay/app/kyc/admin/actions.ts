"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { db } from "@/db";
import { kycDocuments } from "@/db/schema";
import { assignRealmRoleToUser } from "../../../lib/keycloakAdmin";
import { logAudit } from "../../../lib/audit";

const REVIEWER_ROLES = ["admin", "staff-finance"];

function ensureReviewer(roles: string[]) {
  if (!roles.some((r) => REVIEWER_ROLES.includes(r))) {
    throw new Error("Forbidden: cần role admin hoặc staff-finance");
  }
}

/**
 * Approve 1 KYC submission:
 * 1. Update status `approved` trong DB.
 * 2. Gọi Keycloak Admin API gán role `kyc-verified` cho user (token client_credentials
 *    của backend-admin-client).
 *
 * Lưu ý: user phải logout/login lại để JWT mới có role kyc-verified, vì NextAuth
 * cache role trong session cookie.
 */
export async function approveKyc(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("unauthenticated");
  ensureReviewer(session.user.roles ?? []);

  const kycId = parseInt(String(formData.get("kycId") ?? ""), 10);
  if (!kycId) throw new Error("missing kycId");

  const [doc] = await db
    .select()
    .from(kycDocuments)
    .where(eq(kycDocuments.id, kycId))
    .limit(1);
  if (!doc) throw new Error("kyc not found");
  if (doc.status === "approved") return; // idempotent

  // 1. Update DB
  await db
    .update(kycDocuments)
    .set({
      status: "approved",
      reviewedAt: new Date(),
      reviewerNote: `Approved by ${session.user.name ?? session.user.id}`,
    })
    .where(eq(kycDocuments.id, kycId));

  // 2. Gán role kyc-verified qua Admin API
  await assignRealmRoleToUser(doc.userId, "kyc-verified");

  await logAudit({
    actorId: session.user.id,
    actorName: session.user.name,
    action: "kyc.approve",
    resource: `kyc:${kycId}`,
    metadata: {
      targetUserId: doc.userId,
      docType: doc.docType,
      assignedRole: "kyc-verified",
    },
  });

  revalidatePath("/kyc/admin");
  revalidatePath("/kyc");
}

export async function rejectKyc(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("unauthenticated");
  ensureReviewer(session.user.roles ?? []);

  const kycId = parseInt(String(formData.get("kycId") ?? ""), 10);
  const note = String(formData.get("note") ?? "").trim();
  if (!kycId) throw new Error("missing kycId");

  await db
    .update(kycDocuments)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewerNote:
        note || `Rejected by ${session.user.name ?? session.user.id}`,
    })
    .where(eq(kycDocuments.id, kycId));

  await logAudit({
    actorId: session.user.id,
    actorName: session.user.name,
    action: "kyc.reject",
    resource: `kyc:${kycId}`,
    metadata: { note: note || undefined },
  });

  revalidatePath("/kyc/admin");
}
