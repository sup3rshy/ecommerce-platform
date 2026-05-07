# TODO — Trạng thái + Hướng đi

> Snapshot ngắn gọn. Test plan chi tiết xem [README.md#test-plan-đầy-đủ](README.md). Phân tích kiến trúc xem [PLAN.md](PLAN.md).

Phân loại:
- ✅ **Done** — code + verify chạy.
- 🟡 **Cần input bên ngoài** — code sẵn, đợi credential / heavy infra setup tay.
- ⏳ **Roadmap** — chưa làm, có thể làm tiếp.
- ❌ **Skip** — out of scope demo, defer vô thời hạn.

---

## 1. Hạ tầng

- ✅ **Tách Postgres** — `postgres-keycloak` (nội bộ) + `postgres-app` (`:5432`), 2 volume riêng, auto-init DB qua [`scripts/init-app-dbs.sql`](scripts/init-app-dbs.sql).
- ✅ **Secret 100% trong `.env`** — root `.env` quản lý 8 secret, realm.json chỉ giữ `${VAR}`, [`keycloak/entrypoint.sh`](keycloak/entrypoint.sh) sed-resolve trước khi import (multi-realm support).
- ✅ **Bootstrap idempotent** — [`scripts/bootstrap.sh`](scripts/bootstrap.sh) sinh + sync secret cho root `.env` và 3 app `.env` trong 1 lệnh.
- ✅ **Reset 1 phát** — [`scripts/reset.sh`](scripts/reset.sh): backup pg_dumpall → wipe 2 volume → import 2 realm → tạo DB → push schema → seed sample data.
- ✅ **Concurrently runner + warmup** — [`package.json`](package.json) `npm run dev` chạy 3 app + pre-warm route chính qua [`scripts/warmup.sh`](scripts/warmup.sh).

## 2. Realm & federation

- ✅ **3 OIDC client** — `nextjs-app`, `seller-workspace`, `shoppay-app` + service account `backend-admin-client` (cho Admin API).
- ✅ **8 realm role** — `buyer`, `seller`, `admin`, `staff-warehouse/cs/finance`, `wallet-user`, `kyc-verified`.
- ✅ **Keycloak Groups** — `store-demo-1` với 3 sub-group (warehouse/cs/finance), 3 user mẫu.
- ✅ **TOTP enforce per-client cho `shoppay-app`** — flow `browser-shoppay` không có `auth-cookie`, OTP REQUIRED + `userSetupAllowed=true`. Client bind override.
- ✅ **SAML 2.0 brokering** — realm thứ 2 [`acme-corp-realm`](keycloak/acme-corp-realm.json) làm mock company IdP với 2 user demo. IdP entry `acme-corp` trong ecommerce-realm + 4 mapper (role + firstName + lastName + email).
- ✅ **Frontchannel logout (SLO)** — 3 client bật `frontchannelLogout`, mỗi app có `/api/auth/frontchannel-logout` endpoint xoá NextAuth cookie.
- 🟡 **Google IdP brokering** — realm + entrypoint sẵn sàng. Bạn cần đăng ký Google OAuth client (free, 5 phút) → paste `GOOGLE_IDP_CLIENT_ID`/`SECRET` vào root `.env` → `bash scripts/reset.sh`. IdP Mapper auto-assign role `buyer`.

## 3. App code

- ✅ **3 Next.js 16 app** — App Router, NextAuth v4, Drizzle 0.45.
- ✅ **Cookie name riêng** — 3 app không đè cookie nhau trên `localhost`.
- ✅ **proxy.ts route guard** — middleware check role; seller-workspace chặn toàn bộ trừ `/denied`, `/api/auth/*`.
- ✅ **`/denied` page tối giản** — không leak nav menu, route names, hoặc role required.
- ✅ **`user_profile` cache** — 3 app đều có bảng cache (sub, email, name, roles, groups), sync qua `lib/syncUserProfile.ts` ở NextAuth `jwt` callback.
- ✅ **Refresh token rotation** — `lib/refreshAccessToken.ts` ở 3 app; `jwt` callback tự refresh khi access token < 60s, set `error=RefreshAccessTokenError` nếu fail.
- ✅ **Resilient SignIn** — TopBar dùng pattern `signIn(...,{redirect:false})` lấy URL rồi `window.location.href`, fallback `/api/auth/signin` nếu fetch CSRF timeout (Turbopack first-compile).
- ✅ **HMAC sig helper** — `lib/sig.ts` ở web-app + shoppay (SHA-256, timing-safe compare).
- ✅ **Audit log** — seller-workspace (staff/store events) + shoppay (wallet.topup / wallet.pay / kyc.approve|reject) với IP tracking.
- ✅ **Sample data seed** — [`web-app/db/seed.ts`](web-app/db/seed.ts) idempotent, 2 store + 6 product, lookup seller1 sub từ user_profile.

## 4. Demo flow

- ✅ **Cross-app payment ecommerce → ShopPay → return** với HMAC 2 chiều, idempotent dedupe theo `merchant:orderId`.
- ✅ **KYC admin approve full e2e** — `/kyc/admin` cho `admin`/`staff-finance`, gọi Keycloak Admin API gán role `kyc-verified`, audit log.
- ✅ **Topup gating** — business rule check role `kyc-verified` cho amount > 5tr.
- ✅ **Admin role mgmt UI** — `/admin/users` ở web-app: chip role click revoke, dropdown thêm role, gọi Admin API qua `/api/admin/users/role`.

## 5. Domain control (downstream)

- 🟡 **FreeIPA + LDAP federation** — service trong [docker-compose.yml](docker-compose.yml) profile `domain` (heavy ~5-10 phút provision), [`scripts/freeipa-seed.sh`](scripts/freeipa-seed.sh) tạo 2 user. LDAP federation trong Keycloak phải làm tay qua Admin Console (8 step trong README G3) — config qua realm.json không reliable.
- ⏳ **VM Linux join domain** + `kinit` Kerberos demo — out-of-scope cho repo này, nhưng workflow đã chứng minh được khi LDAP federation OK.

## 6. Documentation

- ✅ **README** với mermaid component diagram + 4 sequence diagram + 12 test scenario A-L + troubleshooting + roadmap 4 nhóm.
- ✅ **PLAN.md** giải thích 1.3 (tách secret) + PLAN-NEXT (TOTP/SAML/Google/Mermaid).
- ✅ **todo.md** (file này) snapshot trạng thái.

---

## ⏳ Roadmap (chưa làm, sắp xếp theo độ khó)

### Production hardening (1-2 tuần)
- HTTPS + reverse proxy thật (Let's Encrypt), cookie `secure: true`.
- Secrets manager (Vault / Doppler / AWS SM) thay `.env`.
- Postgres backup tự động + restore drill.
- Drizzle migration files versioned (thay `db:push` auto-detect).
- Test coverage: unit + integration cho server actions, HMAC, auth flow.
- Observability: Keycloak metrics → Prometheus, logs → Loki.

### IAM nâng cao (2-3 tuần)
- **Authorization Services** — chuyển từ RBAC tự code sang policy declarative trong Keycloak.
- **Step-up auth `acr_values`** — TOTP chỉ khi sensitive op, không enforce mỗi login.
- **WebAuthn / Passkey** — passwordless thay TOTP.
- **Account linking auto-by-email** — silent link khi Google email match form user.
- **Backchannel logout chuẩn** — DB-backed revoked sid list, signed `logout_token` verify (vượt frontchannel iframe limitation).
- **Event Listener SPI** — Java jar sync user CRUD ngoài luồng login.

### Mở rộng platform (1-2 tháng)
- **ShopFood app** — restaurant marketplace, roles `restaurant-owner`/`rider`, demo SSO 4 app.
- **Mobile app via OIDC PKCE** — React Native / Flutter, public client.
- **B2B SAML thật** — Azure AD / Okta thay mock acme-corp.
- **Multi-domain LDAP federation** — Keycloak hub cho N enterprise.
- **Audit data warehouse** — ClickHouse + Grafana dashboard.
- **i18n** — VI/EN/JP/KO cho cả Keycloak login pages + app.

### Báo cáo / luận văn
- Slide A0 từ Mermaid hiện có.
- k6 / wrk load test → throughput benchmark.
- Feature matrix Keycloak vs Auth0 vs Okta vs Cognito.
- STRIDE threat model.

---

## ❌ Skip

- **ShopFood app trong phase này** — scope creep, không thêm gì mới về IAM bản chất.
- **Step-up acr_values trong demo này** — `shoppay-forms` flow đã enforce TOTP mỗi login, step-up redundant. Roadmap để thay thế khi cần UX tốt hơn.
- **VM join domain end-to-end** — workflow đã clear khi LDAP OK, không cần build thật trong repo demo.
