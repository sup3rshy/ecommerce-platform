# TODO — Mở rộng IAM theo hướng Shopee-style (SSO multi-app)

> Hệ sinh thái nhiều app dùng chung Keycloak làm IdP trung tâm, có federation IdP ngoài (Google, SAML), MFA, và (tuỳ) domain control cho thiết bị.

Phân loại:
- ✅ **Đã xong** — đã code + verify chạy.
- 🟡 **Cần external account / heavy infra** — không làm autonomously được.

---

## 1. Hạ tầng & dọn dẹp

- [x] **Chốt 2/3 use case** → đã chọn: **ShopPay** + **Seller Workspace**.
- [x] **Tách Postgres** ecommerce vs Keycloak — 2 service `postgres-keycloak`/`postgres-app` + 2 volume riêng + auto-init DB qua [scripts/init-app-dbs.sql](scripts/init-app-dbs.sql).
- [x] **Đưa secret ra `.env`** — 4 client secret + Postgres password + Keycloak admin password + SMTP + MERCHANT_HMAC_SECRET + GOOGLE_IDP_CLIENT_*. Realm.json chỉ giữ `${VAR}`.

## 2. Cấu hình Keycloak realm

- [~] **Thêm clients**: ✅ `seller-workspace`, ✅ `shoppay-app`; ⏳ `shopfood-app` chỉ cần khi build ShopFood.
- [~] **Roles**: ✅ `staff-warehouse`, `staff-cs`, `staff-finance`, `wallet-user`, `kyc-verified`, `buyer`, `seller`, `admin`. ⏳ `restaurant-owner`, `rider` cho ShopFood.
- [x] **Google IdP scaffolding** — realm có entry `identityProviders[google]` với `clientId`/`clientSecret` = `${VAR}`. **Cần bạn**:
   1. Vào https://console.cloud.google.com/apis/credentials → Create OAuth 2.0 Client ID → type **Web application**.
   2. Authorized redirect URIs: `http://localhost:8080/realms/ecommerce-realm/broker/google/endpoint`.
   3. Copy Client ID + Client Secret → paste vào `GOOGLE_IDP_CLIENT_ID` + `GOOGLE_IDP_CLIENT_SECRET` trong root `.env`.
   4. `bash scripts/reset.sh` để Keycloak import lại với credential mới.
   5. Test: vào http://localhost:3000 → click "Đăng nhập" → trang Keycloak có thêm nút "Sign in with Google" → click → Google consent → quay về app.
- [x] **IdentityProviderMapper** — auto-assign role `buyer` cho mọi user login qua Google. (Có thể đổi mapper sang `oidc-role-idp-mapper` để mapping theo claim cụ thể nếu muốn refined.)
- [x] **SAML 2.0 brokering** cho Seller Workspace — fully automated qua realm thứ 2:
   - [`keycloak/acme-corp-realm.json`](keycloak/acme-corp-realm.json): mock company IdP với 2 user `john.doe` / `jane.smith` (password `Acme@2024`), 1 SAML client cho `ecommerce-realm` SP.
   - `ecommerce-realm`: thêm IdP `acme-corp` (providerId=saml) trỏ về `acme-corp-realm` SAML endpoint, mapper auto-assign role `seller`.
   - `entrypoint.sh` rewrite — import multiple realm files từ `/import-template/*.json`.
   - Compose mount cả 2 realm files.
   - Test: kịch bản G1 trong README.
- [x] **TOTP enforce per-client cho `shoppay-app`** — Authentication Flow `browser-shoppay` (clone của browser, OTP REQUIRED + `userSetupAllowed=true`). Flow này được bind vào `shoppay-app.authenticationFlowBindingOverrides.browser`. Mọi user login ShopPay đều bị bắt setup TOTP nếu chưa có, và phải nhập code mỗi lần login.
- [x] **Keycloak Groups**: `store-demo-1` với 3 sub-group warehouse/cs/finance + 3 user mẫu.

## 3. App code & đồng bộ user

- [x] **Bảng `user_profile`** ở 3 app DB (sub, email, name, roles, groups). Sync qua `lib/syncUserProfile.ts` gọi từ NextAuth `jwt` callback.
- [x] **Scaffold ShopPay** — wallet, transactions, kyc, topup.
- [x] **Scaffold Seller Workspace** — staff_invitations, store_permissions, audit_logs.
- [ ] 🟡 **Keycloak Event Listener SPI** — sync user CRUD ngoài luồng login. Heavy Java work, marginal value vì sync 1 chiều ở login đã đủ 90% case. Defer vô thời hạn.

