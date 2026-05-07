# TODO — Mở rộng IAM theo hướng Shopee-style (SSO multi-app)

> Hệ sinh thái nhiều app dùng chung Keycloak làm IdP trung tâm, có federation IdP ngoài (Google, SAML), MFA, và (tuỳ) domain control cho thiết bị.

Phân loại:
- ✅ **Đã xong** — đã code + verify chạy.
- 🟡 **Cần external account / heavy infra** — không làm autonomously được (cần Google OAuth client thật, samltest.id, FreeIPA cluster, hoặc Java SPI build chain).

---

## 1. Hạ tầng & dọn dẹp

- [x] **Chốt 2/3 use case** → đã chọn: **ShopPay** + **Seller Workspace**.
- [x] **Tách Postgres ecommerce ra khỏi Postgres Keycloak** trong [docker-compose.yml](docker-compose.yml). 2 service `postgres-keycloak` (nội bộ, không expose) và `postgres-app` (`:5432`), 2 volume riêng. DB app tự tạo qua [scripts/init-app-dbs.sql](scripts/init-app-dbs.sql).
- [x] **Đưa secret ra `.env`** — client secret 4 client + Postgres password + Keycloak admin password + SMTP password + MERCHANT_HMAC_SECRET. Realm.json chỉ giữ `${VAR}` placeholder, [keycloak/entrypoint.sh](keycloak/entrypoint.sh) resolve trước khi import.

## 2. Cấu hình Keycloak realm

- [~] **Thêm clients**: ✅ `seller-workspace`, ✅ `shoppay-app`; ⏳ (optional) `shopfood-app` — chỉ cần khi build app ShopFood.
- [~] **Thêm role realm**: ✅ `staff-warehouse`, `staff-cs`, `staff-finance`, `wallet-user`, `kyc-verified`; ⏳ `restaurant-owner`, `rider` — chỉ cần khi có ShopFood.
- [ ] 🟡 **Identity Brokering Google IdP** — cần Google OAuth client_id + client_secret thật (đăng ký ở [console.cloud.google.com](https://console.cloud.google.com/apis/credentials)). Sau khi có, vào Keycloak Admin → Identity Providers → Google, paste vào.
- [ ] 🟡 **SAML 2.0 IdP brokering** cho Seller Workspace — cần 1 trong:
   - Tạo realm thứ 2 trong cùng Keycloak làm "công ty seller IdP" → export SAML metadata → import vào realm chính.
   - Hoặc dùng [samltest.id](https://samltest.id/) để có IdP công khai.
- [~] **MFA TOTP**: ✅ user `wallet1` có required action `CONFIGURE_TOTP`. ⏳ Enforce cho **mọi** user khi login client `shoppay-app` thay vì chỉ wallet1 — cần thêm `authenticationFlows` + `authenticationFlowBindingOverrides` vào realm.json (medium complexity, có thể làm sau).
- [x] **Keycloak Groups**: `store-demo-1` với 3 sub-group warehouse/cs/finance + 3 user mẫu.
- [ ] 🟡 **IdentityProviderMapper** Google `email_verified=true` → role `food-buyer`. Phụ thuộc Google IdP đã setup.

## 3. App code & đồng bộ user

- [x] **Bảng `user_profile`** ở 3 app DB (cache `sub`, email, name, roles, groups). Sync qua [`syncUserProfile.ts`](web-app/lib/syncUserProfile.ts) gọi từ NextAuth `jwt` callback lúc user vừa login.
- [x] **Scaffold ShopPay** — wallet, transactions, kyc, topup. Schema [shoppay/db/schema.ts](shoppay/db/schema.ts).
- [x] **Scaffold Seller Workspace** — staff_invitations, store_permissions, audit_logs.
- [ ] 🟡 **Keycloak Event Listener SPI** để đồng bộ user create/update/delete sang `user_profile` (ngoài luồng login). Cần build Java jar + extend Keycloak Docker image. Hiện tại sync 1 chiều lúc login đã đủ cho 90% use case — defer khi có nhu cầu xoá user phải xoá cache.

## 4. Demo flow

- [x] **Cross-app payment ecommerce → ShopPay → return** với HMAC signing 2 chiều.
   - Outbound: [`web-app/app/orders/page.tsx`](web-app/app/orders/page.tsx) tạo URL signed cho mỗi order pending.
   - PSP side: [`shoppay/app/pay/page.tsx`](shoppay/app/pay/page.tsx) verify HMAC, hiện confirmation, trừ ví idempotent (dedupe theo `merchant:orderId`).
   - Return: [`web-app/app/payment/return/route.ts`](web-app/app/payment/return/route.ts) verify HMAC, mark order `shipping`.
- [ ] 🟡 **Seller Workspace SAML SSO** — phụ thuộc 2.4 SAML IdP có chưa.

## 5. Domain control (downstream)

- [ ] 🟡 **FreeIPA / Samba AD-DC + LDAP federation** — heavy infra. Cần:
   - Container FreeIPA (image `freeipa/freeipa-server`) hoặc Samba.
   - Cấu hình LDAP User Federation trong Keycloak Admin → User Federation → ldap.
   - Test bằng cách join 1 VM Linux vào domain → `kinit user@REALM` lấy Kerberos ticket.
   - Multi-day work, để cuối cùng.

## 6. Đóng gói & báo cáo

- [ ] **Slide/sơ đồ kiến trúc tổng thể** (mermaid hoặc draw.io). Stack đã có ASCII diagram trong [README.md](README.md).
- [x] **README e2e** với 7 kịch bản test A–G.
- [x] **PLAN.md** giải thích thiết kế tách secret + tham chiếu mọi quyết định trade-off.

---

## Tóm tắt còn lại (3 nhóm)

**Nhóm A — chỉ cần đăng ký account ngoài rồi paste vào Keycloak Admin Console:**
- 2.3 Google IdP (15 phút sau khi có Google OAuth credential)
- 2.4 SAML IdP qua samltest.id (30 phút)
- 2.6 IdP Mapper (5 phút sau A1)

**Nhóm B — code/config phức tạp, làm được autonomous nhưng tốn thời gian:**
- 2.5 Authentication Flow enforce TOTP per-client (1–2h, edit realm.json `authenticationFlows`)
- 3.4 Event Listener SPI (1 ngày, Java jar + extend Docker image)
- 6.1 Sơ đồ mermaid (15 phút)

**Nhóm C — heavy infra, multi-container:**
- 5.x FreeIPA + LDAP federation (1–3 ngày)
- (optional) ShopFood app + restaurant-owner/rider roles (1 ngày)

Đề xuất: làm **nhóm A** trước nếu muốn demo IdP federation đa dạng. **Nhóm C** chỉ làm nếu thực sự cần demo domain control.
