# PLAN - Kế hoạch xây dựng chi tiết

Tài liệu này là kế hoạch xây dựng theo từng phase. Mô tả dự án nằm trong [README.md](README.md); checklist nhiệm vụ nằm trong [TODO.md](TODO.md).

## Nguyên tắc thực thi

- Làm từ từ, từng phase, mỗi phase có deliverable và cách kiểm thử rõ ràng.
- Không phá vỡ 3 app đang chạy khi thêm tính năng mới.
- Phần phụ thuộc hạ tầng ngoài tách thành phase riêng. Windows AD local đã được cấu hình
  trước VPS/Tailscale để kiểm chứng danh tính nền tảng.
- Định danh nội bộ (OIDC client ID, tên DB, cookie) giữ ổn định; chỉ tên thư mục theo tên sản phẩm.

## Kiến trúc mục tiêu

### Ứng dụng

| App | Thư mục | Port | Client | DB | Vai trò chính |
| --- | --- | --- | --- | --- | --- |
| ShopEcommerce | `shop-ecommerce` | 3000 | `nextjs-app` | `ecommerce` | buyer, hiển thị catalog |
| ShopSell | `shop-sell` | 3100 | `seller-workspace` | `seller_workspace` | seller/staff, quản lý sản phẩm |
| ShopPay | `shop-pay` | 3200 | `shoppay-app` | `shoppay` | wallet-user, KYC, MFA |
| ShopFood | `shop-food` | 3300 | `shopfood-app` | `shopfood` | buyer đặt món, food_admin |
| Admin Portal | `admin-portal` | 3400 | `admin-portal` | `admin_portal` | admin / per-platform admin |

### Điều phối và hạ tầng

- Nginx (:8000) là điểm điều phối duy nhất. Không dùng Kong.
- Toàn bộ app + Keycloak + Postgres + Nginx deploy trên một VPS DigitalOcean bằng Docker Compose.
- Windows Server AD (DC) chạy ở máy local (VMware); VPS nối DC qua Tailscale.

## Mô hình danh tính (cốt lõi)

Hai nhóm người dùng, hai nguồn, hợp nhất trong realm `ecommerce-realm`:

1. Khách hàng + người bán + nhân viên shop (`buyer`, `seller`, `staff`, `food-seller`, `wallet-user`, `kyc-verified` — composite role, xem CONTEXT.md mục 13): lưu trong Keycloak (PostgreSQL).
2. Nhân sự nền tảng (`admin`, `ecommerce_admin`, `food_admin`, `pay_admin`): cấp trong Windows Server AD, đưa vào Keycloak qua LDAP user federation. Group AD map sang role.

Quy tắc:

- DC chỉ là nguồn định danh. Phân quyền thực thi ở Keycloak (role) và ở từng app (guard).
- Xoá user khỏi AD => mất quyền toàn hệ sinh thái. Cơ chế: access token TTL ngắn (vd 5 phút) + refresh kiểm tra lại với Keycloak; user bị xoá khỏi AD sẽ không federate được nên refresh thất bại => app coi như logged-out.
- Lộ trình đăng nhập: Phase 4 dùng LDAP (nhập tài khoản AD trên trang login Keycloak).
  Phase 6 dùng Kerberos/SPNEGO với hostname LAN `app.ecommerce.local` để tự nhận diện
  từ máy Win10 domain-joined.

## Lộ trình theo phase

### Phase 0 — Tái cấu trúc & dọn dẹp (DONE)

- Đổi tên thư mục theo tên sản phẩm; scaffold `shop-food`, `admin-portal`.
- Thêm per-platform admin roles và 2 OIDC client vào realm; wire secret chain.
- Gỡ Kong khỏi tài liệu; gỡ FreeIPA khỏi `docker-compose.yml` và xoá `scripts/freeipa-seed.sh`.
- Xoá thư mục lồng thừa `shop-ecommerce/web-app/`.
- Thêm placeholder `LDAP_*`, `CATALOG_SYNC_SECRET` vào `.env.example`.

### Phase 1 — ShopSell ↔ ShopEcommerce: tách DB + đồng bộ catalog

