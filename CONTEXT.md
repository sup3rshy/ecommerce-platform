# Context - Ngữ cảnh dự án (lưu cho các phiên sau)

File này tổng hợp toàn bộ ngữ cảnh đã trao đổi để tiếp tục công việc ở phiên sau. Cập nhật lần cuối trong phiên tái cấu trúc + viết kế hoạch.

## 1. Dự án là gì

Hệ sinh thái thương mại điện tử đa ứng dụng, dùng chung Keycloak làm Identity Provider trung tâm (SSO, MFA, phân quyền theo role, Single Logout). Đây là đồ án môn Quản trị mạng + hệ thống (QTMHT), trọng tâm là tích hợp danh tính (Keycloak + Active Directory) chứ không phải một marketplace thật.

Repo gốc: `/home/odixe/ecommerce-platform`. Ngôn ngữ trao đổi: tiếng Việt. Tài liệu trong repo viết bằng tiếng Việt.

## 2. Năm ứng dụng

| App (sản phẩm) | Thư mục | Port | OIDC client | DB | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| ShopEcommerce | `shop-ecommerce` | 3000 | `nextjs-app` | `ecommerce` | Done |
| ShopSell | `shop-sell` | 3100 | `seller-workspace` | `seller_workspace` | Done (catalog sync + quản lý đơn hàng) |
| ShopPay | `shop-pay` | 3200 | `shoppay-app` | `shoppay` | Done |
| ShopFood | `shop-food` | 3300 | `shopfood-app` | `shopfood` | Done (SSO/SLO + đặt món; chưa nối thanh toán ShopPay) |
| Admin Portal | `admin-portal` | 3400 | `admin-portal` | `admin_portal` (audit/cache) | Done (quản trị tập trung) |

Hạ tầng dùng chung: Keycloak (:8080), Nginx (:8000, điều phối DUY NHẤT), Postgres app (:5432, các DB ecommerce/seller_workspace/shoppay/shopfood), Postgres keycloak (nội bộ).

## 3. Mô hình danh tính (quyết định cốt lõi)

Hai nhóm người dùng, hai nguồn, hợp nhất trong realm `ecommerce-realm`:

- **Khách + người bán + nhân viên shop** (`buyer`, `seller`, `staff`, `food-seller`, `wallet-user`, `kyc-verified`): lưu trong Keycloak (PostgreSQL). Đây là **composite role** (xem mục 13).
- **Nhân sự nền tảng** (`admin`, `ecommerce_admin`, `food_admin`, `pay_admin`): cấp trong **Windows Server Active Directory**, đưa vào Keycloak qua **LDAP user federation**. Group AD map sang role. `ecommerce_admin` là role hợp nhất cho ShopEcommerce + ShopSell; `pay_admin` kèm quyền duyệt KYC.

Luồng mong muốn (do người dùng nêu):
- User đăng nhập máy nội bộ bằng tài khoản AD -> truy cập web -> Keycloak tự nhận diện qua SSO -> vào thẳng theo phân quyền AD.
- Xoá user khỏi AD => mất quyền toàn bộ hệ sinh thái.
- DC chỉ đóng MỘT vai trò: cung cấp định danh.

## 4. Hạ tầng triển khai (định hướng người dùng)

- Toàn bộ app + Keycloak + Postgres + Nginx deploy trên **một VPS DigitalOcean** (Docker Compose).
- **Windows Server AD (DC)** chạy ở máy local của người dùng qua **VMware**.
- VPS và máy local nối nhau bằng **Tailscale**; Keycloak federate LDAP tới AD qua đường Tailscale.
- Nginx là điều phối duy nhất. KHÔNG dùng Kong.

## 5. Các quyết định đã chốt với người dùng (Q&A)

Vòng 1 (cấu trúc):
- Số app: 5 (thêm ShopFood + Admin Portal).
- Mức build: scaffold khung + tài liệu (code chạy được ghi vào TODO).
- Tên thư mục: ĐỔI theo tên sản phẩm (shop-ecommerce, shop-sell, shop-pay, shop-food, admin-portal).
- Per-platform admin roles + LDAP path: có.

Vòng 2 (danh tính/hạ tầng):
- AD cấp danh tính cho: **chỉ admin / nhân sự nền tảng**. Buyer/seller/staff/wallet vẫn ở Keycloak/PostgreSQL.
- Desktop SSO: **LDAP federation trước, Kerberos/SPNEGO sau** (làm từ từ).
- FreeIPA: **gỡ bỏ**, chỉ dùng Windows Server AD.

Chỉ thị thêm:
- Xoá thư mục lồng thừa nếu an toàn (đã xoá `shop-ecommerce/web-app/`).
- ShopSell và ShopEcommerce: **tách DB nhưng đồng bộ** sản phẩm (seller sửa trên ShopSell -> ShopEcommerce hiển thị cập nhật).
- Xây ShopFood và admin-portal **từ từ, cẩn thận**.
- **Gỡ bỏ acme-corp realm + toàn bộ SAML brokering** (người dùng tự bỏ phần này trong báo cáo).
- PLAN.md = kế hoạch xây dựng chi tiết; README.md = mô tả dự án; TODO.md = checklist nhiệm vụ.

## 6. Quy ước quan trọng

- **Tên thư mục đổi theo sản phẩm, nhưng định danh nội bộ giữ nguyên**: OIDC client ID (`nextjs-app`, `seller-workspace`, `shoppay-app`), tên DB, tên cookie session, tên biến secret. Lý do: tránh phá realm import + secret sync. (Có thể đồng bộ client ID sau — ghi trong TODO Phase 0.)
- **Secret chain cho client mới**: phải wire đủ 4 chỗ nếu không Keycloak import sẽ fail (sanity-check trong `keycloak/entrypoint.sh` fail nếu còn `${VAR}` chưa resolve):
  1. `keycloak/ecommerce-realm.json` (client tham chiếu `${VAR}`).
  2. `keycloak/entrypoint.sh` mảng `VARS_TO_RESOLVE`.
  3. `docker-compose.yml` env của service keycloak.
  4. `scripts/bootstrap.sh` (sinh secret vào root `.env`; idempotent, có `ensure_var`).
- Có 2 chế độ chạy app:
  - `npm run dev`: 5 Next app chạy trực tiếp trong WSL bằng npm.
  - `npm run dev:docker`: 5 Next app chạy trong Docker Compose, publish `3000..3400`; đây là chế độ khuyến nghị cho lab Windows/VMware/Desktop SSO vì Windows host đã timeout với Next process chạy trực tiếp trong WSL.
