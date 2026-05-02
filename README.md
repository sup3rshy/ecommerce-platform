# Ecommerce Platform — Multi-App SSO Demo

Hệ sinh thái nhiều app dùng chung 1 Keycloak làm IdP trung tâm — mô phỏng kiến trúc Shopee / ShopeeFood / ShopeePay.

Hiện có 2 app:
- **ecommerce** ([web-app/](web-app)) — chợ điện tử cho buyer/seller (đăng ký bán, mua, đặt đơn).
- **seller-workspace** ([seller-workspace/](seller-workspace)) — back-office riêng cho chủ shop + nhân viên (kho / CSKH / kế toán).

Cả 2 app login chung qua Keycloak realm `ecommerce-realm`. 1 lần đăng nhập → vào được mọi app (silent SSO).

---

## Kiến trúc

```
                 Browser
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
  :3000         :3100         :8080
ecommerce  seller-workspace  Keycloak
  (web-app)                 (Identity Provider)
      │             │             │
      └──────┬──────┘             │
             ▼                    ▼
        Postgres (5432) ◄─────────┘
        ├── ecommerce DB  (stores, products, orders, cart)
        ├── keycloak DB   (Keycloak data + staff_invitations,
        │                  store_permissions, audit_logs)
        └── (shared instance, dev mode)

Nginx (:8000) — reverse proxy gom Keycloak + 2 app vào 1 origin
  /        → web-app:3000
  /seller/ → seller-workspace:3100
  /auth/   → keycloak:8080
```

| Stack | Version | Note |
|---|---|---|
| Next.js | 16 | App Router, Server Actions, Turbopack |
| NextAuth | 4.24 | OIDC client cho Keycloak |
| Keycloak | latest | Realm import từ `keycloak/ecommerce-realm.json` |
| Drizzle ORM | 0.45 | Type-safe SQL |
| PostgreSQL | 15 | 1 instance, 2 database |
| Nginx | latest | Reverse proxy |
| Node.js | 22 LTS | (Node 25 lỗi silent-exit với Next 16, dùng 22) |

---

## Yêu cầu

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) đang chạy
- Node.js **22 LTS** (khuyên dùng nvm)
- npm

WSL2 OK. Nếu dùng WSL: tất cả `npm install` và `npm run dev` chạy **bên trong WSL**, không share `node_modules` với Windows.

---

## Setup từ đầu

### 1. Clone và start hạ tầng

```bash
git clone <repo>
cd ecommerce-platform
docker compose up -d
```

Đợi ~30-60s để Keycloak import realm. Verify:

```bash
curl -s http://localhost:8080/realms/ecommerce-realm/.well-known/openid-configuration | head -c 200
```

Phải thấy JSON có `"issuer": "http://localhost:8080/realms/ecommerce-realm"`.

### 2. Tạo databases riêng cho từng app

Postgres mặc định chỉ có DB `keycloak`. Mỗi app cần DB riêng (tránh drizzle nhầm bảng Keycloak):

```bash
docker exec -i $(docker ps -qf "name=postgres") \
  psql -U admin -d postgres -c "CREATE DATABASE ecommerce; CREATE DATABASE seller_workspace;"
```

### 3. Setup web-app (ecommerce)

```bash
cd web-app
cp .env.example .env.local   # Hoặc tạo thủ công, xem nội dung bên dưới
npm install
npm run db:push              # Tạo bảng stores, products, orders, cart, ...
npm run dev                  # http://localhost:3000
```

`.env.local` cho web-app:

```env
DATABASE_URL=postgresql://admin:password@localhost:5432/ecommerce
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=my-super-secret-key-change-in-production
KEYCLOAK_ISSUER=http://localhost:8080/realms/ecommerce-realm
KEYCLOAK_CLIENT_ID=nextjs-app
KEYCLOAK_CLIENT_SECRET=my-super-secret-key
```

### 4. Setup seller-workspace

Mở **terminal mới** (giữ web-app chạy):

```bash
cd seller-workspace
cp .env.example .env
npm install
npm run db:push              # Tạo bảng staff_invitations, store_permissions, audit_logs
npm run dev                  # http://localhost:3100
```

`.env` cho seller-workspace:

```env
DATABASE_URL=postgres://admin:password@localhost:5432/seller_workspace
NEXTAUTH_URL=http://localhost:3100
NEXTAUTH_SECRET=change-me-seller-workspace
KEYCLOAK_CLIENT_ID=seller-workspace
KEYCLOAK_CLIENT_SECRET=seller-workspace-secret
KEYCLOAK_ISSUER=http://localhost:8080/realms/ecommerce-realm
```

### 5. Test

| URL | Mục đích |
|---|---|
| http://localhost:3000 | ecommerce (buyer/seller) |
| http://localhost:3100 | seller-workspace (chủ shop / nhân viên) |
| http://localhost:8080 | Keycloak Admin (admin/admin) |
| http://localhost:8000 | Nginx gateway gom cả 3 |

---

## Tài khoản demo

Có sẵn trong realm sau khi import:

| Username | Password | Role | Group |
|---|---|---|---|
| `buyer1` | `123456` | buyer | - |
| `seller1` | `123456` | seller | - |
| `admin1` | `admin123` | admin | - |
| `warehouse1` | `123456` | staff-warehouse | /store-demo-1/warehouse |
| `cs1` | `123456` | staff-cs | /store-demo-1/cs |
| `finance1` | `123456` | staff-finance | /store-demo-1/finance |

---

## Test SSO (4 kịch bản)

### 1. Silent SSO cross-app

1. Login `seller1` ở http://localhost:3000.
2. Mở tab mới → http://localhost:3100 → bấm "Đăng nhập SSO".
3. **Kỳ vọng**: redirect qua Keycloak → quay về luôn, không cần nhập password.

