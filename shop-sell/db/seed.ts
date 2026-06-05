/**
 * Seed catalog mẫu cho ShopSell (source of truth). Gán cho `seller1`.
 *
 * Cần `seller1` đã login ShopSell ÍT NHẤT 1 lần để user_profile có sub thật
 * (jwt callback sync). Nếu chưa, script thoát và nhắc login trước.
 *
 * Sau khi seed: chạy `npm run catalog:backfill` (cần ShopEcommerce đang chạy) để
 * đẩy sang storefront. Hoặc đơn giản: thêm sản phẩm trực tiếp ở UI /products
 * (tự đồng bộ ngay).
 */
import "./loadEnv";
import { db } from "./index";
import { products, userProfile } from "./schema";
import { eq, sql } from "drizzle-orm";

const DEMO = [
  { sku: "tai-nghe-bt", name: "Tai nghe Bluetooth", price: 450_000, stock: 50, description: "Pin 30h, chống ồn chủ động." },
  { sku: "sac-gan-65w", name: "Sạc nhanh GaN 65W", price: 280_000, stock: 100, description: "3 cổng USB-C/A, sạc cùng lúc 3 thiết bị." },
  { sku: "ban-phim-tkl", name: "Bàn phím cơ TKL", price: 1_200_000, stock: 20, description: "Hot-swap, blue switch." },
  { sku: "ao-thun-cotton", name: "Áo thun cotton 100%", price: 180_000, stock: 200, description: "Form rộng, 5 màu." },
  { sku: "quan-jeans-slim", name: "Quần jeans slim-fit", price: 520_000, stock: 80, description: null },
  { sku: "giay-sneaker", name: "Giày sneaker đế bệt", price: 750_000, stock: 40, description: null },
];

async function main() {
  console.log("→ seeding ShopSell catalog...");

  const profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.preferredUsername, "seller1"))
    .limit(1);

  const sellerId = profile[0]?.sub;
  if (!sellerId) {
    console.log("⚠ seller1 chưa login lần nào — không biết sellerId.");
    console.log("  Login `seller1` ở http://localhost:3100 (sync user_profile), rồi rerun.");
    process.exit(0);
  }

  const existing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.sellerId, sellerId));

  if (existing[0].count > 0) {
    console.log("  Đã có sản phẩm cho seller1, skip.");
    process.exit(0);
  }

  await db.insert(products).values(
    DEMO.map((d) => ({
      sellerId,
      sku: d.sku,
      name: d.name,
      priceVnd: d.price,
      stock: d.stock,
      status: "active",
      description: d.description,
    }))
  );

  console.log(`✓ ${DEMO.length} sản phẩm seeded cho seller1.`);
  console.log("  Tiếp theo: `npm run catalog:backfill` (cần ShopEcommerce :3000 đang chạy).");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