- Nginx route theo PORT, không theo tên thư mục.

## 7. File wiring chính

- Root `package.json`: script `dev`/`dev:webpack`/`db:push` (gồm 5 app: shop-ecommerce, shop-sell, shop-pay, shop-food, admin-portal).
- `scripts/bootstrap.sh`: sinh secret + tạo `.env` cho root và từng app (gồm shop-food; admin-portal có block riêng, nay có DATABASE_URL tới DB `admin_portal`).
- `scripts/reset.sh`: wipe volume, up infra, verify DB, push schema (5 app), seed.
- `scripts/init-app-dbs.sql`: tạo DB seller_workspace, shoppay, shopfood, admin_portal (ecommerce qua POSTGRES_DB).
- `scripts/warmup.sh`: warmup route 5 app (ports 3000/3100/3200/3300/3400).
- `.env.example`: có sẵn placeholder `SHOPFOOD_CLIENT_SECRET`, `ADMIN_PORTAL_CLIENT_SECRET`, `CATALOG_SYNC_SECRET`, và nhóm `LDAP_*` (cho AD federation).
- `keycloak/ecommerce-realm.json`: realm chính. Roles, clients, IdP google (đã GỠ acme-corp SAML IdP + 4 mappers của nó). Client `broker` và default SAML client-scopes (role_list, saml_organization) là built-in Keycloak — GIỮ.

## 8. Đã làm trong các phiên gần đây

- Đổi tên 3 thư mục app; scaffold shop-food + admin-portal (khung compilable: package.json, configs, app/ landing, db/, README, .env.example).
- Thêm per-platform admin roles + 2 OIDC client (shopfood-app, admin-portal) vào realm; wire secret chain đầy đủ. Ban đầu có `sell_admin`, nay đã gộp vào `ecommerce_admin`.
- Cập nhật package.json, bootstrap.sh, reset.sh, init-app-dbs.sql, nginx.conf (route /food/, /portal/).
- Gỡ Kong (chỉ còn trong tài liệu, đã xoá). Gỡ FreeIPA service + volume khỏi docker-compose, xoá `scripts/freeipa-seed.sh`.
- Xoá thư mục lồng thừa `shop-ecommerce/web-app/`.
- Gỡ acme-corp: xoá `keycloak/acme-corp-realm.json`, gỡ mount trong compose, gỡ SAML IdP `acme-corp` + 4 mapper trong ecommerce-realm.json (giữ google), làm sạch README/PLAN/TODO.
- Thêm `LDAP_*` + `CATALOG_SYNC_SECRET` vào `.env.example`.
- Viết lại 3 tài liệu: PLAN.md (kế hoạch xây dựng theo phase), README.md (mô tả + topology), TODO.md (checklist theo phase).
- Sau Phase 1: gỡ hẳn trang người bán khỏi ShopEcommerce (xoá `app/seller/page.tsx`, `SellerOrdersPanel`, `api/orders/[orderId]/status`; gỡ link nav + CTA). ShopEcommerce còn là storefront buyer + admin. Quản lý đơn hàng chuyển sang ShopSell `/orders` qua endpoint nội bộ `/api/internal/orders/{list,status}` ký HMAC `CATALOG_SYNC_SECRET`. Giữ luồng `/seller/register` + admin duyệt. Chi tiết: docs/phase-1-catalog-sync.md mục 8.
- Phase 2 (ShopFood, DONE): wire NextAuth SSO (cookie `shopfood.session-token`, ES256, refresh token), `syncUserProfile` + `user_profile`, frontchannel logout + `SingleLogoutWatcher`, proxy guard (`/cart`,`/orders` cần đăng nhập; `/admin` cần `food_admin`/`admin`). Schema: `menu_items`, `food_cart_items`, `food_orders`, `food_order_items`, `audit_logs`. UI: thực đơn `/`, giỏ `/cart`, đơn `/orders` (buyer huỷ pending), `/admin` (food_admin: CRUD menu + đẩy trạng thái đơn pending→preparing→delivering→completed). Seed thực đơn (`db:seed`, cần `tsx`). Wire vào root `dev`/`db:push`/`reset.sh`/`warmup.sh`. Realm `shopfood-app` đã sẵn từ Phase 0. Chưa làm: thanh toán qua ShopPay (tùy chọn, hoãn).
- Phase 3 (Admin Portal, DONE): NextAuth (cookie `admin-portal.session-token`, ES256, refresh) + `proxy.ts` guard role admin nền tảng cho `/ecommerce`,`/food`,`/users`,`/kyc`,`/audit`; `lib/keycloakAdmin.ts` qua `backend-admin-client` client_credentials (list/count user, assign/revoke realm role, list realm roles, enable/disable user); `lib/scope.ts` phân quyền per-platform (admin=all; ecommerce_admin->buyer/seller/staff + shop binding; food_admin->buyer+food-seller; pay_admin->wallet-user+kyc-verified; KYC chỉ admin/pay_admin; bật/tắt user chỉ admin). UI: dashboard `/`, `/ecommerce` (gian hàng/catalog/đơn/yêu cầu seller), `/food` (nhà hàng/menu/đơn/yêu cầu food-seller), `/users` (lọc theo role + gán/thu hồi + bật/tắt), `/kyc` (đọc hồ sơ `shoppay.kyc_documents`, approve cập nhật DB ShopPay + gán `kyc-verified`, reject cập nhật trạng thái; vẫn có gán/thu hồi thủ công), `/audit`. Frontchannel logout + watcher. **Quyết định chốt với người dùng (khác PLAN gốc "no DB")**: cấp DB riêng `admin_portal` chứa `audit_logs` + cache `user_profile`; portal đọc thêm DB `ecommerce`, `shopfood`, `shoppay` để hiển thị vận hành/KYC. Wire: `init-app-dbs.sql` (+`CREATE DATABASE admin_portal`), `bootstrap.sh` (DATABASE_URL + optional ECOMMERCE_DATABASE_URL/SHOPFOOD_DATABASE_URL/SHOPPAY_DATABASE_URL), root `dev`/`dev:webpack`/`db:push`, `reset.sh`, `warmup.sh` (port 3400). Phase 0 đã set sẵn client `admin-portal` + `backend-admin-client` (SA roles `view-users`,`manage-users`,`query-realms`,`view-realm`) nên KHÔNG cần config Keycloak mới. Đã verify: Admin API qua SA, guard 307->signin, `tsc --noEmit` sạch. CHƯA test end-to-end qua trình duyệt thật (login `admin1`/AD + roundtrip gán role/KYC + ghi audit + SLO) — đã smoke bằng session tạm cho `/kyc`.

