import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export async function logAudit(params: {
  storeId?: number;
  actorId: string;
  action: string;
  resource?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({
    storeId: params.storeId ?? null,
    actorId: params.actorId,
    action: params.action,
    resource: params.resource ?? null,
    metadata: params.metadata ?? null,
  });
}
