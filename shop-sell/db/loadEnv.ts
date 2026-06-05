// Nạp biến môi trường từ .env cho các script chạy bằng tsx (tsx KHÔNG tự nạp .env
// như Next.js). PHẢI được import ĐẦU TIÊN, trước db/index.ts và lib/catalogSync.ts,
// vì các module đó đọc process.env ngay lúc import (tạo Pool / set TARGET).
import { readFileSync } from "node:fs";

try {
  const content = readFileSync(".env", "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // Không có .env (vd CI) — bỏ qua, dựa vào env đã export.
}