## 9. Lộ trình còn lại (xem PLAN.md để biết bước chi tiết)

- Phase 1: ShopSell <-> ShopEcommerce tách DB + đồng bộ catalog (ShopSell là source-of-truth sản phẩm; ký HMAC `CATALOG_SYNC_SECRET`; endpoint `/api/internal/catalog/upsert` ở ShopEcommerce; idempotent theo (sellerId, sku); outbox + retry; backfill).
- Phase 2: Xây ShopFood (NextAuth SSO, refresh token, role guard buyer/food_admin, frontchannel logout + watcher, schema menu/đơn, thêm vào dev/db:push/reset).
- Phase 3 (DONE): Admin Portal (NextAuth + guard admin nền tảng, keycloakAdmin.ts, màn quản trị tập trung `/ecommerce` + `/food`, quản lý user/role + duyệt KYC + audit, phân quyền per-platform). DB riêng `admin_portal` cho audit/cache; đọc thêm DB nghiệp vụ. Còn lại: test end-to-end qua trình duyệt.
- Phase 4: AD/LDAP federation (Windows Server AD, service account, group->role mapper, deprovisioning bằng token TTL ngắn, MFA admin).
- Phase 5: Triển khai VPS + Tailscale + Nginx + HTTPS (cookie secure, đổi issuer/redirect sang domain thật).
- Phase 6: Kerberos/SPNEGO desktop SSO (sau, rủi ro cấu hình mạng cao).

## 10. Trạng thái git / lưu ý

- Người dùng đã chủ động xoá `presentation.md`, `web-app/AGENTS.md`, `web-app/CLAUDE.md` và thêm root `CLAUDE.md` (thay đổi của họ, không phải của agent). Tài liệu đã bỏ tham chiếu `presentation.md`.
- Đổi tên thư mục dùng `mv` (không `git mv`) => `git status` hiện path cũ là `D`, thư mục `shop-*` là `??`; git nhận diện rename khi commit.
- CHƯA commit gì (người dùng chưa yêu cầu). Đã chạy thật phần hạ tầng + DB: 4 container Up, đã `db:push` schema ShopFood, `db:seed` 6 món, smoke test ShopFood (:3300 menu 200, providers OK, guard `/admin` 307). CHƯA test SSO/SLO end-to-end qua trình duyệt (cần login Keycloak thật).
- Lần verify cuối (compose YAML, realm parse, grep kong/freeipa/acme) bị người dùng dừng giữa chừng, nên cần chạy lại để xác nhận sạch hoàn toàn:
  - `python3 -c "import yaml; yaml.safe_load(open('docker-compose.yml'))"`
  - `node -e 'require("./keycloak/ecommerce-realm.json")'`
  - `grep -rniE "kong|freeipa|acme" --include='*.md' --include='*.yml' --include='*.json' . | grep -vE "node_modules|.git"`

## 11. Cách chạy & resume phiên sau (QUAN TRỌNG)

Mô hình chạy hiện có 2 mode:
- **Pure WSL dev**: hạ tầng trong Docker (Keycloak :8080, Nginx :8000, Postgres app :5432, Postgres keycloak nội bộ) + 5 app Next.js chạy bằng npm trực tiếp trong WSL (:3000/:3100/:3200/:3300/:3400). Dùng `npm run dev`.
- **Windows/VMware/Desktop SSO dev (đang dùng)**: hạ tầng + 5 app Next.js đều chạy qua Docker Compose; các app dùng image `node:24-bookworm-slim`, bind mount thư mục app, publish :3000/:3100/:3200/:3300/:3400. Dùng `npm run dev:docker`.

Trạng thái hiện tại (cuối phiên Phase 2):
- 4 container hạ tầng đang chạy. `docker-compose.yml` KHÔNG đặt `restart:` policy => reboot máy/WSL hay tắt Docker thì container DỪNG (dữ liệu vẫn còn trong named volume `postgres_app_data`, `postgres_keycloak_data`).
- `.env` của root + 5 app đã có (bootstrap đã chạy; `admin-portal/.env` nay có DATABASE_URL tới `admin_portal`). Schema 5 app đã push (DB `admin_portal` có `audit_logs` + `user_profile`). `shopfood` đã seed 6 món. Deps (`node_modules`) của cả 5 app đã cài (gồm `admin-portal` cài trong phiên này).

Resume phiên sau (KHÔNG cần chạy lại script seed/bootstrap/reset):
1. Kiểm tra container: `docker compose ps`. Nếu đang Up => bỏ qua bước 2.
2. Nếu đã dừng (sau reboot): `docker compose up -d` (KHÔNG phải `reset.sh`). Volume còn nguyên nên DB/Keycloak realm/data không mất. Đợi Keycloak ready: `curl -sf http://localhost:8080/realms/ecommerce-realm/.well-known/openid-configuration`.
3. Nếu chỉ test trong WSL: `npm run dev` (chạy 5 app + warmup).
4. Nếu cần Windows host / Win10 VM truy cập hoặc test Kerberos/SPNEGO: `npm run dev:docker` (dừng local Next process, `docker compose up -d`, warmup). URL: :3000 storefront · :3100 ShopSell · :3200 ShopPay · :3300 ShopFood · :3400 Admin Portal · :8000 Nginx · :8080 Keycloak.

KHÔNG chạy lại trừ khi có lý do cụ thể:
- `scripts/reset.sh`: **WIPE toàn bộ volume** (mất hết DB + phải push/seed lại). Chỉ dùng khi muốn làm sạch hoặc sau khi sửa `keycloak/*-realm.json` / secret chain (cần reimport realm).
- `scripts/bootstrap.sh`: idempotent, chỉ sinh `.env` còn thiếu. `.env` đã có => chạy lại cũng không đổi gì.
- `npm run db:push`: chỉ khi đổi `db/schema.ts`. `npm --prefix shop-food run db:seed`: chỉ khi DB `shopfood` trống.
- `npm install` trong app: chỉ khi `node_modules` mất hoặc đổi dependency.

(Tùy chọn) Muốn container tự bật sau reboot: thêm `restart: unless-stopped` vào từng service trong `docker-compose.yml`, khi đó resume mode Docker chủ yếu là `docker compose up -d` / `npm run dev:docker`.

## 12. Quy ước làm việc (từ CLAUDE.md)

