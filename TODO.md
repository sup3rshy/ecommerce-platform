# TODO - Trạng thái và roadmap

Snapshot sau 2 commit gần nhất:

- `b7d02e9 Fix SSO frontchannel logout handling`
- `cd1a77e Complete ShopPay KYC verification checks`

Ký hiệu:

- `[Done]` Đã có code và đã verify cơ bản.
- `[Partial]` Có code nhưng còn giới hạn hoặc cần thao tác thủ công.
- `[Next]` Nên làm tiếp.
- `[Later]` Ngoài scope demo hiện tại.

## 1. Infrastructure

- [Done] Docker Compose cho Keycloak, Postgres app, Postgres Keycloak, Nginx.
- [Done] 2 Postgres instance tách riêng lifecycle.
- [Done] `scripts/bootstrap.sh` sinh secret và sync `.env` cho root + 3 app.
- [Done] `scripts/reset.sh` backup, wipe volume, import realm, push schema và seed data.
- [Done] Root `npm run dev` chạy 3 app và warmup route chính.
- [Partial] FreeIPA có Docker profile `domain`, nhưng LDAP federation vào Keycloak vẫn là thao tác manual.

## 2. Identity và federation

- [Done] Realm chính `ecommerce-realm`.
- [Done] Mock enterprise realm `acme-corp-realm`.
- [Done] OIDC clients: `nextjs-app`, `seller-workspace`, `shoppay-app`.
- [Done] Service account client `backend-admin-client` cho Keycloak Admin API.
- [Done] Realm roles: `buyer`, `seller`, `admin`, staff roles, `wallet-user`, `kyc-verified`.
- [Done] Group demo `store-demo-1` và sub-groups cho warehouse/cs/finance.
- [Done] SAML identity brokering Acme Corp.
- [Done] ShopPay TOTP per-client qua `browser-shoppay`.
- [Partial] Google IdP brokering đã có env placeholder, cần Google OAuth client credential thật.

## 3. SSO, session và logout

- [Done] 3 app dùng NextAuth v4 với cookie name riêng.
- [Done] Refresh access token khi gần hết hạn.
- [Done] Refresh fail (`invalid_grant`, `Session not active`) được coi như logged-out, không lặp vô hạn.
- [Done] Proxy reject stale session có `RefreshAccessTokenError`.
- [Done] Frontchannel logout endpoint trên cả 3 app.
- [Done] `SingleLogoutWatcher` xử lý case iframe frontchannel không clear được cookie của tab đang mở.
- [Next] Backchannel logout chuẩn OIDC: verify signed `logout_token`, lưu revoked `sid`, check ở proxy/session.

## 4. Ecommerce app

- [Done] Buyer browse product, cart, checkout.
- [Done] Seller/admin pages và role guard cơ bản.
- [Done] Cross-app payment redirect sang ShopPay với HMAC.
- [Done] Return payment về ecommerce và update order.
- [Done] Admin role management UI qua Keycloak Admin API.
- [Partial] TypeScript hiện còn lỗi ở một số file ngoài phạm vi SSO/KYC, cần cleanup riêng.

## 5. Seller Workspace

- [Done] Guard toàn bộ workspace theo role seller/admin/staff.
- [Done] `/denied` không leak nav/path cho user không quyền.
- [Done] Staff invite và audit log.
- [Done] SAML Acme user có thể vào workspace như seller.
- [Next] Hoàn thiện type issue đang tồn tại ở `app/staff/page.tsx`.

## 6. ShopPay

- [Done] Wallet, topup, pay, KYC submit.
- [Done] `/kyc/admin` cho `admin` và `staff-finance`.
- [Done] Approve KYC update DB, gán role `kyc-verified` qua Keycloak Admin API, ghi audit.
- [Done] Approve idempotent: nếu DB đã approved vẫn gán lại role để tự heal Keycloak role bị thiếu.
- [Done] Topup > 5.000.000 VND check role `kyc-verified` trong session token hiện tại.
- [Done] Sau khi admin approve KYC, user cần logout/login lại để nhận token mới có role `kyc-verified`.
- [Done] User chưa KYC bị redirect sang `/kyc` thay vì ném error làm Next overlay.
- [Next] Thêm UI message trên `/topup` khi bị redirect do cần KYC.
- [Next] Thêm unit/integration test cho `doTopUp`, `approveKyc`, và HMAC payment.

## 7. Documentation

- [Done] `README.md` viết lại theo trạng thái mới.
- [Done] `PLAN.md` viết lại theo quyết định kiến trúc.
- [Done] `TODO.md` snapshot và roadmap.
- [Done] `presentation.md` script thuyết trình.

## 8. Roadmap ưu tiên

### Ngắn hạn

- [Next] Chạy full `tsc --noEmit` cho 3 app sau khi cleanup các lỗi có sẵn.
- [Next] Viết Playwright smoke test cho login, logout, KYC approve, topup >5tr.
- [Next] Thêm flash message khi redirect `/topup` -> `/kyc`.
- [Next] Lưu nonce đã dùng cho payment URL để chống replay thật sự.

### Trung hạn

- [Next] Backchannel logout.
- [Next] Step-up auth theo ACR/AMR cho ShopPay thay vì MFA mỗi login.
- [Next] Drizzle migrations versioned.
- [Next] Observability: Keycloak logs, app audit dashboard, metrics.

### Dài hạn

- [Later] Azure AD/Okta SAML thật thay cho `acme-corp-realm`.
- [Later] LDAP/FreeIPA federation end-to-end tự động hơn.
- [Later] WebAuthn/passkey.
- [Later] Event Listener SPI cho Keycloak để sync user lifecycle.
