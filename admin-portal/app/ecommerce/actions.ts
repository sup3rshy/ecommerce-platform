"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "../api/auth/[...nextauth]/route";
import { logAudit } from "../../lib/audit";
import { approveUpgradeRequest, rejectUpgradeRequest } from "../../lib/platformData";
import { canManageEcommerce } from "../../lib/scope";

async function requireEcommerceAdmin() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles ?? [];
  if (!session?.user?.id || !canManageEcommerce(roles)) {
    throw new Error("Forbidden: cần role admin hoặc ecommerce_admin");
  }
  return session;
}

export async function approveSellerRequest(formData: FormData) {
  const session = await requireEcommerceAdmin();
  const requestId = Number(formData.get("requestId"));
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new Error("Mã yêu cầu không hợp lệ.");
  }

  const request = await approveUpgradeRequest(requestId, session.user.id!, "seller");

  await logAudit({
    actorId: session.user.id!,
    actorName: session.user.name,
    action: "seller-request.approve",
    resource: `request:${request.id}`,
    metadata: { userId: request.userId, storeName: request.storeName },
  });
  revalidatePath("/ecommerce");
  revalidatePath("/users");
}

export async function rejectSellerRequest(formData: FormData) {
  const session = await requireEcommerceAdmin();
  const requestId = Number(formData.get("requestId"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new Error("Mã yêu cầu không hợp lệ.");
  }

  const request = await rejectUpgradeRequest(requestId, session.user.id!, reason, "seller");

  await logAudit({
    actorId: session.user.id!,
    actorName: session.user.name,
    action: "seller-request.reject",
    resource: `request:${request.id}`,
    metadata: { userId: request.userId, storeName: request.storeName, reason },
  });
  revalidatePath("/ecommerce");
}
