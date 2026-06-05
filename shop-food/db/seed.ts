/**
 * Seed thực đơn mẫu cho ShopFood. Không phụ thuộc user (khác seed ShopSell):
 * chỉ thêm món nếu bảng đang trống. Idempotent — chạy lại nhiều lần an toàn.
 *
 *   npm --prefix shop-food run db:seed
 */
import "./loadEnv";
import { db } from "./index";
import { menuItems } from "./schema";
import { sql } from "drizzle-orm";

const DEMO = [
  { name: "Phở bò tái", priceVnd: 55_000, description: "Phở bò truyền thống, nước dùng hầm xương 12h." },
  { name: "Bún chả Hà Nội", priceVnd: 50_000, description: "Chả nướng than hoa, ăn kèm bún và rau sống." },
  { name: "Cơm tấm sườn bì chả", priceVnd: 60_000, description: "Sườn nướng, bì, chả trứng, nước mắm chua ngọt." },
  { name: "Bánh mì thịt nguội", priceVnd: 25_000, description: "Bánh mì giòn, pate, thịt nguội, đồ chua." },
  { name: "Trà sữa trân châu", priceVnd: 35_000, description: "Trà sữa béo, trân châu đường đen." },
  { name: "Cà phê sữa đá", priceVnd: 30_000, description: "Cà phê phin truyền thống, sữa đặc." },
];

async function main() {
  console.log("→ seeding ShopFood menu...");

  const existing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(menuItems);

  if ((existing[0]?.count ?? 0) > 0) {
    console.log("  Đã có món trong thực đơn, skip.");
    process.exit(0);
  }

  await db.insert(menuItems).values(
    DEMO.map((d) => ({
      name: d.name,
      priceVnd: d.priceVnd,
      description: d.description,
      available: true,
    }))
  );

  console.log(`✓ ${DEMO.length} món seeded.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
