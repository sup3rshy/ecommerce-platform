/**
 * Gửi lại các sự kiện catalog còn kẹt (status pending/failed) trong outbox.
 * Chạy tay khi ShopEcommerce vừa khôi phục: `npm run catalog:flush`.
 */
import "./loadEnv";
import { flushOutbox } from "../lib/catalogSync";

async function main() {
  const n = await flushOutbox();
  console.log(`✓ flushed ${n} sự kiện.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