Mục tiêu: giữ hai DB tách biệt nhưng đồng bộ sản phẩm. ShopSell là nơi người bán quản lý mặt hàng (source of truth cho catalog của shop); ShopEcommerce giữ bản sao để hiển thị storefront và luôn được cập nhật khi ShopSell thay đổi.

Bước:

1. Audit schema hiện tại: `shop-ecommerce/db/schema.ts` (đang chứa catalog + seed) và `shop-sell/db/schema.ts` (hiện chưa quản lý sản phẩm). Xác định trường sản phẩm chung (sku, name, price, stock, status, sellerId, images).
2. Đưa quyền quản lý sản phẩm về ShopSell: thêm bảng `products` (và biến thể/tồn kho nếu cần) vào `seller_workspace`, UI CRUD trong ShopSell, guard theo `seller`/`ecommerce_admin`.
3. Thiết kế đồng bộ một chiều ShopSell -> ShopEcommerce:
   - ShopSell ký payload bằng HMAC-SHA256 với `CATALOG_SYNC_SECRET`.
   - ShopEcommerce expose endpoint nội bộ `POST /api/internal/catalog/upsert` và `/delete`, verify chữ ký, ghi vào bảng catalog read-copy. Idempotent theo `(sellerId, sku)`.
   - Gọi sync ngay khi seller tạo/sửa/xoá/ẩn sản phẩm (đồng bộ tức thời). Bổ sung outbox + retry để chịu lỗi mạng.
4. ShopEcommerce chỉ đọc bản sao này để hiển thị; không cho sửa catalog trực tiếp.
5. Backfill: script đồng bộ toàn bộ sản phẩm hiện có lần đầu.

Deliverable: seller sửa sản phẩm trên :3100, storefront :3000 thấy thay đổi sau khi sync. Hai DB vẫn độc lập.

Kiểm thử: tạo/sửa/ẩn 1 sản phẩm ở ShopSell -> kiểm tra phản ánh ở ShopEcommerce; gửi payload sai chữ ký -> ShopEcommerce từ chối.

Phụ thuộc: `CATALOG_SYNC_SECRET` (đã có trong `.env.example`), cập nhật `bootstrap.sh` để ghi secret này vào cả `shop-sell/.env` và `shop-ecommerce/.env`.

### Phase 2 — Xây ShopFood

Mục tiêu: ShopFood thành app chạy được, tham gia SSO/SLO, DB độc lập.

Bước:

1. NextAuth: `app/api/auth/[...nextauth]/route.ts` với Keycloak provider, cookie riêng `shopfood.session-token`; `lib/auth.ts`, `lib/refreshAccessToken.ts` (copy pattern từ `shop-pay`).
2. `lib/syncUserProfile.ts` + bảng `user_profile` trong `shopfood`.
3. Role guard: `buyer` để đặt món, `food_admin` cho khu quản trị; `proxy.ts`/middleware redirect `/denied`.
4. Single Logout: endpoint `/api/auth/frontchannel-logout` + `SingleLogoutWatcher`; đăng ký `frontchannel.logout.url` cho client `shopfood-app` (đã có trong realm).
5. Nghiệp vụ: hoàn thiện `db/schema.ts` (menu, đơn món), trang menu, giỏ, đặt món; tùy chọn thanh toán qua ShopPay (tái dùng HMAC payment).
6. Wiring: thêm `shop-food` vào `npm run dev`, `db:push`, và phần push schema trong `reset.sh`.

Deliverable: login SSO vào :3300, đặt món, logout đồng bộ với các app khác.

Kiểm thử: smoke + role guard + SLO cho :3300.

Phụ thuộc: Phase 0 (client + DB + route đã sẵn).

### Phase 3 — Xây Admin Portal (DONE)

Mục tiêu: cổng quản trị nhân sự nền tảng, thao tác qua Keycloak Admin API.