## 4. Demo flow

- [x] **Cross-app payment ecommerce → ShopPay → return** với HMAC signing 2 chiều, idempotent dedupe theo `merchant:orderId`.
- [x] **KYC admin approve flow** — `/kyc/admin` page cho admin/staff-finance review pending submissions; approve gọi Keycloak Admin API (client_credentials grant từ `backend-admin-client`) gán role `kyc-verified`. Action được audit log.
- [x] **ShopPay audit log** — bảng `audit_logs`, helper [`lib/audit.ts`](shoppay/lib/audit.ts), wired vào topup / pay / kyc.approve / kyc.reject. Page `/audit` read-only cho admin/staff-finance.
- [ ] 🟡 **Seller Workspace SAML SSO** — phụ thuộc 2.4 SAML IdP (xem trên).

## 5. Domain control (downstream)

- [~] **FreeIPA + LDAP federation** — service đã có trong [docker-compose.yml](docker-compose.yml) profile `domain`, [scripts/freeipa-seed.sh](scripts/freeipa-seed.sh) seed 2 user demo. LDAP federation config phải làm tay qua Keycloak Admin Console (xem README kịch bản G2). Lý do không tự động: LDAP federation provider trong realm.json import dễ break (cần cert chain, password encryption, mapper config phức tạp).
- [ ] 🟡 **Demo Kerberos SSO end-to-end** — join 1 VM Linux vào domain `EXAMPLE.TEST`, ssh dùng cùng password Keycloak. Out-of-scope cho demo platform này.

## 7. Hardening & polish

- [x] **Refresh token rotation** — NextAuth `jwt` callback check `accessTokenExpires`, gọi Keycloak `/token` với `grant_type=refresh_token` khi sắp hết hạn. Nếu refresh fail (refresh token revoked), set `token.error = "RefreshAccessTokenError"` để client biết. File: [`lib/refreshAccessToken.ts`](web-app/lib/refreshAccessToken.ts) ở cả 3 app.
- [x] **Frontchannel logout (SLO)** — 3 client có `frontchannelLogout=true` + `frontchannel.logout.url`; mỗi app có `/api/auth/frontchannel-logout` route xoá NextAuth session cookie. Khi user logout 1 app → Keycloak load iframe các app khác → cookie bị clear → app đó cũng signout.
- [x] **`/admin/users` UI** — list user + role chips clickable (revoke) + dropdown thêm role. POST `/api/admin/users/role` gọi Keycloak Admin API. Chỉ user có role `admin` access được.
- [x] **SAML attribute mappers** — firstName/lastName/email từ acme-corp SAML assertion → user attributes trong ecommerce-realm.
- [x] **Sample data seed** — [`web-app/db/seed.ts`](web-app/db/seed.ts) tạo 2 store + 6 product. Tự attach owner = sub của seller1 nếu user_profile đã có; hoặc placeholder + rerun sau.

## 6. Đóng gói & báo cáo

- [x] **Mermaid architecture diagram** trong README — upstream IdP → Keycloak broker → downstream apps + 2 Postgres + cross-app payment.
- [x] **README e2e** với 7 kịch bản test A–G.
- [x] **PLAN.md** — phân tích 1.3 (tách secret) + PLAN-NEXT (TOTP/SAML/Google/Mermaid).

---

## Bilan

**Đã xong autonomous (nhóm này không cần bạn làm gì)**:
1.2, 1.3, 2.5 (TOTP per-client), 2.6 (Google IdP mapper), 3.1, 4.1, 6.1, 6.2, PLAN.md
+ Google IdP scaffolding (realm + env + entrypoint sẵn sàng).

**Cần bạn cung cấp credential rồi mới test được**:
- 2.3 Google IdP — 5 phút đăng ký Google Cloud OAuth client.

**Cần làm tay qua Admin Console (không thể cứng hoá realm JSON)**:
- 2.4 SAML brokering — 2-3h, nhiều step UI.

**Defer / scope creep**:
- 3.4 Event Listener SPI, 5.x FreeIPA, ShopFood app.
