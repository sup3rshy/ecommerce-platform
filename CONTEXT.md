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
- Apps chạy bằng npm (không trong Docker); chỉ Keycloak/Postgres/Nginx trong Docker Compose.
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
- Phase 3 (Admin Portal, DONE): NextAuth (cookie `admin-portal.session-token`, ES256, refresh) + `proxy.ts` guard role admin nền tảng cho `/ecommerce`,`/food`,`/users`,`/kyc`,`/audit`; `lib/keycloakAdmin.ts` qua `backend-admin-client` client_credentials (list/count user, assign/revoke realm role, list realm roles, enable/disable user); `lib/scope.ts` phân quyền per-platform (admin=all; ecommerce_admin->buyer/seller/staff + shop binding; food_admin->buyer+food-seller; pay_admin->wallet-user+kyc-verified; KYC chỉ admin/pay_admin; bật/tắt user chỉ admin). UI: dashboard `/`, `/ecommerce` (gian hàng/catalog/đơn/yêu cầu seller), `/food` (nhà hàng/menu/đơn/yêu cầu food-seller), `/users` (lọc theo role + gán/thu hồi + bật/tắt), `/kyc` (gán/thu hồi `kyc-verified`, review tài liệu vẫn ở ShopPay), `/audit`. Frontchannel logout + watcher. **Quyết định chốt với người dùng (khác PLAN gốc "no DB")**: cấp DB riêng `admin_portal` chứa `audit_logs` + cache `user_profile`; portal đọc thêm DB `ecommerce` và `shopfood` để hiển thị vận hành. Duyệt KYC = gán/thu hồi role (không đọc DB shoppay). Wire: `init-app-dbs.sql` (+`CREATE DATABASE admin_portal`), `bootstrap.sh` (DATABASE_URL + optional ECOMMERCE_DATABASE_URL/SHOPFOOD_DATABASE_URL), root `dev`/`dev:webpack`/`db:push`, `reset.sh`, `warmup.sh` (port 3400). Phase 0 đã set sẵn client `admin-portal` + `backend-admin-client` (SA roles `view-users`,`manage-users`,`query-realms`,`view-realm`) nên KHÔNG cần config Keycloak mới. Đã verify: Admin API qua SA, guard 307->signin, `tsc --noEmit` sạch. CHƯA test end-to-end qua trình duyệt (login `admin1` + roundtrip gán role/KYC + ghi audit + SLO) — cần login Keycloak thật, giống Phase 2.

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

Mô hình chạy: **hạ tầng trong Docker** (Keycloak :8080, Nginx :8000, Postgres app :5432, Postgres keycloak nội bộ) + **5 app Next.js chạy bằng npm** (KHÔNG trong Docker): :3000/:3100/:3200/:3300/:3400.

Trạng thái hiện tại (cuối phiên Phase 2):
- 4 container hạ tầng đang chạy. `docker-compose.yml` KHÔNG đặt `restart:` policy => reboot máy/WSL hay tắt Docker thì container DỪNG (dữ liệu vẫn còn trong named volume `postgres_app_data`, `postgres_keycloak_data`).
- `.env` của root + 5 app đã có (bootstrap đã chạy; `admin-portal/.env` nay có DATABASE_URL tới `admin_portal`). Schema 5 app đã push (DB `admin_portal` có `audit_logs` + `user_profile`). `shopfood` đã seed 6 món. Deps (`node_modules`) của cả 5 app đã cài (gồm `admin-portal` cài trong phiên này).

Resume phiên sau (KHÔNG cần chạy lại script seed/bootstrap/reset):
1. Kiểm tra container: `docker compose ps`. Nếu đang Up => bỏ qua bước 2.
2. Nếu đã dừng (sau reboot): `docker compose up -d` (KHÔNG phải `reset.sh`). Volume còn nguyên nên DB/Keycloak realm/data không mất. Đợi Keycloak ready: `curl -sf http://localhost:8080/realms/ecommerce-realm/.well-known/openid-configuration`.
3. `npm run dev` (chạy 5 app + warmup). URL: :3000 storefront · :3100 ShopSell · :3200 ShopPay · :3300 ShopFood · :3400 Admin Portal.

KHÔNG chạy lại trừ khi có lý do cụ thể:
- `scripts/reset.sh`: **WIPE toàn bộ volume** (mất hết DB + phải push/seed lại). Chỉ dùng khi muốn làm sạch hoặc sau khi sửa `keycloak/*-realm.json` / secret chain (cần reimport realm).
- `scripts/bootstrap.sh`: idempotent, chỉ sinh `.env` còn thiếu. `.env` đã có => chạy lại cũng không đổi gì.
- `npm run db:push`: chỉ khi đổi `db/schema.ts`. `npm --prefix shop-food run db:seed`: chỉ khi DB `shopfood` trống.
- `npm install` trong app: chỉ khi `node_modules` mất hoặc đổi dependency.

(Tùy chọn) Muốn container tự bật sau reboot: thêm `restart: unless-stopped` vào từng service trong `docker-compose.yml`, khi đó resume chỉ còn `npm run dev`.

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
