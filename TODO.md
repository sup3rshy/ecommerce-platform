# TODO - Checklist nhiệm vụ

Bám theo các phase trong [PLAN.md](PLAN.md). `[x]` đã xong, `[ ]` chưa làm.

## Phase 0 — Tái cấu trúc & dọn dẹp

- [x] Đổi tên thư mục: `web-app`->`shop-ecommerce`, `seller-workspace`->`shop-sell`, `shoppay`->`shop-pay`.
- [x] Scaffold `shop-food` (:3300, DB `shopfood`) và `admin-portal` (:3400).
- [x] Thêm per-platform admin roles vào realm: `ecommerce_admin`, `food_admin`, `pay_admin` (`sell_admin` đã gộp vào `ecommerce_admin`).
- [x] Khai OIDC client `shopfood-app`, `admin-portal`; wire secret `.env` -> `docker-compose` -> `entrypoint.sh`.
- [x] Cập nhật `package.json`, `bootstrap.sh`, `reset.sh`, `init-app-dbs.sql`, `nginx.conf` theo tên mới.
- [x] Gỡ Kong khỏi toàn bộ tài liệu (chỉ dùng Nginx).
- [x] Gỡ FreeIPA khỏi `docker-compose.yml` + xoá `scripts/freeipa-seed.sh`.
- [x] Xoá thư mục lồng thừa `shop-ecommerce/web-app/`.
- [x] Thêm `LDAP_*` và `CATALOG_SYNC_SECRET` vào `.env.example`.
- [ ] (Tùy chọn) Đồng bộ client ID theo tên thư mục (`nextjs-app`->`shop-ecommerce`...). Hiện giữ tên cũ.

## Phase 1 — ShopSell <-> ShopEcommerce: tách DB + đồng bộ catalog

> Đã triển khai. Hướng dẫn kiểm thử + danh sách file: [docs/phase-1-catalog-sync.md](docs/phase-1-catalog-sync.md).

- [x] Audit `shop-ecommerce/db/schema.ts` và `shop-sell/db/schema.ts`; chốt trường sản phẩm chung (`sellerId, sku, name, price, stock, status, description, imageUrl`).
- [x] Thêm bảng `products` (+ `catalog_outbox`) vào DB `seller_workspace`.
- [x] UI CRUD sản phẩm trong ShopSell (`/products`), guard `seller`/`ecommerce_admin`/`admin`.
- [x] Endpoint `POST /api/internal/catalog/upsert` + `/delete` ở ShopEcommerce, verify HMAC `CATALOG_SYNC_SECRET`, idempotent theo `(sellerId, sku)`.
- [x] Gọi sync khi seller tạo/sửa/xoá/ẩn sản phẩm; outbox + retry (`flushOutbox` / `catalog:flush`).
- [x] ShopEcommerce chỉ đọc bản sao catalog (storefront lọc `status='active'`).
- [x] Gỡ trang người bán khỏi ShopEcommerce; quản lý đơn hàng chuyển sang ShopSell `/orders` (HMAC nội bộ). Xem [docs/phase-1-catalog-sync.md](docs/phase-1-catalog-sync.md) mục 8.
- [x] Script backfill (`shop-sell` `db:seed` + `catalog:backfill`).
- [x] `bootstrap.sh` ghi `CATALOG_SYNC_SECRET` vào `shop-sell/.env` và `shop-ecommerce/.env`.
- [ ] Kiểm thử end-to-end T1-T8 (chạy stack thật) — xem [docs/phase-1-catalog-sync.md](docs/phase-1-catalog-sync.md). HMAC contract + typecheck đã verify tự động.

## Phase 2 — Xây ShopFood

- [x] NextAuth route + `lib/refreshAccessToken.ts`, cookie `shopfood.session-token` (authOptions export trong route, theo convention các app khác).
- [x] `lib/syncUserProfile.ts` + bảng `user_profile` trong `shopfood`.
- [x] Role guard `buyer` (đặt món) và `food_admin` (quản trị); redirect `/denied` (proxy + page guard).
- [x] Frontchannel logout endpoint + `SingleLogoutWatcher` + providers (client `shopfood-app` đã có `frontchannel.logout.url` trong realm).
- [x] Schema menu/giỏ/đơn món (`menu_items`, `food_cart_items`, `food_orders`, `food_order_items`, `audit_logs`); trang thực đơn (`/`), giỏ (`/cart`), đơn của tôi (`/orders`), quản trị (`/admin`).
- [x] Thêm `shop-food` vào `npm run dev`/`dev:webpack`, root `db:push`, push schema trong `reset.sh`, warmup `:3300`; seed thực đơn (`db:seed`).
- [ ] (Tùy chọn, hoãn) thanh toán qua ShopPay (tái dùng HMAC payment).
- [ ] Kiểm thử end-to-end (chạy stack thật): SSO login :3300, đặt món, SLO đồng bộ. Typecheck đã verify tự động.