- Đọc file trước khi sửa. Thorough trong suy luận, ngắn gọn trong output.
- Không mở đầu nịnh, không kết thúc thừa. Không emoji, không em-dash.
- Không đoán API/version/flag/package — verify bằng đọc code/docs.
- Hỏi lại khi có điểm chưa chắc về yêu cầu (người dùng phản hồi tốt với câu hỏi làm rõ).

## 13. Tái cấu trúc role (phiên 2026-06-05)

Gộp/đào sâu mô hình role phía khách hàng thành **composite role** (Keycloak composite: gán role cha tự kéo theo role con qua `realm_access.roles`). Chuỗi hiệu lực:

- `buyer` (nền) — mọi tài khoản phía khách.
- `staff` ⊇ `buyer` — gộp từ 3 role cũ `staff-warehouse`/`staff-cs`/`staff-finance` (đã xoá). Nhân viên shop, **gắn với đúng 1 shop**.
- `seller` ⊇ `staff` (→ `buyer`) — chủ shop ShopSell, mặc định có luôn quyền staff. Xin từ `buyer`.
- `food-seller` ⊇ `buyer` — chủ nhà hàng ShopFood, **đứng riêng** (ShopFood không có khái niệm staff). Xin từ `buyer`.
- `wallet-user` ⊇ `buyer` — chỉ `buyer` mới xin được.
- `kyc-verified` ⊇ `wallet-user` (→ `buyer`).
- Platform admin (`admin`, `ecommerce_admin`, `food_admin`, `pay_admin`) giữ nguyên, không composite. `sell_admin` đã bị gộp vào `ecommerce_admin`.

Shop = **Keycloak group top-level** `store-demo-1` (attribute `storeId=1`), `store-demo-2` (`storeId=2`). Staff/seller là member của đúng 1 group; group mang `storeId` (mapper `groups` full-path đã bật sẵn trên client `seller-workspace`). Lưu ý: ShopSell hiện vẫn hardcode `DEMO_STORE_ID=1` trong DB; đọc `storeId` từ group attribute là việc còn lại (TODO).

**Duyệt KYC**: chuyển từ `staff-finance` -> `pay_admin` + `admin` (ShopPay `kyc/admin`, `audit`, `TopBar`). Khớp admin-portal (`pay_admin`->kyc-verified).

Sample users mới: `staff1`(shop1), `seller2`+`staff2`(shop2), `food-seller1`, `kyc1`. Xoá `warehouse1`/`cs1`/`finance1`.

Mật khẩu + profile (chốt với người dùng): **giữ password policy** (`length8 + upper + lower + digit + special`), nên password KHÔNG trùng username mà dùng dạng phái sinh `Tên1@2024` (vd `Staff1@2024`, `Seller2@2024`; `food-seller1` = `Foodseller1@2024`; `kyc1` = `Kyc1@2024`). Tất cả 9 tài khoản demo nay đã set sẵn `firstName`/`lastName`/`email`. Lý do: realm bật `VERIFY_PROFILE`, user tạo qua Admin API (kcadm) mà thiếu firstName/lastName sẽ bị direct-grant chặn "Account is not fully set up"; set sẵn profile để đăng nhập trơn tru. `kyc1` đã bỏ `CONFIGURE_TOTP` (giữ TOTP demo ở `wallet1`); `wallet1` vẫn buộc TOTP nên lần đầu login phải cấu hình OTP (chủ đích).

Áp dụng: (1) sửa `keycloak/ecommerce-realm.json` (nguồn truth, cho reset.sh sau này); (2) **migrate LIVE** realm đang chạy bằng `kcadm` (không wipe — giữ UUID user cũ để app data không mồ côi; script tạm ở `/tmp/migrate-roles.sh`, đã verify effective roles + group attribute). KHÔNG dùng reset/reimport vì sẽ mint lại UUID -> orphan products/orders. Code đã sửa: shop-sell (proxy/layout/dashboard/staff), shop-pay (3 chỗ reviewer + prose), admin-portal `scope.ts`, shop-ecommerce (role route + AdminUserPanel). tsc 4 app sạch.

## 14. Hoàn thiện runtime + self-service + chuẩn bị AD (phiên 2026-06-05, tiếp)

Sau review đối kháng, làm tiếp 3 vấn đề đã nêu:

- **#1 ShopSell đọc storeId từ group** (bỏ hardcode `DEMO_STORE_ID=1`): thêm `shop-sell/lib/store.ts` `currentStore(groups)` suy storeId từ group `/store-demo-{N}` trong token; `app/staff/page.tsx` (+ 2 action invite/revoke) và `app/dashboard/page.tsx` dùng storeId này. seller2/staff2 nay thao tác trên shop 2. User không thuộc shop -> hiện cảnh báo.
- **#2 admin-portal gán shop + enforce 1 shop + hiển thị TOÀN BỘ quyền**: `lib/keycloakAdmin.ts` thêm `getStoreGroups`, `getStoreMembershipByUser`, `setUserStoreGroup` (gỡ khỏi mọi store group khác trước khi add = enforce 1 shop) và `getUserEffectiveRealmRoles` (endpoint `.../role-mappings/realm/composite`); `KeycloakUserWithRoles` thêm `effectiveRoles`. `lib/scope.ts` thêm `canManageShop` (admin + ecommerce_admin). `app/users/actions.ts` thêm `setStoreGroup`. `app/users/page.tsx`: cột "Toàn bộ quyền" hiện effective roles (role kế thừa gắn "(kế thừa)", chỉ role gán trực tiếp mới revoke được), cột "Shop" (select store group, badge "⚠ chưa gán shop" cho staff/seller chưa có group), lọc theo effective role. SA `backend-admin-client` đã đủ quyền group (view-users cover GET /groups, manage-users cover membership) — KHÔNG cần thêm role.
- **#3 food-seller self-service** (mirror seller, DRY bằng cột `kind`): `shop-ecommerce/db/schema.ts` thêm `sellerUpgradeRequests.kind` (default 'seller'; đã `db:push`). Route mới `POST /api/food-seller/register` (kind='food-seller', không tạo stores). `seller/register` thêm filter `kind='seller'` (độc lập 2 luồng). Approve route generalize theo `kind` (assign seller|food-seller, chỉ seller tạo stores). UI: trang `/food-seller/register` tái dùng `SellerRegistrationForm` (thêm props endpoint/label); admin review (`admin/users` + `AdminUserPanel`) hiện `kind`. Nav + CTA home thêm "Đăng ký bán đồ ăn".

