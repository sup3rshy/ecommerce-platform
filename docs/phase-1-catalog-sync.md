# Phase 1 — Đồng bộ catalog ShopSell → ShopEcommerce

Tài liệu để **kiểm tra và xác nhận** Phase 1 trước khi sang Phase 2. Bám theo
[PLAN.md](../PLAN.md) mục Phase 1 và [TODO.md](../TODO.md).

## 1. Mục tiêu (theo PLAN)

- ShopSell là **source of truth** cho catalog: người bán tạo/sửa/ẩn/xoá sản phẩm ở đây.
- ShopEcommerce giữ **bản sao đọc** (read-copy) để hiển thị storefront, KHÔNG sửa catalog trực tiếp.
- Đồng bộ **một chiều** ShopSell → ShopEcommerce, ký **HMAC-SHA256** bằng `CATALOG_SYNC_SECRET`.
- Idempotent theo `(sellerId, sku)`. Có **outbox + retry** chịu lỗi mạng. Có **backfill** lần đầu.

## 2. Luồng đồng bộ

```
[ShopSell :3100]                                  [ShopEcommerce :3000]
 /products (UI CRUD)                               storefront (chỉ đọc)
   │ create/update/hide/delete                        ▲
   ▼                                                  │ đọc status='active'
 products (DB seller_workspace)                    products (DB ecommerce, read-copy)
   │ ghi catalog_outbox                                ▲
   ▼ ký HMAC(CATALOG_SYNC_SECRET) + POST              │ verify HMAC, upsert (sellerId,sku)
 lib/catalogSync.ts ───────────────────────────────►  /api/internal/catalog/upsert
                                              └─────►  /api/internal/catalog/delete (soft-delete)
```

- Mỗi thay đổi ghi 1 row `catalog_outbox` (pending) rồi gửi ngay. Lỗi mạng → `failed`,
  được gửi lại bởi `flushOutbox()` (gọi opportunistic đầu mỗi action, hoặc `npm run catalog:flush`).
- Chữ ký dùng **canonical JSON** (sort key + `JSON.stringify`) thay vì nối `&` như payment
  `sig.ts` — an toàn hơn khi tên/mô tả chứa ký tự `&`/`=` (chống delimiter-injection).

## 3. Files đã thay đổi (để review)

ShopSell (source of truth):
- `shop-sell/db/schema.ts` — thêm bảng `products` (unique `(seller_id, sku)`) và `catalog_outbox`.
- `shop-sell/lib/catalogSig.ts` — ký HMAC (canonical JSON).
- `shop-sell/lib/catalogSync.ts` — outbox: `syncUpsert` / `syncDelete` / `flushOutbox` / `flushOutboxQuietly`.
- `shop-sell/app/products/page.tsx` — UI CRUD + server action (guard `seller`/`ecommerce_admin`/`admin`).
- `shop-sell/app/components/TopBar.tsx` — thêm nav "Sản phẩm".
- `shop-sell/proxy.ts`, `shop-sell/app/layout.tsx` — thêm role `ecommerce_admin` vào allowlist.
- `shop-sell/db/loadEnv.ts` — nạp `.env` cho script tsx.
- `shop-sell/db/seed.ts` — seed catalog mẫu cho `seller1`.
- `shop-sell/db/backfill.ts` — đẩy toàn bộ sản phẩm sang ShopEcommerce (lần đầu).
- `shop-sell/db/flush.ts` — gửi lại outbox còn kẹt.
- `shop-sell/package.json` — thêm `tsx` + script `db:seed` / `catalog:backfill` / `catalog:flush`.
- `shop-sell/.env.example` — thêm `CATALOG_SYNC_SECRET` + `SHOP_ECOMMERCE_INTERNAL_URL`.

ShopEcommerce (read-copy):
- `shop-ecommerce/db/schema.ts` — `products` thêm `seller_id`, `sku`, `status`, `updated_at` + unique `(seller_id, sku)`.
- `shop-ecommerce/lib/catalogSig.ts` — verify HMAC (cùng canonical JSON).
- `shop-ecommerce/app/api/internal/catalog/upsert/route.ts` — verify + find-or-create store + upsert idempotent.
- `shop-ecommerce/app/api/internal/catalog/delete/route.ts` — verify + soft-delete (`status='deleted'`).
- `shop-ecommerce/app/page.tsx`, `app/product/[id]/page.tsx`, `app/api/cart/route.ts` — chỉ phục vụ `status='active'`.
- `shop-ecommerce/app/seller/page.tsx` — Phase 1 chuyển sang chỉ-xem; **đã xoá hẳn sau Phase 1**
  (xem mục 8). Người bán quản lý ở ShopSell.
