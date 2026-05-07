import { db } from "../db";
import { auditLogs } from "../db/schema";
import { headers } from "next/headers";

/**
 * Ghi audit log cho 1 action. Gọi từ server action sau khi action thành công.
 * Không throw nếu log fail — không muốn audit error làm hỏng business operation.
 */
export async function logAudit(args: {
  actorId: string;
  actorName?: string | null;
  action: string;
  resource?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    let ipAddress: string | null = null;
    try {
      const h = await headers();
      ipAddress =
        h.get("x-forwarded-for")?.split(",")[0].trim() ??
        h.get("x-real-ip") ??
        null;
    } catch {
      // headers() có thể fail trong context nhất định
    }

    await db.insert(auditLogs).values({
      actorId: args.actorId,
      actorName: args.actorName ?? null,
      action: args.action,
      resource: args.resource ?? null,
      metadata: args.metadata ?? null,
      ipAddress,
    });
  } catch (err) {
    console.error("[audit] log failed:", err);
  }
}