Verify: tsc sạch cả 4 app; smoke test live (3000/3100/3200/3300/3400 up; `/api/food-seller/register` 401, `/food-seller/register` 307, seller register vẫn 401, `/users` & `/staff` 307 — không 500); enforce-1-shop test round-trip qua SA (add shop1 -> switch shop2 chỉ còn shop2 -> cleanup). CHƯA test end-to-end qua trình duyệt (login buyer -> xin food-seller -> admin duyệt; admin gán shop; staff2 thấy roster shop 2) — cần phiên login thật.

**Lưu ý DC (local-first)**: người dùng chốt **chỉ chạy local trước** (DC + máy khách trong VMware trên máy họ), CHƯA cần VPS/Tailscale. Runbook: `docs/active-directory.md` (VMware Bridged -> DC có IP LAN; Keycloak Docker/WSL2 gọi `ldap://<ip-dc>:389`). `.env.example` LDAP_* đã đổi từ Tailscale sang IP LAN + domain ví dụ `ecommerce.local`.

## 15. Đồng nhất admin Ecommerce + Admin Portal tập trung (phiên 2026-06-05)

Yêu cầu mới: gộp hai role quản trị `ecommerce_admin` và `sell_admin` thành một role quản trị mảng Ecommerce, rồi biến Admin Portal thành cổng quản trị tập trung. Quyết định triển khai: **giữ tên canonical `ecommerce_admin`** (theo convention underscore đã dùng trong realm/code/docs) và **gỡ `sell_admin`**. `ecommerce_admin` nay bao trùm ShopEcommerce + ShopSell: buyer/seller/staff, shop group binding, gian hàng, catalog, đơn hàng. `admin` vẫn toàn quyền và thấy mọi module.

Đã làm:

- `keycloak/ecommerce-realm.json`: xoá realm role `sell_admin`; cập nhật mô tả `ecommerce_admin`; thêm user demo `buyer2`/`buyer3` role `buyer` (password `Buyer2@2024`, `Buyer3@2024`).
- LIVE Keycloak (không reset): tạo `buyer2`, `buyer3`; nếu user nào có `sell_admin` thì migrate sang `ecommerce_admin`; xoá role live `sell_admin`. Verify live roles còn: `admin`, `ecommerce_admin`, `food_admin`, `pay_admin`, `buyer`, `seller`, `staff`, `food-seller`, `wallet-user`, `kyc-verified`; `buyer2`/`buyer3` effective role = `buyer`.
- ShopSell: guard/layout/products/orders dùng `ecommerce_admin` thay `sell_admin`; admin-like (`admin`/`ecommerce_admin`) thấy toàn bộ sản phẩm và đơn.
- Admin Portal:
  - `lib/scope.ts`: platform roles còn `admin`, `ecommerce_admin`, `food_admin`, `pay_admin`; `ecommerce_admin` quản lý `buyer`,`seller`,`staff`; `food_admin` quản lý `buyer`,`food-seller`; `pay_admin` quản lý `wallet-user`,`kyc-verified`; thêm `canManageEcommerce`, `canManageFood`.
  - Route mới `/ecommerce`: dashboard vận hành ShopEcommerce + ShopSell (stats gian hàng/catalog/đơn/doanh thu), danh sách gian hàng, sản phẩm, đơn gần đây, tài khoản Ecommerce, duyệt/từ chối yêu cầu `seller`.
  - Route mới `/food`: dashboard ShopFood (nhà hàng, thực đơn, đơn món, tài khoản Food), duyệt/từ chối yêu cầu `food-seller`, ẩn/hiện món và đẩy trạng thái đơn món.
  - `lib/platformData.ts`: Admin Portal đọc thêm DB `ecommerce` và `shopfood` bằng `pg`; fallback tự suy DB URL từ `DATABASE_URL`, có optional `ECOMMERCE_DATABASE_URL`/`SHOPFOOD_DATABASE_URL`.
  - `proxy.ts` + `TopBar` + dashboard `/` đã thêm module `/ecommerce` và `/food`.
- `scripts/bootstrap.sh` + `admin-portal/.env.example`: thêm optional `ECOMMERCE_DATABASE_URL`, `SHOPFOOD_DATABASE_URL`.
- Docs đã cập nhật: README/PLAN/TODO/CONTEXT, `admin-portal/README.md`, `docs/keycloak.md`, `docs/active-directory.md`, `docs/phase-1-catalog-sync.md`.

Verify đã chạy: `npx tsc --noEmit` sạch cho `admin-portal`, `shop-sell`, `shop-ecommerce`, `shop-food`; realm JSON parse OK; live Keycloak migration OK. CHƯA test end-to-end qua trình duyệt với login thật vào `/ecommerce`/`/food` và thao tác form server action.

## 16. AD/LDAP live + Kerberos/SPNEGO local-domain (phiên 2026-06-05, tiếp)

Người dùng đã thực hiện runbook AD trong file `Cấu-hình-Active-Directory-trên-Windows-Server.md`:

- Windows Server 2016 trong VMware đã promote thành DC `DC01`, domain `ecommerce.local`, NetBIOS `ECOMMERCE`, domain mode `Windows2012R2Domain`.
- DC IP lab đang dùng: `192.168.1.50`. Máy thật đổi IP Wi-Fi theo mạng; lần debug 2026-06-05 đang là `192.168.1.148` (trước đó từng `192.168.1.252`).
- OU/group/service account đã tạo: `OU=Admins`, `OU=Groups`, `OU=ServiceAccounts`; `keycloak-svc`; groups `Platform-Admins`, `Ecommerce-Admins`, `Food-Admins`, `Pay-Admins`.
- Win10 VM đã join domain và đăng nhập được bằng `ECOMMERCE\ad-admin`.
- Keycloak live realm `ecommerce-realm` đã cấu hình LDAP provider tên `ldap`, sync thấy `ad-admin`/`ad-ecommerce`, group mapper map `Platform-Admins` -> `admin`; login Admin Portal bằng `ad-admin` đã thành công.
- Lỗi `Failed to send email` được xử lý bằng `verifyEmail=false` trong live realm; source `keycloak/ecommerce-realm.json` cũng đã đổi sang `verifyEmail=false`.

Desktop SSO không thể dùng `localhost` từ Win10 VM. Quyết định canonical cho lab local:

- Hostname web/Kerberos: `app.ecommerce.local`.
- SPN: `HTTP/app.ecommerce.local@ECOMMERCE.LOCAL`.
- Keytab live ban đầu ở `/opt/keycloak/conf/keycloak_app.keytab`; đã copy sang `keycloak/keytabs/keycloak_app.keytab` (git ignored) và trong container sang `/opt/keycloak/conf/keytabs/keycloak_app.keytab`.
- `docker-compose.yml` đã mount `keycloak/krb5.conf` và `keycloak/keytabs/`; `keycloak/krb5.conf` hiện trỏ KDC `192.168.1.50`.
- `scripts/use-local-domain.sh app.ecommerce.local` đã chạy, cập nhật `.env` của 5 app sang:
  - `NEXTAUTH_URL=http://app.ecommerce.local:<port>`
  - `KEYCLOAK_ISSUER=http://app.ecommerce.local:8080/realms/ecommerce-realm`
  - `NEXT_PUBLIC_KEYCLOAK_ISSUER` tương ứng
  - `SHOPPAY_BASE_URL=http://app.ecommerce.local:3200`
- `scripts/apply-keycloak-local-domain.sh app.ecommerce.local` đã chạy trên live realm, không reset:
  - thêm redirect URI/web origin `app.ecommerce.local` cho 5 OIDC clients;
  - chuyển `frontchannel.logout.url` sang `app.ecommerce.local`;
  - bật `auth-spnego` = `ALTERNATIVE` trong `browser` flow và `shoppay-alternatives`;
  - set LDAP Kerberos keytab path `/opt/keycloak/conf/keytabs/keycloak_app.keytab`;
  - đảm bảo `verifyEmail=false`.