- `shop-ecommerce/db/seed.ts` — **đã xoá** (catalog seed bây giờ ở ShopSell).

Wiring:
- `scripts/bootstrap.sh` — sinh `CATALOG_SYNC_SECRET`, ghi vào `shop-sell/.env` + `shop-ecommerce/.env`; shop-sell thêm `SHOP_ECOMMERCE_INTERNAL_URL`.
- `scripts/reset.sh` — bỏ seed ecommerce; hướng dẫn seed ShopSell + backfill.

## 4. Quyết định thiết kế (cần bạn xác nhận)

1. **Stock do người bán quyết định** (đồng bộ từ ShopSell). Việc trừ tồn khi mua ở
   ShopEcommerce là trạng thái runtime cục bộ, sẽ bị ghi đè ở lần sync sau. Đúng theo
   PLAN (stock là field đồng bộ). Production cần event/webhook nếu muốn consistency mạnh.
2. **Xoá = soft-delete** (`status='deleted'`) ở ShopEcommerce để giữ lịch sử đơn hàng
   (orders.productId vẫn trỏ hợp lệ). Storefront chỉ hiện `active`.
3. **ShopEcommerce không còn quản lý sản phẩm**: Phase 1 trang `/seller` thành chỉ-xem; sau Phase 1 đã
   xoá hẳn trang này. Người bán quản lý sản phẩm và đơn hàng ở ShopSell (xem mục 8).
4. **storeName** lấy từ tên hiển thị của seller (session/user_profile); ShopEcommerce
   find-or-create `stores` theo `ownerId = sellerId`.

Nếu muốn khác (vd stock do storefront quản lý, hoặc hard-delete), báo để tôi sửa.

## 5. Cách chạy + kiểm thử

Chuẩn bị (mỗi app cần deps riêng — chưa có npm workspace):
```bash
bash scripts/bootstrap.sh          # sinh secret + .env (gồm CATALOG_SYNC_SECRET khớp 2 app)
bash scripts/reset.sh              # wipe + up infra + push schema (gồm products/outbox ShopSell)
# cài deps từng app nếu chưa:
( cd shop-ecommerce && npm install ) && ( cd shop-sell && npm install ) && ( cd shop-pay && npm install )
npm run dev                        # chạy 3 app (3000/3100/3200)
```

Kịch bản kiểm thử (mỗi cái mở incognito mới):

- **T1 — Tạo phản ánh storefront**: login `seller1` ở http://localhost:3100 → `/products`
  → thêm 1 sản phẩm. Mở http://localhost:3000 → thấy sản phẩm xuất hiện. ✅ PLAN test chính.