Đã làm: NextAuth + cookie `admin-portal.session-token` + `proxy.ts` guard role admin nền tảng; `lib/keycloakAdmin.ts` qua `backend-admin-client` (list/count user, gán/thu hồi role, list realm roles, bật/tắt user); màn `/ecommerce` (gian hàng, catalog, đơn hàng, yêu cầu seller), `/food` (nhà hàng, thực đơn, đơn món, yêu cầu food-seller), `/users` (lọc + gán/thu hồi + bật/tắt), `/kyc` (đọc `shoppay.kyc_documents`, approve cập nhật DB ShopPay + gán `kyc-verified`, reject cập nhật trạng thái), `/audit`, dashboard `/`; phân quyền per-platform trong `lib/scope.ts` (KYC chỉ `admin`/`pay_admin`, bật/tắt user chỉ `admin`); frontchannel logout + watcher; DB riêng `admin_portal` cho audit/cache, đọc thêm DB `ecommerce`, `shopfood`, `shoppay` để hiển thị vận hành/KYC. Còn lại: test end-to-end qua trình duyệt và chuyển danh tính admin sang AD (Phase 4).

Bước:

1. NextAuth + guard yêu cầu role `admin`/`*_admin`; cookie `admin-portal.session-token`.
2. `lib/keycloakAdmin.ts` (copy từ `shop-pay`) dùng `backend-admin-client`: liệt kê user, gán/thu hồi role, reset, vô hiệu hoá.
3. Màn hình: danh sách user + lọc theo role; gán/thu hồi role; hàng đợi duyệt KYC (gán `kyc-verified`); audit log.
4. Phân quyền per-platform: `ecommerce_admin` -> ShopEcommerce + ShopSell, `food_admin` -> ShopFood, `pay_admin` -> ShopPay + KYC. `admin` thấy tất cả.
5. Single Logout endpoint + watcher.
6. Giai đoạn đầu test bằng `admin1` (Keycloak-local); sau Phase 4 chuyển sang danh tính AD.

Deliverable: admin đăng nhập :3400, quản lý user/role, duyệt KYC; mọi thao tác ghi audit.

Kiểm thử: user thiếu role admin bị chặn; gán role phản ánh trên Keycloak; duyệt KYC gán `kyc-verified`.

Phụ thuộc: `backend-admin-client` (đã có).

### Phase 4 — AD/LDAP federation cho nhân sự nền tảng (chạy LOCAL, DONE phần cốt lõi)

Mục tiêu: danh tính admin đến từ Windows Server AD; xoá khỏi AD là mất quyền. Giai đoạn này chạy **trên máy local** (DC trong VMware), **chưa cần VPS/Tailscale**.

**Runbook chi tiết: [docs/active-directory.md](docs/active-directory.md)** (mạng VMware Bridged, OU/group/user, service account, User Federation, group→role mapper, test, deprovisioning, troubleshooting).

Tóm tắt bước:

1. Dựng Windows Server AD DS trong VMware (domain `ecommerce.local`); card mạng **Bridged** + IP tĩnh; tạo OU `Admins`, `Groups`, `ServiceAccounts`.
2. Service account `keycloak-svc` (quyền đọc) cho Keycloak bind; group ứng role: `Platform-Admins`→`admin`, `Ecommerce-Admins`→`ecommerce_admin`, `Food-Admins`→`food_admin`, `Pay-Admins`→`pay_admin`.
3. Kết nối **LAN local**: Keycloak (Docker/WSL2) gọi `ldap://<IP-LAN-cua-DC>:389`. Điền tham chiếu `LDAP_*` trong `.env` (config thật nhập trong Keycloak Console). (Tailscale chỉ cần khi lên VPS — Phase 5.)
4. Keycloak realm `ecommerce-realm` -> User Federation -> add LDAP (vendor: Active Directory); test connection/auth; sync users.
5. `group-ldap-mapper` import group AD -> Keycloak group, rồi gán realm role cho từng group (Groups > Role mapping).
6. Deprovisioning: access token lifespan ngắn (5 phút); xoá user khỏi AD => refresh thất bại => mất quyền.
7. MFA cho nhân sự nền tảng: bật OTP/required action cho nhóm admin.
8. (Tùy chọn) đưa cấu hình federation vào realm JSON với placeholder `${LDAP_*}` + thêm vào `entrypoint.sh` `VARS_TO_RESOLVE` để tái lập tự động.

Deliverable hiện đã đạt: đăng nhập Admin Portal bằng tài khoản AD (`ad-admin`) và nhận role
qua group AD. Còn cần kiểm thử deprovisioning/MFA end-to-end.