- `keycloak/ecommerce-realm.json` đã cập nhật tương ứng cho reset sau này: app host redirect/webOrigins, frontchannel logout app host, `auth-spnego` enabled, `verifyEmail=false`.
- 5 app `package.json` đã đổi `next dev/start` sang `-H 0.0.0.0` để portproxy từ Win10 vào WSL hoạt động.
- Debug truy cập 2026-06-05: trong WSL, `localhost` và WSL IP `172.26.212.202` trả OK cho `3000/3100/3200/3300/3400/8080`; riêng Nginx `:8000` timeout vì container bridge không gọi được Next dev qua `host.docker.internal`. Đã sửa `nginx` service sang `network_mode: host` và `nginx/nginx.conf` listen `8000`, proxy về `127.0.0.1:<port>`; đã `docker compose up -d --force-recreate nginx`; smoke test WSL OK cho `/`, `/seller/`, `/food/`, `/portal/`, `/auth/`.
- Cũng trong debug này, Windows host connect được `172.26.212.202:8080` nhưng timeout `172.26.212.202:3000..3400`. Lần chạy script đầu tiên với `listenaddress=0.0.0.0` + `connectaddress=172.26.212.202` cho kết quả TCP qua portproxy OK, nhưng `curl` HTTP tới `127.0.0.1/app.ecommerce.local/192.168.1.148:3000..3400/8000` vẫn treo; TCP-only check không đủ. `scripts/windows-host-portproxy.ps1` đã cập nhật lần 2: tự chọn IP LAN chính làm `ListenAddress` (vd `192.168.1.148`), dùng `ConnectAddress=127.0.0.1` để tận dụng WSL localhost forwarding mà tránh self-loop, xoá portproxy cũ, thêm Windows Firewall rule, thêm Hyper-V firewall rule WSL (`VMCreatorId {40E0AC32-46A5-438A-A0B2-2B479E8F2E90}`), in IPv4 hiện tại, TCP checks và HTTP checks. Script phải chạy trên **Windows host thật as Administrator**, không chạy trong WSL/Win10 VM.
- Người dùng chạy script lần 2026-06-05 thì portproxy TCP qua `192.168.1.148` đã OK cho `3000/3100/3200/3300/3400/8000/8080`; lỗi dừng script nằm ở đoạn HTTP check: `curl.exe` ghi progress ra stderr, PowerShell với `$ErrorActionPreference="Stop"` báo `NativeCommandError` tại dòng gọi curl. Đã sửa `scripts/windows-host-portproxy.ps1`: dùng `curl.exe --head --silent --show-error`, bắt lỗi native command trong `Invoke-CurlHead` để HTTP fail chỉ in warning, không abort; thêm `CanonicalHost=app.ecommerce.local`, kiểm tra DNS/hosts trên Windows host, HTTP check bằng `curl --resolve app.ecommerce.local:<port>:<listen-ip>`, và switch tùy chọn `-UpdateHostsFile` để cập nhật hosts file máy thật nếu host không dùng DNS DC.
- Người dùng chạy lại script với `-UpdateHostsFile`: `connectaddress=127.0.0.1` cho kết quả TCP qua listen IP OK nhưng HTTP reset (`curl: (56) Recv failure: Connection was reset`) cho tất cả port, kể cả `8080`. Kết luận: Windows portproxy accept được socket nhưng backend Windows loopback không nối được vào WSL HTTP. Đã sửa script lần 3: default `ConnectAddress="wsl"` tự resolve thành IP WSL hiện tại (vd `172.26.212.202`), thêm mục `HTTP checks from Windows host directly to portproxy backend`, giữ `-ConnectAddress 127.0.0.1` chỉ để debug legacy mode, thêm `-AllowAllWslInbound` để gọi `Set-NetFirewallHyperVVMSetting -Name {40E0AC32-46A5-438A-A0B2-2B479E8F2E90} -DefaultInboundAction Allow` nếu Windows vẫn không HTTP được tới WSL IP. Trạng thái lúc đó: 5 web app đã lắng nghe `0.0.0.0` trong từng `package.json` nhưng chưa có web app service trong `docker-compose.yml`.
- Người dùng chạy script với `-UpdateHostsFile` gặp lỗi `Set-Content : Stream was not readable` khi ghi `C:\Windows\System32\drivers\etc\hosts`; lỗi này làm script dừng trước HTTP checks. Đã sửa `Set-HostsFileEntry`: dùng `[System.IO.File]::ReadAllLines/WriteAllLines` thay `Set-Content`, bỏ read-only attribute nếu có, bọc `try/catch`; nếu Windows vẫn không cho ghi hosts thì chỉ warning và tiếp tục portproxy/checks. Có thể bỏ `-UpdateHostsFile` nếu DC DNS đã trỏ đúng, hoặc sửa hosts thủ công bằng Notepad as Administrator.
- Can thiệp sâu sau khi portproxy tới WSL IP vẫn fail ở `3000..3400/8000` nhưng OK `8080`: nguyên nhân thực tế là Windows host chỉ vào được Docker-published ports (Keycloak :8080), còn Next dev process/Nginx host-network chạy trực tiếp trong WSL thì timeout. Đã thêm 5 service app vào `docker-compose.yml` (`shop-ecommerce-app`, `shop-sell-app`, `shop-pay-app`, `shop-food-app`, `admin-portal-app`) dùng image `node:24-bookworm-slim`, bind mount app dir, publish `3000..3400`, override DB URL sang `postgres-app`. Thêm root scripts: `dev:docker`, `dev:docker:logs`, `dev:docker:stop`; thêm `scripts/stop-local-next.sh` để dừng `npm run dev` cũ trước khi Docker bind port.
- Docker networking fix: app containers vẫn dùng issuer public `http://app.ecommerce.local:8080/realms/ecommerce-realm`; trong Docker network, Keycloak service có alias `app.ecommerce.local` để server-side NextAuth/OIDC gọi được metadata mà không đi vòng ra Windows host. Browser/Windows/VM vẫn resolve `app.ecommerce.local` tới IP máy thật.
- Nginx đã chuyển khỏi `network_mode: host` sang Docker bridge + publish `8000:8000`; `nginx/nginx.conf` proxy theo service name (`shop-ecommerce-app`, `shop-sell-app`, `shop-food-app`, `admin-portal-app`, `keycloak`). Smoke test WSL sau can thiệp: `127.0.0.1` và `app.ecommerce.local` OK cho `3000/3100/3200/3300/3400/8000/8080`; Nginx `/`, `/seller/`, `/food/`, `/portal/`, `/auth/` OK; app container fetch OIDC metadata OK; `/api/auth/providers` OK cả 5 app.
- Fix tiếp cho lỗi người dùng bấm "Đăng nhập SSO" trên máy thật ở `http://app.ecommerce.local:3400` không chuyển tiếp và `localhost:3400` reload liên tục: log `admin-portal-app` có Turbopack panic lặp lại (`Failed to write app endpoint /page`, `Next.js package not found`). Đã đổi `x-next-app.command` trong `docker-compose.yml` sang `npm run dev -- --webpack`, recreate 5 app container + nginx; log mới hiển thị `Next.js ... (webpack)` và không còn `Turbopack/FATAL/panic`.
- Admin Portal giờ canonicalize loopback host: `admin-portal/proxy.ts` redirect sớm `localhost/127.0.0.1:3400` sang `http://app.ecommerce.local:3400` khi `NEXTAUTH_URL` là hostname canonical. Canonical host `/` trả 200; `localhost:3400/` và `/users` trả 307 sang canonical; `/users` trên canonical vẫn guard về `/api/auth/signin`.
- NextAuth smoke test sau fix: `GET /api/auth/providers` 200; `POST /api/auth/signin/keycloak` với CSRF + `X-Auth-Return-Redirect: 1` trả JSON `url` tới Keycloak `http://app.ecommerce.local:8080/...` với redirect URI `http://app.ecommerce.local:3400/api/auth/callback/keycloak`. Đây là đúng luồng mà nút `signIn("keycloak", { redirect:false })` dùng.
- Type fix cùng khu vực admin auth: Next 16 route handler không cho export thêm `authOptions`; đã tách sang `admin-portal/lib/authOptions.ts` và cập nhật server imports. Verify `npx tsc --noEmit` trong `admin-portal` sạch; `docker compose config --quiet` sạch.
- Fix tiếp cho lỗi browser console `WebSocket connection to ws://app.ecommerce.local:<port>/_next/webpack-hmr failed` trên `3300/3400` và người dùng bấm login ở các nền tảng thấy lỗi: container log có `Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "app.ecommerce.local"`. Đã thêm `allowedDevOrigins: ["app.ecommerce.local"]` vào `next.config.ts` của đủ 5 app (`shop-ecommerce`, `shop-sell`, `shop-pay`, `shop-food`, `admin-portal`) và recreate app containers. Verify HMR WebSocket upgrade trả `101 Switching Protocols` cho `3000/3100/3200/3300/3400`, không còn log `Blocked cross-origin`.
- Type fix đồng bộ 5 app: Next 16 route handler không được export thêm `authOptions`. Sau admin, đã tách tiếp `authOptions` sang `lib/authOptions.ts` ở `shop-ecommerce`, `shop-sell`, `shop-pay`, `shop-food`; route `app/api/auth/[...nextauth]/route.ts` của cả 5 app giờ chỉ import `authOptions` và export `GET/POST`. Toàn bộ server import đã chuyển sang `@/lib/authOptions`. Verify `npx tsc --noEmit` sạch cho cả 5 app.
- Smoke test sau fix đồng bộ: với CSRF + `X-Auth-Return-Redirect: 1`, `POST /api/auth/signin/keycloak` trả `200 keycloak-url-ok` cho cả `3000:/account`, `3100:/dashboard`, `3200:/wallet`, `3300:/cart`, `3400:/users`; `docker compose config --quiet` sạch.
- Giải thích popup native browser "Sign in http://app.ecommerce.local:8080" khi bấm login lần đầu: đây không phải form Keycloak mà là browser xử lý Kerberos/SPNEGO challenge. Đã verify OIDC auth URL từ Admin Portal trả `HTTP/1.1 401 Unauthorized` + `WWW-Authenticate: Negotiate`. Popup xuất hiện khi browser không tự lấy/gửi được Kerberos ticket cho `HTTP/app.ecommerce.local` (vd test từ máy thật chưa join domain, Win10 VM chưa login domain, thiếu Local Intranet/Chrome/Edge allowlist, sai DNS/SPN/keytab/time). Nếu muốn manual login thay vì Desktop SSO, có thể Cancel popup để rơi về form Keycloak hoặc tắt `auth-spnego` trong flow; tắt SPNEGO sẽ mất auto Desktop SSO.
- Runbook mới, nguồn truth cho phần này: `docs/desktop-sso-kerberos.md`.

Việc người dùng cần làm tiếp trên máy Windows:

1. Trên máy thật Windows, chạy lại `scripts/windows-host-portproxy.ps1` bằng PowerShell Administrator (qua `\\wsl$\...`). Script nay mặc định forward tới IP WSL. Nếu mục `HTTP checks from Windows host directly to portproxy backend` fail với WSL IP, chạy lại thêm `-AllowAllWslInbound`. Nếu máy thật không resolve được `app.ecommerce.local` và không dùng DNS DC, chạy thêm `-UpdateHostsFile`. Kỳ vọng quan trọng: 3 mục HTTP backend/listen/hostname đều OK cho `3000,3100,3200,3300,3400,8000,8080`.
2. Trên DC, đảm bảo DNS A record `app.ecommerce.local` trỏ tới IP Wi-Fi hiện tại của máy thật (`192.168.1.148` trong lần debug này; có thể đổi).
3. Trên máy thật Windows, nếu không dùng DNS DC cho chính host thì hosts nên là `192.168.1.148 app.ecommerce.local` (IP LAN hiện tại), hoặc dùng `-UpdateHostsFile` ở bước 1. Trong WSL vẫn nên giữ `/etc/hosts` là `127.0.0.1 app.ecommerce.local`; kiểm tra bằng `getent hosts app.ecommerce.local`.
4. Runtime hiện tại nên chạy bằng `npm run dev:docker` để app ports được Docker publish. Docker app services phải giữ `--webpack`; Turbopack đã panic trong bind-mount Docker mode và làm admin login/reload lỗi. Các `next.config.ts` phải giữ `allowedDevOrigins: ["app.ecommerce.local"]` để HMR WebSocket không bị Next dev chặn khi browser mở bằng hostname canonical. Nếu đổi compose/mount/JAVA opts, chạy lại `docker compose up -d` hoặc `npm run dev:docker` (không wipe volume).
5. Trên Win10 VM, Local intranet/Chrome/Edge allowlist cho `http://app.ecommerce.local`; kiểm tra `Test-NetConnection app.ecommerce.local -Port 8080` và `-Port 3400`. Nếu browser hiện popup native "Sign in" của Windows, không phải lỗi NextAuth; đó là SPNEGO challenge chưa được browser đáp ứng tự động. Kiểm tra `whoami`, `klist`, intranet/allowlist, DNS/SPN/keytab/time.
6. Test cuối: login Win10 bằng `ECOMMERCE\ad-admin`, mở `http://app.ecommerce.local:3400` (không dùng `localhost`; admin portal sẽ redirect loopback sang host này), kỳ vọng vào Admin Portal không hiện form login Keycloak. Nếu vẫn hiện form: xem `klist` trên Win10 và `docker compose logs -f keycloak | grep -iE 'spnego|kerberos|gss|keytab'`.

## 17. Fix Admin Portal KYC tập trung + kiểm tra gán quyền (phiên 2026-06-06)

Người dùng báo: trong Admin Portal gán quyền chưa thực hiện được và khách nộp KYC từ ShopPay không xuất hiện trong yêu cầu Admin Portal.

Kết quả kiểm tra:
- Keycloak Admin API bằng `backend-admin-client` vẫn hoạt động: lấy token client_credentials OK; list roles/users OK; round-trip gán rồi thu hồi `wallet-user` cho `buyer3` qua Admin API trả `204/204` và cleanup sạch.
- DB `shoppay.kyc_documents` đang có 2 hồ sơ pending thật: `buyer1` và `buyer2`. Trước fix, Admin Portal `/kyc` chỉ liệt kê user Keycloak để gán role, không đọc DB `shoppay`, nên hồ sơ khách nộp từ ShopPay chắc chắn không hiện.
- Log trước fix có một lần `kyc.grant` cho `buyer2` từ Admin Portal, làm user có role `kyc-verified` nhưng hồ sơ ShopPay vẫn `pending`; đây là trạng thái lệch do luồng cũ chỉ gán role.

Đã sửa:
- `admin-portal/lib/platformData.ts`: thêm DB source `shoppay`, env `SHOPPAY_DATABASE_URL`, `getKycOverview()`, `approveKycDocument()`, `rejectKycDocument()`. Approve chạy transaction: lock hồ sơ, gán role `kyc-verified` qua Keycloak Admin API, update `kyc_documents.status='approved'`, ghi audit vào DB `shoppay`. Reject update `status='rejected'` + audit.
- `admin-portal/app/kyc/page.tsx`: `/kyc` nay hiển thị hàng đợi hồ sơ từ `shoppay.kyc_documents`, bảng đã xử lý, và phần gán/thu hồi role thủ công cho ngoại lệ. Hồ sơ pending có nút “Duyệt + gán role” và “Từ chối”. Số giấy tờ được mask khi hiển thị.
- `admin-portal/app/kyc/actions.ts`: thêm `approveKycRequest`/`rejectKycRequest`; audit vào `admin_portal.audit_logs`; revalidate `/kyc`, `/users`, `/audit`.
- `docker-compose.yml`: `admin-portal-app` có `SHOPPAY_DATABASE_URL=...@postgres-app:5432/shoppay`.
- `scripts/bootstrap.sh` và `admin-portal/.env.example`: thêm `SHOPPAY_DATABASE_URL` cho lần bootstrap mới. Lưu ý: không để `SHOPPAY_DATABASE_URL=localhost` trong `admin-portal/.env` khi app chạy Docker; Docker Compose sẽ inject URL đúng. Local npm vẫn tự suy `shoppay` từ `DATABASE_URL`.
- `shop-pay/app/kyc/page.tsx`: copy đổi sang hướng dẫn duyệt tập trung ở Admin Portal `/kyc`; `/kyc/admin` của ShopPay vẫn dùng được cho kiểm thử cục bộ.
- Docs cập nhật: `admin-portal/README.md`, `PLAN.md`, `TODO.md`, `README.md`, `CONTEXT.md`.

Verify đã chạy:
- `npx tsc --noEmit` sạch cho `admin-portal` và `shop-pay`.
- Recreate riêng `admin-portal-app` để nhận env mới; container env có `SHOPPAY_DATABASE_URL` trỏ `postgres-app`.
- Smoke render `/kyc` bằng NextAuth session cookie tạm role `admin`: trang trả 200 và hiển thị `Hồ sơ chờ duyệt (2)` với `buyer1`/`buyer2`.
- Smoke server action approve có cleanup: tạo hồ sơ KYC tạm cho `buyer3`, POST đúng server action approve trên `/kyc`, DB chuyển sang `approved`, role `kyc-verified` được gán; sau đó đã thu hồi role, xoá hồ sơ tạm và audit tạm. DB `shoppay.kyc_documents` sau cleanup chỉ còn 2 hồ sơ thật pending (`buyer1`, `buyer2`).

Việc còn nên test thủ công bằng trình duyệt thật: đăng nhập Admin Portal bằng `ad-admin` hoặc `admin1`, mở `/kyc`, bấm duyệt một hồ sơ thật, xác nhận ShopPay `/wallet` thấy `status=approved`; user cần logout/login lại để token có `kyc-verified`.