- **T2 — Sửa phản ánh**: sửa giá/tên ở `/products` → reload :3000 → giá/tên cập nhật.
- **T3 — Ẩn**: bấm "Ẩn" ở `/products` → :3000 không còn thấy sản phẩm; bấm "Hiện" → thấy lại.
- **T4 — Xoá**: bấm "Xóa" → :3000 ẩn sản phẩm (soft-delete), lịch sử đơn cũ vẫn còn.
- **T5 — Chữ ký sai bị từ chối** (PLAN test bảo mật):
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/internal/catalog/upsert \
    -H 'Content-Type: application/json' \
    -d '{"data":{"event":"upsert","sellerId":"x","sku":"y","name":"hack","price":1,"stock":1,"status":"active","description":null,"imageUrl":null,"storeName":"x","ts":1},"sig":"deadbeef"}'
  # Kỳ vọng: 401
  ```
- **T6 — Backfill**: sau khi login seller1 1 lần, chạy
  `npm --prefix shop-sell run db:seed` rồi `npm --prefix shop-sell run catalog:backfill`
  → storefront :3000 có 6 sản phẩm mẫu.
- **T7 — Outbox retry**: tắt :3000, thêm sản phẩm ở :3100 (action vẫn thành công, row outbox =
  `failed`). Bật lại :3000, chạy `npm --prefix shop-sell run catalog:flush` → sản phẩm xuất hiện.
  Kiểm tra: `psql .../seller_workspace -c "select event_type,status,attempts from catalog_outbox;"`
- **T8 — ShopEcommerce không có trang người bán**: http://localhost:3000/seller không còn tồn tại
  (đã xoá). Quản lý sản phẩm + đơn hàng ở ShopSell (:3100 `/products`, `/orders`).

## 6. Đã verify tự động

- HMAC sign/verify (round-trip qua JSON, unicode/null, tamper, event-swap replay, chống `&=` collision): **7/7 pass**.
- `tsc --noEmit`: toàn bộ file Phase 1 **type-clean**.

## 7. Lưu ý / nợ kỹ thuật (không thuộc Phase 1)

- Còn 3 lỗi TypeScript **có sẵn từ trước** ở ShopEcommerce (ngoài phạm vi Phase 1, xem TODO.md):
  `app/api/reviews/route.ts` + `app/components/ReviewList.tsx` (bảng `reviews` chưa có),
  `app/api/admin/users/role/route.ts` (sai đường dẫn import `lib/keycloak-admin`).
  Chúng KHÔNG ảnh hưởng `npm run dev`, nhưng sẽ làm `next build` fail → **cần dọn trước khi
  container hóa** (giai đoạn deploy-prep).
- Replay nonce table cho catalog: hiện dựa vào idempotency `(sellerId, sku)`; production có thể thêm.

## 8. Cập nhật sau Phase 1 — gỡ trang người bán khỏi ShopEcommerce

Quyết định: ShopEcommerce chỉ còn là storefront cho buyer (+ admin). Toàn bộ phần quản lý
của người bán dồn về ShopSell. Lý do: tránh trùng lặp UI người bán ở hai nơi sau khi Phase 1
đã đưa source-of-truth sản phẩm về ShopSell.

Đã xoá ở ShopEcommerce:
- `app/seller/page.tsx` (dashboard người bán), `app/components/SellerOrdersPanel.tsx`,
  `app/api/orders/[orderId]/status/route.ts` (đường cập nhật trạng thái đơn cũ, session-based).
- Link điều hướng `/seller` trong `SidebarNav` và CTA "Vào trang Người Bán" ở trang chủ.

Giữ nguyên: luồng buyer tự đăng ký lên seller (`/seller/register` + `/api/seller/register`) và
phần admin duyệt yêu cầu (`/admin/users`). Bảng `stores`/`products` là cốt lõi catalog-sync, giữ.

Chuyển sang ShopSell — quản lý đơn hàng (`/orders`):
- Đơn hàng vẫn lưu ở DB `ecommerce`. ShopSell KHÔNG nối DB đó mà gọi endpoint nội bộ của
  ShopEcommerce, ký HMAC bằng `CATALOG_SYNC_SECRET` (cùng kênh tin cậy với catalog sync).
- ShopEcommerce: `app/api/internal/orders/list` (liệt kê đơn theo gian hàng) +
  `app/api/internal/orders/status` (đổi trạng thái, kiểm tra sở hữu + transition pending→shipping→completed).
- ShopSell: `lib/orderSync.ts` (ký + gọi), `app/orders/page.tsx` (guard `seller`/`ecommerce_admin`/`admin`,
  server action đổi trạng thái), link "Đơn hàng" trong TopBar.
- Phạm vi: `seller` chỉ thấy/sửa đơn gian hàng mình; `ecommerce_admin`/`admin` thấy mọi đơn (scope `all`,
  do ShopSell quyết định sau khi verify role rồi mới ký).

Kiểm thử thủ công:
- Login seller ở :3100 → `/orders` thấy đơn của gian hàng; bấm "Đánh dấu đang giao" → trạng thái đổi.
- Chữ ký sai bị từ chối:
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/internal/orders/list \
    -H 'Content-Type: application/json' -d '{"data":{"event":"orders.list","sellerId":"x","all":false,"ts":1},"sig":"deadbeef"}'
  # Kỳ vọng: 401
  ```