## Phase 3 — Xây Admin Portal (DONE)

- [x] NextAuth + guard role admin nền tảng, cookie `admin-portal.session-token` (`proxy.ts` chặn `/ecommerce`,`/food`,`/users`,`/kyc`,`/audit`).
- [x] `lib/keycloakAdmin.ts` dùng `backend-admin-client` (list user + count, gán/thu hồi role, list realm roles, bật/tắt user).
- [x] Màn hình tập trung: `/ecommerce` (gian hàng/catalog/đơn/yêu cầu seller), `/food` (nhà hàng/menu/đơn/yêu cầu food-seller), `/users` (danh sách + lọc theo role + gán/thu hồi + bật/tắt), `/kyc`, `/audit`, dashboard `/`.
- [x] Phân quyền per-platform (`lib/scope.ts`): `ecommerce_admin` quản lý buyer/seller/staff + shop binding; `food_admin` quản lý buyer/food-seller; `pay_admin` quản lý wallet/KYC; `admin` toàn quyền. KYC chỉ `admin`/`pay_admin`. Bật/tắt user chỉ `admin`.
- [x] Frontchannel logout endpoint + `SingleLogoutWatcher`.
- [x] DB riêng `admin_portal` (bảng `audit_logs` + cache `user_profile`); wire vào `init-app-dbs.sql`, `bootstrap.sh`, `db:push`, `reset.sh`, `warmup.sh`.
- [x] Thêm `admin-portal` vào `npm run dev` (+ `dev:webpack`).
- [x] Smoke: app boot (:3400), guard 307->signin, providers OK, Admin API qua `backend-admin-client`, `tsc --noEmit` sạch.
- [x] Đồng nhất role admin Ecommerce: gỡ `sell_admin`, dùng `ecommerce_admin` cho ShopEcommerce + ShopSell; migrate live realm không reset.
- [x] Thêm user demo `buyer2` và `buyer3` (role `buyer`) vào realm JSON + live Keycloak.
- [ ] Test end-to-end qua trình duyệt: login `admin1`, gán/thu hồi role + duyệt KYC (ghi audit), SLO đa tab. (Cần login Keycloak thật — chưa chạy trong môi trường agent, giống Phase 2.)
- [ ] Chuyển nguồn danh tính admin sang AD ở Phase 4.

## Phase 4 — AD/LDAP federation (nhân sự nền tảng)

- [ ] Dựng Windows Server AD DS (VMware); tạo OU `Staff`, `Groups`, `ServiceAccounts`.
- [ ] Service account `keycloak-svc` (read-only) cho Keycloak bind.
- [ ] Group AD theo role: `kc-admin`, `kc-ecommerce-admin`, `kc-food-admin`, `kc-pay-admin`.
- [ ] Cài Tailscale trên máy AD + VPS; điền `LDAP_*` trong `.env` bằng Tailscale IP của DC.
- [ ] Keycloak `ecommerce-realm` -> User Federation -> LDAP (Active Directory): connection/bind/users DN, bật import + sync.
- [ ] Group-to-role mapper: group AD -> realm role (`kc-admin`->`admin`, `kc-*-admin`->`*_admin`).
- [ ] Deprovisioning: access token lifespan ngắn (~5 phút); verify xoá user AD => mất quyền sau khi token hết hạn.
- [ ] MFA bắt buộc cho nhóm admin.
- [ ] (Tùy chọn) đưa cấu hình federation vào realm JSON với placeholder `${LDAP_*}` + thêm vào `entrypoint.sh`.
- [ ] Kiểm thử: login admin AD nhận đúng role; đổi/xoá group trên AD đổi quyền.

## Phase 5 — Triển khai VPS + Tailscale + Nginx + HTTPS

