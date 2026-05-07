/**
 * Seed sample data: 2 store + 6 product. Idempotent.
 *
 * Strategy: chờ user `seller1` login lần đầu → user_profile có sub → dùng sub đó
 * làm ownerId. Nếu chưa login, để placeholder; lần sau chạy seed sẽ tự fix.
 */
import { db } from "./index";
import { stores, products, userProfile } from "./schema";
import { sql, eq } from "drizzle-orm";

async function main() {
  console.log("→ seeding ecommerce data...");

  // Tìm sub thật của seller1 nếu đã login
  const profile = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.preferredUsername, "seller1"))
    .limit(1);

  const sellerId =
    profile[0]?.sub ??
    "PLACEHOLDER_SELLER1_SUB__login seller1 1 lần rồi rerun seed";

  if (!profile[0]) {
    console.log("⚠ seller1 chưa login lần nào — ownerId sẽ là placeholder.");
    console.log("  Login `seller1` ở :3000 trước (sync user_profile), rồi rerun.");
  }

  const existing = await db.select({ count: sql<number>`count(*)::int` }).from(stores);
  if (existing[0].count > 0) {
    console.log("  Đã có store, chỉ update owner_id nếu cần...");
    if (profile[0]) {
      await db
        .update(stores)
        .set({ ownerId: sellerId })
        .where(sql`${stores.ownerId} LIKE 'PLACEHOLDER_%'`);
      console.log("  ✓ updated placeholder owner_id");
    }
    return;
  }

  const [store1] = await db
    .insert(stores)
    .values({ ownerId: sellerId, name: "Shop Điện Tử Demo" })
    .returning();
  const [store2] = await db
    .insert(stores)
    .values({ ownerId: sellerId, name: "Shop Thời Trang Demo" })
    .returning();

  await db.insert(products).values([
    {
      storeId: store1.id,
      name: "Tai nghe Bluetooth",
      price: 450_000,
      stock: 50,
      description: "Pin 30h, chống ồn chủ động.",
    },
    {
      storeId: store1.id,
      name: "Sạc nhanh GaN 65W",
      price: 280_000,
      stock: 100,
      description: "3 cổng USB-C/A, sạc cùng lúc 3 thiết bị.",
    },
    {
      storeId: store1.id,
      name: "Bàn phím cơ TKL",
      price: 1_200_000,
      stock: 20,
      description: "Hot-swap, blue switch.",
    },
    {
      storeId: store2.id,
      name: "Áo thun cotton 100%",
      price: 180_000,
      stock: 200,
      description: "Form rộng, 5 màu.",
    },
    {
      storeId: store2.id,
      name: "Quần jeans slim-fit",
      price: 520_000,
      stock: 80,
    },
    {
      storeId: store2.id,
      name: "Giày sneaker đế bệt",
      price: 750_000,
      stock: 40,
    },
  ]);

  console.log("✓ 2 store + 6 product seeded");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .then(() => process.exit(0));
