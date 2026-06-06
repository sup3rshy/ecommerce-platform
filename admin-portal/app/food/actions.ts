"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "../../lib/authOptions";
import { logAudit } from "../../lib/audit";
import {
  advanceFoodOrderStatus,
  approveUpgradeRequest,
  rejectUpgradeRequest,
  toggleFoodMenuAvailability,
} from "../../lib/platformData";
import { canManageFood } from "../../lib/scope";

async function requireFoodAdmin() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles ?? [];
  if (!session?.user?.id || !canManageFood(roles)) {
    throw new Error("Forbidden: cần role admin hoặc food_admin");
  }
  return session;
}

export async function approveFoodSellerRequest(formData: FormData) {
  const session = await requireFoodAdmin();
  const requestId = Number(formData.get("requestId"));
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new Error("Mã yêu cầu không hợp lệ.");
  }

  const request = await approveUpgradeRequest(requestId, session.user.id!, "food-seller");
  await logAudit({
    actorId: session.user.id!,
    actorName: session.user.name,
    action: "food-seller-request.approve",
    resource: `request:${request.id}`,
    metadata: { userId: request.userId, restaurantName: request.storeName },
  });
  revalidatePath("/food");
  revalidatePath("/users");
}

export async function rejectFoodSellerRequest(formData: FormData) {
  const session = await requireFoodAdmin();
  const requestId = Number(formData.get("requestId"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new Error("Mã yêu cầu không hợp lệ.");
  }

  const request = await rejectUpgradeRequest(requestId, session.user.id!, reason, "food-seller");
  await logAudit({
    actorId: session.user.id!,
    actorName: session.user.name,
    action: "food-seller-request.reject",
    resource: `request:${request.id}`,
    metadata: { userId: request.userId, restaurantName: request.storeName, reason },
  });
  revalidatePath("/food");
}

export async function advanceFoodOrder(formData: FormData) {
  const session = await requireFoodAdmin();
  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("Mã đơn không hợp lệ.");
  }

  const status = await advanceFoodOrderStatus(orderId, session.user.id!);
  await logAudit({
    actorId: session.user.id!,
    actorName: session.user.name,
    action: "food.order.status",
    resource: `food-order:${orderId}`,
    metadata: { status },
  });
  revalidatePath("/food");
}

export async function toggleFoodMenuItem(formData: FormData) {
  const session = await requireFoodAdmin();
  const itemId = Number(formData.get("itemId"));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new Error("Mã món không hợp lệ.");
  }

  const available = await toggleFoodMenuAvailability(itemId, session.user.id!);
  await logAudit({
    actorId: session.user.id!,
    actorName: session.user.name,
    action: "food.menu.toggle",
    resource: `menu-item:${itemId}`,
    metadata: { available },
  });
  revalidatePath("/food");
}