- [ ] Provision VPS DigitalOcean; cài Docker + Compose + Tailscale (cùng tailnet với AD).
- [ ] Domain + TLS (Let's Encrypt) ở Nginx; cookie `secure: true`.
- [ ] Sửa redirect URI/issuer sang domain thật trong realm + `.env` từng app.
- [ ] Nginx route đủ 5 app; siết security headers.
- [ ] `docker compose up -d` + chạy app; verify SSO/SLO/KYC/HMAC trên VPS.

## Phase 6 — Kerberos/SPNEGO desktop SSO (sau)

- [ ] SPN + keytab cho Keycloak trên AD; cấu hình Kerberos trong LDAP federation.
- [ ] Bật authenticator Kerberos trong browser flow; cấu hình browser Negotiate máy nội bộ.
- [ ] Xử lý reverse DNS/SPN khi đi qua Tailscale tới VPS.

## Trạng thái 3 app đã có (nền tảng để mở rộng)

- [x] ShopEcommerce: buyer browse/cart/checkout, cross-app payment HMAC, admin role UI.
- [x] ShopSell: guard role, `/denied`, staff invite, audit, quản lý sản phẩm (`/products`) + đơn hàng (`/orders`).
- [x] ShopPay: wallet/topup/pay/KYC, `/kyc/admin`, gán `kyc-verified`, topup >5tr check token, TOTP per-client.
- [x] SSO/SLO: NextAuth cookie riêng, refresh token, frontchannel logout + watcher.
- [x] Tái cấu trúc role thành composite + gắn staff với shop qua Keycloak group (CONTEXT.md mục 13): gộp 3 `staff-*` -> `staff` (⊇buyer), `seller`⊇staff, `food-seller`⊇buyer, `wallet-user`⊇buyer, `kyc-verified`⊇wallet-user; shop = group `store-demo-1/2`; KYC review chuyển sang `pay_admin`. Migrate live realm bằng kcadm.
- [x] ShopSell đọc `storeId` từ Keycloak group (`lib/store.ts`), bỏ hardcode `DEMO_STORE_ID=1` (CONTEXT.md mục 14).
- [x] admin-portal: hiển thị TOÀN BỘ quyền (effective composite) + gán shop (Keycloak group) enforce "đúng 1 shop".
- [x] food-seller self-service: buyer xin -> admin duyệt -> cấp role food-seller (cột `kind` trên seller_upgrade_requests).
- [x] admin-portal: thêm quản trị tập trung `/ecommerce` và `/food`; `ecommerce_admin` thay thế `sell_admin`; thêm `buyer2`/`buyer3`.
- [ ] ShopFood: seller workspace cho `food-seller` (CRUD menu nhà hàng của mình) — đã có role + luồng xin quyền + tài khoản mẫu, chưa có UI quản lý menu.
- [ ] ShopSell: wire logic ACCEPT lời mời staff -> tự gán role `staff` + group shop qua Keycloak Admin API (hiện invite mới ghi DB).
- [ ] Test end-to-end qua trình duyệt: buyer xin food-seller + admin duyệt; admin gán/đổi shop; staff2 thấy roster shop 2; toàn bộ quyền hiển thị đúng.
- [ ] Cleanup TypeScript còn lỗi sẵn ở vài file ngoài phạm vi SSO/KYC.

## Phase 4 — AD/LDAP (local VMware, chuẩn bị sẵn)

- [ ] Dựng Windows Server AD trong VMware (domain `ecommerce.local`, Bridged + IP tĩnh). Theo `docs/active-directory.md`.
- [ ] Service account `keycloak-svc` + OU `Admins`/`Groups`/`ServiceAccounts` + group `*-Admins`.
- [ ] Keycloak User Federation (LDAP) -> sync user AD; `group-ldap-mapper` -> gán realm role admin/*_admin.
- [ ] Test login app bằng tài khoản AD; xác nhận deprovisioning (xoá AD -> mất quyền sau khi token hết hạn).

## Việc nền (xuyên suốt)

- [ ] Playwright smoke: login, logout, KYC approve, topup >5tr, HMAC payment, catalog sync.
- [ ] Backchannel logout chuẩn OIDC.
- [ ] Nonce replay table cho payment URL.
- [ ] Drizzle migrations versioned thay `db:push`.
- [ ] Step-up auth ACR/AMR cho ShopPay.