Kiểm thử: login admin AD thành công và nhận đúng role theo group; xoá/đổi group trên AD và quan sát quyền thay đổi.

Phụ thuộc: Phase 3 (Admin Portal), hạ tầng AD local (VMware).

### Phase 5 — Triển khai VPS + Tailscale + Nginx + HTTPS

Bước:

1. Provision VPS DigitalOcean; cài Docker + Compose; cài Tailscale, join cùng tailnet với máy AD.
2. Cấu hình domain + TLS (Let's Encrypt) ở Nginx; chuyển cookie sang `secure: true`, sửa redirect URI/issuer sang domain thật trong realm + `.env` từng app.
3. `docker compose up -d` cho hạ tầng; chạy app (PM2/systemd hoặc container hoá Next.js).
4. Mở Nginx route cho cả 5 app; siết security headers.
5. Verify SSO/SLO/KYC/HMAC trên môi trường VPS.

Deliverable: hệ thống chạy trên VPS, Keycloak federate AD qua Tailscale.

Phụ thuộc: Phase 1-4.

### Phase 6 — Kerberos/SPNEGO desktop SSO (LOCAL IN PROGRESS)

Mục tiêu: từ máy domain-joined trong mạng nội bộ, truy cập web được Keycloak tự nhận diện không cần nhập lại.

Bước:

1. Dùng hostname LAN `app.ecommerce.local` thay `localhost`; DNS trên DC trỏ về IP máy thật.
2. Tạo SPN + keytab `HTTP/app.ecommerce.local@ECOMMERCE.LOCAL` cho Keycloak; mount keytab vào `keycloak/keytabs/`.
3. Cấu hình Kerberos integration trong LDAP federation provider.
4. Bật authenticator Kerberos trong browser flow và flow riêng `shoppay-alternatives`.
5. Chuyển `.env` app + redirect URI Keycloak sang `app.ecommerce.local` bằng script.
6. Mở port từ Win10 VM vào WSL bằng portproxy trỏ tới IP WSL, không trỏ vòng về `127.0.0.1`.
7. Cấu hình browser Win10 gửi Negotiate cho `app.ecommerce.local`.

Runbook: [docs/desktop-sso-kerberos.md](docs/desktop-sso-kerberos.md). Phụ thuộc: Phase 4.
Rủi ro còn lại nằm ở DNS/portproxy/browser policy trên máy Windows host và Win10 VM.

## Quyết định thiết kế & trade-off (tham chiếu)

- **Cookie riêng từng app**: tránh đè session khi nhiều app cùng `localhost`. Trên VPS dùng subdomain/path riêng.
- **Refresh token rotation**: mỗi app có `lib/refreshAccessToken.ts`; refresh fail (`invalid_grant`, `Session not active`) coi như logged-out, không lặp vô hạn. Đây cũng là nền cho deprovisioning AD.
- **ShopPay MFA per-client**: TOTP bind vào flow `browser-shoppay` thay vì toàn realm. Production nâng cấp step-up theo ACR/AMR.
- **Cross-app HMAC**: ShopEcommerce <-> ShopPay (`MERCHANT_HMAC_SECRET`) và ShopSell -> ShopEcommerce catalog (`CATALOG_SYNC_SECRET`). Symmetric, đủ cho demo; production cân nhắc chữ ký bất đối xứng.
- **KYC snapshot trong token**: topup > 5tr check role `kyc-verified` trong token hiện tại; sau approve cần login lại để nhận token mới. Cố ý để minh hoạ token là snapshot.
- **Frontchannel logout + watcher**: iframe ẩn + marker `localStorage`. Production nên thêm backchannel logout.
- **User profile cache**: bảng `user_profile` mỗi app, giảm gọi Admin API; trade-off có thể stale, cần event/webhook nếu cần consistency mạnh.

## Hướng production (ngoài scope các phase hiện tại)

- Backchannel logout chuẩn OIDC.
- Secrets manager thay `.env`.
- Drizzle migration versioned thay `db:push`.
- Nonce replay table cho payment URL.
- Observability: log Keycloak, audit dashboard, metrics.
