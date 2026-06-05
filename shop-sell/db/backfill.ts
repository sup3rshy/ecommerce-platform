/**
 * Backfill: đẩy TẤT CẢ sản phẩm hiện có trong ShopSell sang ShopEcommerce (lần đầu).
 * Idempotent: ShopEcommerce upsert theo (sellerId, sku) nên chạy lại an toàn.
 *
 * Yêu cầu: ShopEcommerce đang chạy (SHOP_ECOMMERCE_INTERNAL_URL reachable) và
 * CATALOG_SYNC_SECRET khớp hai bên. Chạy: `npm run catalog:backfill`.
 */
import "./loadEnv";
import { db } from "./index";
import { products, userProfile } from "./schema";
import { syncUpsert, flushOutbox } from "../lib/catalogSync";

async function main() {
  const rows = await db.select().from(products);
  console.log(`→ backfill ${rows.length} sản phẩm sang ShopEcommerce...`);

  // Map sellerId -> tên hiển thị (làm storeName bên storefront).
  const profiles = await db.select().from(userProfile);
  const nameBySub = new Map(profiles.map((p) => [p.sub, p.name ?? p.preferredUsername ?? null]));

  for (const p of rows) {
    await syncUpsert({
      sellerId: p.sellerId,
      sku: p.sku,
      name: p.name,
      price: p.priceVnd,
      stock: p.stock,
      status: p.status,
      description: p.description,
      imageUrl: p.imageUrl,
      storeName: nameBySub.get(p.sellerId) || `Shop ${p.sellerId.slice(0, 6)}`,
    });
  }

  // syncUpsert ghi outbox + gửi ngay; flush thêm để chắc các row failed được gửi lại.
  const flushed = await flushOutbox();
  console.log(`✓ backfill xong. flush thêm ${flushed} sự kiện còn kẹt.`);
  console.log("  Kiểm tra bảng catalog_outbox: status='failed' nghĩa là ShopEcommerce chưa reachable hoặc secret lệch.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
