# Admin Portal — Quản trị tập trung

Cổng quản trị tập trung cho **nhân sự nền tảng** (platform personnel). Khác với buyer/seller (xác thực qua PostgreSQL), nhân sự nền tảng xác thực qua **Domain Controller (LDAP)** federate vào Keycloak `ecommerce-realm`; Desktop SSO dùng Kerberos/SPNEGO qua `app.ecommerce.local`.

> Trạng thái: **DONE**. SSO/SLO, guard role admin nền tảng, module vận hành Ecommerce/Food, quản lý user/role, duyệt KYC và audit log đã chạy. LDAP/MFA cho nhân sự nền tảng là Phase 4.

| Thuộc tính | Giá trị |
| --- | --- |
| Port | 3400 |
| OIDC client | `admin-portal` |
| Realm | `ecommerce-realm` |
| Admin API client | `backend-admin-client` (service account, realm-management roles) |
| DB | `admin_portal` (audit/cache); đọc thêm `ecommerce`, `shopfood`, `shoppay` để hiển thị vận hành/KYC |
| Nguồn danh tính | Domain Controller LDAP; Keycloak-local `admin1` chỉ là fallback lab |
| Role | `admin` (toàn quyền) và per-platform: `ecommerce_admin`, `food_admin`, `pay_admin` |

## Trách nhiệm

- `/ecommerce`: xem gian hàng, catalog, đơn hàng, tài khoản buyer/seller/staff và duyệt yêu cầu seller. `ecommerce_admin` là role hợp nhất cho ShopEcommerce + ShopSell.
- `/food`: xem nhà hàng ShopFood, thực đơn, đơn món, tài khoản Food; duyệt yêu cầu food-seller; đổi trạng thái đơn và ẩn/hiện món.
- `/users`: quản lý user và gán/thu hồi role qua Keycloak Admin API (`backend-admin-client`).
- `/kyc`: đọc hồ sơ từ `shoppay.kyc_documents`; approve cập nhật hồ sơ ShopPay + gán role `kyc-verified`, reject cập nhật trạng thái và ghi audit.
- Bật/tắt tài khoản (chỉ `admin`) — nền cho deprovisioning.
- Phân quyền per-platform: mỗi *_admin chỉ quản lý nhóm role trong phạm vi nền tảng của mình (xem `lib/scope.ts`).
- Ghi audit mọi thao tác quản trị vào DB `admin_portal`.

## Phân quyền per-platform (lib/scope.ts)

| Admin role | Được gán/thu hồi |
| --- | --- |
| `admin` | mọi role |
| `ecommerce_admin` | `buyer`, `seller`, `staff` |
| `food_admin` | `buyer`, `food-seller` |
| `pay_admin` | `wallet-user`, `kyc-verified` |

Duyệt KYC (`kyc-verified`) chỉ dành cho `admin` và `pay_admin`. Gán shop (Keycloak group `store-*`) dành cho `admin` và `ecommerce_admin`. *_admin không tự gán role admin nền tảng khác (tránh leo thang đặc quyền).

## Cấu trúc

```text
admin-portal/
├── app/
│   ├── api/auth/[...nextauth]/route.ts   # NextAuth + cookie admin-portal.session-token
│   ├── api/auth/frontchannel-logout/     # SLO endpoint
│   ├── components/                       # TopBar, SingleLogoutWatcher
│   ├── ecommerce/                        # vận hành ShopEcommerce + ShopSell
│   ├── food/                             # vận hành ShopFood
│   ├── users/                            # danh sách user + gán/thu hồi role
│   ├── kyc/                              # duyệt hồ sơ ShopPay + gán/thu hồi kyc-verified
│   ├── audit/                            # audit log
│   ├── denied/                           # trang chặn
│   ├── layout.tsx · providers.tsx · page.tsx (dashboard)
├── db/            # schema (audit_logs, user_profile) + index
├── lib/           # keycloakAdmin, platformData, scope, audit, refreshAccessToken
├── proxy.ts       # middleware guard (role admin nền tảng)
└── drizzle.config.ts
```

## Chạy

Từ root: `npm run dev` (đã gồm admin-portal :3400). Hoặc riêng:

```bash
cd admin-portal && npm install && npm run db:push && npm run dev
```

Đăng nhập SSO bằng tài khoản có role admin nền tảng (vd `admin1`). Endpoint kiểm thử: `:3400/ecommerce`, `/food`, `/users`, `/kyc`, `/audit`.

## Còn lại

- MFA bắt buộc cho nhóm admin.
- Deprovisioning: xoá/disable trên AD => mất quyền sau khi token hết hạn.
- Test Desktop SSO từ Win10 domain-joined theo `docs/desktop-sso-kerberos.md`.
