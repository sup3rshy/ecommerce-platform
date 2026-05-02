# TODO — Mở rộng IAM theo hướng Shopee-style (SSO multi-app)

> Mục tiêu: từ ecommerce hiện tại → hệ sinh thái nhiều app dùng chung Keycloak làm IdP trung tâm, có federation IdP ngoài (Google, SAML), MFA, và (tuỳ) domain control cho thiết bị.

---

## 1. Hạ tầng & dọn dẹp

- [x] **Chốt 2/3 use case** → đã chọn: **ShopPay** + **Seller Workspace**.
- [ ] Tách Postgres ecommerce ra khỏi Postgres Keycloak trong [docker-compose.yml](docker-compose.yml) (2 service riêng, 2 volume riêng).
- [ ] Đưa client secret và `KEYCLOAK_ADMIN_PASSWORD` ra `.env`, bỏ hardcode trong [keycloak/ecommerce-realm.json](keycloak/ecommerce-realm.json) và compose.

## 2. Cấu hình Keycloak realm

- [~] Thêm clients mới vào realm: ✅ `seller-workspace` xong; ⏳ `shoppay-app`, (optional) `shopfood-app`.
- [~] Thêm role realm: ✅ `staff-warehouse`, `staff-cs`, `staff-finance` xong; ⏳ `wallet-user`, `kyc-verified`, `restaurant-owner`, `rider`.
- [ ] Cấu hình **Identity Brokering** với Google IdP (cho ecommerce + ShopFood).
- [ ] Cấu hình **SAML 2.0 IdP** mẫu (mock Azure AD/Okta bằng `samltest.id` hoặc 1 Keycloak realm khác làm IdP) cho Seller Workspace — minh hoạ "Employer SSO".
- [ ] Bật **MFA (TOTP)** bắt buộc riêng cho client `shoppay-app` qua Authentication Flow tuỳ biến.
- [x] Tạo **Keycloak Groups**: đã có `store-demo-1` với 3 sub-group warehouse/cs/finance + 3 user mẫu.
- [ ] Thêm **IdentityProviderMapper**: claim `email_verified=true` của Google → tự gán role `food-buyer`.

## 3. App code & đồng bộ user

- [ ] Tạo bảng `user_profile` ở app DB (cache `sub`, email, name, roles) để tránh gọi Keycloak Admin API mỗi request.
- [ ] Scaffold Next.js app **ShopPay** (client OIDC `shoppay-app`, schema `wallets`, `transactions`, `kyc_documents`).
- [x] Scaffold Next.js app **Seller Workspace** (schema `staff_invitations`, `store_permissions`, `audit_logs`) → [seller-workspace/](seller-workspace).
- [ ] Cài **Keycloak Event Listener SPI** để đồng bộ user (create/update/delete) sang `user_profile` của các app.

## 4. Demo flow

- [ ] Flow **ecommerce → ShopPay**: checkout redirect, SSO silent login, trừ ví, callback về order.
- [ ] Flow **Seller Workspace SAML SSO**: login bằng SAML IdP của "công ty seller" giả lập → vào thẳng workspace.

## 5. Domain control (downstream)

- [ ] Dựng **FreeIPA** hoặc **Samba AD-DC** trong container, federate vào Keycloak qua **LDAP User Federation**.
- [ ] Join 1 VM Linux vào domain → demo `kinit` lấy Kerberos ticket bằng cùng password Keycloak.
- [ ] (Optional) Deploy Keycloak + FreeIPA lên VPS (Oracle Free / Azure student) để demo thật trên laptop ngoài.

## 6. Đóng gói & báo cáo

- [ ] Vẽ slide/sơ đồ kiến trúc tổng thể: upstream IdP (Google, SAML, LDAP) → Keycloak broker → downstream apps (ecommerce, ShopPay, Seller Workspace) + devices (PC/Laptop/Mobile).
- [ ] Viết README hướng dẫn chạy demo end-to-end.

---

## Thứ tự đề xuất

`1.2 → 1.3 → 2.1 → 3.1 → 3.2` trước (hạ tầng sạch → realm mở rộng → ShopPay chạy được).
SAML + FreeIPA để cuối vì tốn thời gian nhất.