Verify trong DevTools Network: request `/auth/realms/.../auth?...` phải trả 302 thẳng về callback, không qua trang login form.

### 2. Multi-staff per store

1. Login `warehouse1` ở http://localhost:3100 → vào `/dashboard`.
2. Sẽ thấy `roles: staff-warehouse`, `groups: /store-demo-1/warehouse`.
3. Logout → login `cs1` → thấy role + group khác.

→ Minh hoạ Keycloak Groups (cùng store, khác quyền).

### 3. Server actions + audit log

1. Login `seller1` ở http://localhost:3100 → `/staff` → mời 1 email + role.
2. Vào `/audit` → thấy log `staff.invite` xuất hiện.

### 4. Single Logout (front-channel)

1. Login ở cả 2 app.
2. Logout ở 1 app → reload app còn lại → khi gọi token lần kế tiếp, Keycloak phát hiện session đã chết.

> Chưa có **back-channel logout** (cần config thêm). Là task tiếp theo.

---

## Cấu trúc

```
ecommerce-platform/
├── docker-compose.yml          # Postgres + Keycloak + Nginx
├── keycloak/
│   └── ecommerce-realm.json    # Realm + 2 clients + roles + groups + users
├── nginx/
│   └── nginx.conf              # Reverse proxy + rate limit
├── web-app/                    # ecommerce app (port 3000)
│   ├── app/                    # buyer/seller/admin pages + API
│   ├── db/schema.ts            # stores, products, orders, cart, seller_upgrade_requests
│   ├── lib/keycloak-admin.ts   # Keycloak Admin API client
│   └── proxy.ts                # NextAuth middleware (RBAC)
├── seller-workspace/           # back-office app (port 3100)
│   ├── app/
│   │   ├── api/auth/[...nextauth]/route.ts  # OIDC + cookie name riêng
│   │   ├── components/TopBar.tsx
│   │   ├── dashboard/page.tsx  # identity + roles + groups
│   │   ├── staff/page.tsx      # mời + thu hồi nhân viên
│   │   └── audit/page.tsx      # audit log read-only
│   ├── db/schema.ts            # staff_invitations, store_permissions, audit_logs
│   ├── lib/audit.ts            # helper ghi audit
│   └── proxy.ts                # bảo vệ /dashboard, /staff, /audit
├── README.md
└── todo.md                     # Lộ trình mở rộng (ShopPay, SAML, FreeIPA, ...)
```

---

## Database schema

**`ecommerce` DB** (web-app):
```
stores  ─┬─→ products  ─┬─→ orders
         │              └─→ cart_items
         └─ seller_upgrade_requests
```

**`keycloak` DB** (Keycloak + seller-workspace):
```
[Keycloak schema mặc định]
+
staff_invitations    (storeId, email, role, status, invitedBy)
store_permissions    (storeId, userId, role, grantedAt, revokedAt)
audit_logs           (storeId, actorId, action, resource, metadata, createdAt)
```

> Production sẽ tách riêng DB cho seller-workspace. Hiện share để demo gọn.

---

## Troubleshooting

**`unauthorized_client (Invalid client credentials)` khi callback**
→ Keycloak chưa load client mới. Chạy:
```bash
docker exec -i $(docker ps -qf "name=postgres") psql -U admin -d postgres -c "DROP DATABASE keycloak;"
docker exec -i $(docker ps -qf "name=postgres") psql -U admin -d postgres -c "CREATE DATABASE keycloak;"
docker compose restart keycloak
```
(Chỉ wipe DB Keycloak, không đụng `ecommerce`.)

**`/dashboard` redirect về signin dù đã login**
→ Cookie name của 2 app phải khớp với `cookieName` truyền vào `getToken()` trong `proxy.ts`. Hiện đã set đúng (`seller-workspace.session-token`), nếu sửa thì sửa cả 2 chỗ.

**`Cannot find module '../lightningcss.linux-x64-gnu.node'`**
→ Native binary thiếu trên WSL. seller-workspace đã bỏ Tailwind v4 nên không cần. Nếu thêm lại, dùng:
```bash
npm install --include=optional
# hoặc
npm install lightningcss-linux-x64-gnu --no-save --force
```

**Next dev exit silently sau "Ready"**
→ Đang dùng Node 25. Chuyển Node 22 LTS:
```bash
nvm use 22
rm -rf node_modules package-lock.json
npm install
```

**`database "ecommerce" does not exist`**
→ Quên bước 2 (tạo DB). Chạy lệnh `CREATE DATABASE ecommerce;` ở phần Setup.

**Đã chạy `npm audit fix --force` và mọi thứ hỏng**
→ Lệnh đó downgrade `next-auth` về v3, vỡ tất cả import. Restore package.json:
```json
"next-auth": "^4.24.13",
"drizzle-kit": "^0.31.10"
```
Rồi `rm -rf node_modules package-lock.json && npm install`.

---

## Lộ trình mở rộng

Xem [todo.md](todo.md) cho roadmap đầy đủ. Các task lớn còn lại:

- [ ] App **ShopPay** (ví điện tử) — minh hoạ MFA bắt buộc.
- [ ] **SAML 2.0 Identity Brokering** — nhân viên seller login bằng IdP công ty (Azure AD / Okta).
- [ ] **Google Identity Brokering** cho buyer.
- [ ] **Keycloak Event Listener SPI** — đồng bộ user create/update/delete sang `user_profile` cache.
- [ ] **Back-channel logout** — Single Logout đúng chuẩn.
- [ ] **FreeIPA / Samba AD-DC + LDAP federation** — domain control cho thiết bị (downstream).
- [ ] Tách DB seller-workspace ra riêng + sync qua event.
