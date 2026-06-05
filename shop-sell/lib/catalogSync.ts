import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { catalogOutbox } from "../db/schema";
import { signCatalog } from "./catalogSig";

/**
 * Đồng bộ một chiều ShopSell -> ShopEcommerce.
 *
 * Cơ chế tin cậy (outbox):
 *  1. Mỗi thay đổi sản phẩm ghi 1 row vào `catalog_outbox` (status=pending).
 *  2. Gửi ngay tới ShopEcommerce. Thành công -> status=sent; lỗi mạng -> status=failed.
 *  3. `flushOutbox()` gửi lại các row pending/failed (gọi opportunistic trước mỗi
 *     action, hoặc chạy tay: `npm run catalog:flush`).
 *
 * Idempotent ở phía nhận theo (sellerId, sku) nên gửi lại nhiều lần là an toàn.
 */

const TARGET =
  process.env.SHOP_ECOMMERCE_INTERNAL_URL ?? "http://localhost:3000";

export type CatalogUpsertData = {
  event: "upsert";
  sellerId: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
  status: string; // active | hidden
  description: string | null;
  imageUrl: string | null;
  storeName: string;
  ts: number;
};

export type CatalogDeleteData = {
  event: "delete";
  sellerId: string;
  sku: string;
  ts: number;
};

type CatalogData = CatalogUpsertData | CatalogDeleteData;

async function postSigned(path: string, data: CatalogData): Promise<void> {
  const sig = signCatalog(data as unknown as Record<string, unknown>);
  const resp = await fetch(`${TARGET}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, sig }),
    cache: "no-store",
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`sync ${path} HTTP ${resp.status}: ${text}`);
  }
}

function pathFor(event: CatalogData["event"]): string {
  return event === "delete"
    ? "/api/internal/catalog/delete"
    : "/api/internal/catalog/upsert";
}

// Ghi outbox rồi thử gửi ngay. Không throw cho caller: lỗi mạng không được làm
// hỏng business action — row failed sẽ được flush lại sau.
async function enqueue(data: CatalogData): Promise<void> {
  const [row] = await db
    .insert(catalogOutbox)
    .values({
      eventType: data.event,
      sellerId: data.sellerId,
      sku: data.sku,
      payload: data,
      status: "pending",
    })
    .returning({ id: catalogOutbox.id });

  try {
    await postSigned(pathFor(data.event), data);
    await db
      .update(catalogOutbox)
      .set({ status: "sent", attempts: 1, sentAt: new Date() })
      .where(eq(catalogOutbox.id, row.id));
  } catch (err) {
    await db
      .update(catalogOutbox)
      .set({
        status: "failed",
        attempts: 1,
        lastError: err instanceof Error ? err.message : String(err),
      })
      .where(eq(catalogOutbox.id, row.id));
    console.warn("[catalogSync] enqueue send failed (queued for retry):", err);
  }
}

export async function syncUpsert(
  p: Omit<CatalogUpsertData, "event" | "ts">
): Promise<void> {
  await enqueue({ event: "upsert", ts: Date.now(), ...p });
}

export async function syncDelete(
  p: Omit<CatalogDeleteData, "event" | "ts">
): Promise<void> {
  await enqueue({ event: "delete", ts: Date.now(), ...p });
}

/**
 * Gửi lại các sự kiện chưa gửi thành công. Trả về số row đã gửi thành công.
 */
export async function flushOutbox(): Promise<number> {
  const pending = await db
    .select()
    .from(catalogOutbox)
    .where(inArray(catalogOutbox.status, ["pending", "failed"]));

  let sent = 0;
  for (const row of pending) {
    const data = row.payload as CatalogData;
    try {
      await postSigned(pathFor(data.event), data);
      await db
        .update(catalogOutbox)
        .set({
          status: "sent",
          attempts: row.attempts + 1,
          sentAt: new Date(),
          lastError: null,
        })
        .where(eq(catalogOutbox.id, row.id));
      sent++;
    } catch (err) {
      await db
        .update(catalogOutbox)
        .set({
          status: "failed",
          attempts: row.attempts + 1,
          lastError: err instanceof Error ? err.message : String(err),
        })
        .where(eq(catalogOutbox.id, row.id));
    }
  }
  return sent;
}

// Gọi opportunistic ở đầu mỗi server action: thử đẩy lại các sự kiện còn kẹt,
// nhưng không để lỗi flush làm hỏng action hiện tại.
export async function flushOutboxQuietly(): Promise<void> {
  try {
    await flushOutbox();
  } catch (err) {
    console.warn("[catalogSync] opportunistic flush failed:", err);
  }
}
