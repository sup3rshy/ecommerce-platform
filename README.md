# Ecommerce Platform — Multi-App SSO Demo

Hệ sinh thái 3 app dùng chung 1 Keycloak làm IdP trung tâm — mô phỏng kiến trúc Shopee / ShopeeFood / ShopeePay.

| App | Port | Vai trò |
|---|---|---|
| [web-app/](web-app) | 3000 | **ecommerce** — chợ cho buyer/seller |
| [seller-workspace/](seller-workspace) | 3100 | **back-office** — chủ shop + nhân viên (kho/CSKH/kế toán) |
| [shoppay/](shoppay) | 3200 | **ví điện tử** — wallet + KYC, **bắt buộc MFA (TOTP)** |

Cả 3 app login chung qua Keycloak realm `ecommerce-realm`. 1 lần đăng nhập → vào được mọi app (silent SSO).

---

## Kiến trúc

```
                       Browser
                          │
      ┌──────────┬────────┼────────┬──────────┐
      ▼          ▼        ▼        ▼          ▼
   :3000     :3100     :3200    :8080      :8000
ecommerce  seller-ws  shoppay  Keycloak    Nginx
                                (IdP)      (gateway)
      │          │        │       │
      └──────────┴────────┴───────┘
                   │
                   ▼
            Postgres (5432)
            ├── ecommerce         (stores, products, orders, cart)
            ├── seller_workspace  (staff_invitations, store_permissions, audit_logs)
            ├── shoppay           (wallets, transactions, kyc_documents)
            └── keycloak          (Keycloak data)
```

| Stack | Version |
|---|---|
| Next.js | 16 (App Router, Turbopack) |
| NextAuth | 4.24 (OIDC client) |
| Keycloak | latest |
| Drizzle ORM | 0.45 |
| PostgreSQL | 15 |
| Node.js | **22 LTS** (Node 25 lỗi silent-exit với Next 16) |

---

## Yêu cầu

- Docker Desktop đang chạy
- Node.js 22 LTS (khuyên dùng nvm)
- npm

WSL OK. Lưu ý: chạy `npm install` và `npm run dev` **bên trong WSL**, không share `node_modules` với Windows.

---

## Setup

### 1. Start hạ tầng

```bash
git clone <repo>
cd ecommerce-platform
docker compose up -d
```

Đợi ~30-60s để Keycloak import realm. Verify:

```bash
curl -s http://localhost:8080/realms/ecommerce-realm/.well-known/openid-configuration | head -c 100
```

Phải thấy JSON có `"issuer":"http://localhost:8080/realms/ecommerce-realm"`.

### 2. Tạo databases

```bash
docker exec -i $(docker ps -qf "name=postgres") psql -U admin -d postgres \
  -c "CREATE DATABASE ecommerce;" \
  -c "CREATE DATABASE seller_workspace;" \
  -c "CREATE DATABASE shoppay;"
```

> Mỗi `-c` chạy 1 transaction riêng. Gộp chung trong 1 chuỗi `-c "..."` sẽ lỗi `CREATE DATABASE cannot run inside a transaction block`.

> Nếu permission denied: `sudo usermod -aG docker $USER` rồi logout/login WSL lại.

### 3. Setup web-app (ecommerce)

```bash
cd web-app
cp .env.example .env.local       # nếu có .env.example, không thì tạo thủ công (xem dưới)
echo 'DATABASE_URL=postgresql://admin:password@localhost:5432/ecommerce' > .env
npm install
npx drizzle-kit push             # tạo bảng stores, products, orders, cart, ...
npm run dev                      # http://localhost:3000
```

> File `.env` (1 dòng DATABASE_URL) chỉ phục vụ drizzle-kit. App runtime đọc `.env.local`.
> drizzle-kit auto-load `.env` nhưng KHÔNG load `.env.local`.

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
npm run db:push                  # drizzle tự đọc .env
npm run dev                      # http://localhost:3100
```

### 5. Setup shoppay

Mở **terminal mới**:

```bash
cd shoppay
cp .env.example .env
npm install
npm run db:push
npm run dev                      # http://localhost:3200
```

### 6. Truy cập

| URL | Mục đích |
|---|---|
| http://localhost:3000 | ecommerce |
| http://localhost:3100 | seller-workspace |
| http://localhost:3200 | shoppay |
| http://localhost:8080 | Keycloak Admin (admin/admin) |
| http://localhost:8000 | Nginx gateway |

---

## Tài khoản demo

Realm bật password policy: `length(8) and digits(1) and upperCase(1) and lowerCase(1) and specialChars(1)`.

| Username | Password | Role | Ghi chú |
|---|---|---|---|
| `buyer1` | `Buyer1@2024` | buyer | Mua hàng ở ecommerce |
| `seller1` | `Seller1@2024` | seller | Bán hàng + vào seller-workspace |
| `admin1` | `Admin1@2024` | admin | Duyệt seller request |
| `warehouse1` | `Warehouse1@2024` | staff-warehouse | Nhân viên kho |
| `cs1` | `Cs1@2024` | staff-cs | Nhân viên CSKH |
| `finance1` | `Finance1@2024` | staff-finance | Nhân viên tài chính |
| `wallet1` | `Wallet1@2024` | wallet-user | **Bắt buộc setup TOTP** ở login đầu |

---

## Test SSO (5 kịch bản)

### 1. Silent SSO cross-app
1. Login `seller1` ở :3000.
2. Mở tab mới → :3100 → "Đăng nhập SSO".
3. **Kỳ vọng**: redirect qua Keycloak → quay về luôn, không hỏi password.

Verify trong DevTools Network: request `/auth/realms/.../auth?...` trả 302 thẳng về callback, không qua trang login.

### 2. Multi-staff per store
1. Login `warehouse1` ở :3100 → `/dashboard`.
2. Thấy `roles: staff-warehouse`, `groups: /store-demo-1/warehouse`.
3. Logout → login `cs1` → role + group khác.

→ Minh hoạ Keycloak Groups: cùng store, khác quyền.

### 3. Server actions + audit log
1. Login `seller1` ở :3100 → `/staff` → mời 1 email + role.
2. Vào `/audit` → thấy log `staff.invite`.

### 4. MFA bắt buộc cho ShopPay
1. Login `wallet1` / `Wallet1@2024` ở :3200.
2. Keycloak detect required action `CONFIGURE_TOTP` → bắt setup.
3. Cài Google Authenticator / 1Password / ... → quét QR.
4. Nhập 6 chữ số → confirm → redirect về ShopPay.
5. Login lần kế: password + TOTP code mỗi lần.

→ Minh hoạ chính sách bảo mật khác nhau theo app dù cùng user pool.

### 5. Single Logout (front-channel)
1. Login ở cả 3 app.
2. Logout ở 1 app → app còn lại reload → khi gọi token kế, Keycloak phát hiện session đã chết.

> Back-channel logout chính thống cần config thêm — xem [todo.md](todo.md).

---

## Cấu trúc

```
ecommerce-platform/
├── docker-compose.yml          # Postgres + Keycloak + Nginx
├── keycloak/
│   └── ecommerce-realm.json    # Realm + 3 clients + roles + groups + users
├── nginx/
│   └── nginx.conf              # Reverse proxy + rate limit
│
├── web-app/                    # ecommerce (3000)
│   ├── app/                    # buyer/seller/admin pages + API
│   ├── db/schema.ts            # stores, products, orders, cart, seller_upgrade_requests
│   ├── lib/keycloak-admin.ts   # Keycloak Admin API client
│   └── proxy.ts                # NextAuth middleware (RBAC)
│
├── seller-workspace/           # back-office (3100)
│   ├── app/
│   │   ├── dashboard/page.tsx  # identity + roles + groups
│   │   ├── staff/page.tsx      # mời + thu hồi nhân viên
│   │   └── audit/page.tsx      # audit log read-only
│   ├── db/schema.ts            # staff_invitations, store_permissions, audit_logs
│   ├── lib/audit.ts            # helper ghi audit
│   └── proxy.ts
│
├── shoppay/                    # ví (3200)
│   ├── app/
│   │   ├── wallet/page.tsx     # số dư + transactions
│   │   ├── topup/page.tsx      # nạp tiền (mock)
│   │   └── kyc/page.tsx        # nộp giấy tờ
│   ├── db/schema.ts            # wallets, transactions, kyc_documents
│   ├── lib/wallet.ts           # topUp / pay (transactional)
│   └── proxy.ts
│
├── README.md
└── todo.md                     # Lộ trình mở rộng (SAML, FreeIPA, ...)
```

---

## Database schema

**`ecommerce`**
```
stores  ─┬─→ products  ─┬─→ orders
         │              └─→ cart_items
         └─ seller_upgrade_requests
```

**`seller_workspace`**
```
staff_invitations   (storeId, email, role, status, invitedBy)
store_permissions   (storeId, userId, role, grantedAt, revokedAt)
audit_logs          (storeId, actorId, action, resource, metadata)
```

**`shoppay`**
```
wallets             (userId, currency, balance)
transactions        (walletId, type, amount, status, externalRef, description)
kyc_documents       (userId, fullName, docType, docNumber, status)
```

---

## Apply realm config sau khi sửa `ecommerce-realm.json`

Keycloak chỉ import realm khi DB rỗng. Nếu đổi realm.json giữa chừng:

```bash
# Wipe chỉ DB Keycloak (giữ ecommerce/seller_workspace/shoppay)
docker exec -i $(docker ps -qf "name=postgres") psql -U admin -d postgres -c "DROP DATABASE keycloak;"
docker exec -i $(docker ps -qf "name=postgres") psql -U admin -d postgres -c "CREATE DATABASE keycloak;"
docker compose restart keycloak
```

---

## Troubleshooting

**`unauthorized_client (Invalid client credentials)` khi callback**
→ Keycloak chưa load client mới. Wipe DB Keycloak + restart (xem trên).

**`/dashboard` redirect về signin dù đã login**
→ Cookie name custom phải khớp `cookieName` trong `proxy.ts` của app đó (mỗi app có cookie name riêng để 2/3 app không đè nhau trên localhost).

**`Cannot find module '../lightningcss.linux-x64-gnu.node'`**
→ Native binary thiếu trên WSL. seller-workspace + shoppay đã bỏ Tailwind v4 nên không cần. Nếu thêm lại: `npm install --include=optional`.

**Next dev exit silently sau "Ready"**
→ Đang dùng Node 25 (odd-numbered). Chuyển Node 22 LTS:
```bash
nvm use 22
rm -rf node_modules package-lock.json
npm install
```

**`database "ecommerce" does not exist`**
→ Quên bước 2 (tạo DB).

**`CREATE DATABASE cannot run inside a transaction block`**
→ Tách ra nhiều cờ `-c` riêng (xem bước 2).

**`permission denied while trying to connect to the Docker daemon socket`**
→ User WSL chưa thuộc group docker:
```bash
sudo usermod -aG docker $USER
exit   # mở lại WSL tab
```

**`drizzle-kit push` báo `Either connection "url" or "host"...`**
→ web-app dùng `.env.local` mà drizzle-kit không đọc. Tạo `.env`:
```bash
echo 'DATABASE_URL=postgresql://admin:password@localhost:5432/ecommerce' > .env
npx drizzle-kit push
```

**Đã lỡ chạy `npm audit fix --force` và package.json hỏng**
→ Lệnh đó downgrade `next-auth` về v3, vỡ tất cả import. Restore:
```json
"next-auth": "^4.24.13",
"drizzle-kit": "^0.31.10"
```
Rồi `rm -rf node_modules package-lock.json && npm install`.

---

## Lộ trình mở rộng

Xem [todo.md](todo.md). Các task lớn còn lại:

- [ ] **SAML 2.0 Identity Brokering** — nhân viên seller login bằng IdP công ty (Azure AD / Okta).
- [ ] **Google Identity Brokering** cho buyer.
- [ ] Cross-app payment flow: `ecommerce checkout → shoppay /pay → ecommerce return`.
- [ ] **Keycloak Event Listener SPI** — đồng bộ user create/update/delete sang `user_profile` cache.
- [ ] **Back-channel logout** — Single Logout chuẩn.
- [ ] **FreeIPA / Samba AD-DC + LDAP federation** — domain control cho thiết bị (downstream).
- [ ] App **ShopFood** (multi-tenant restaurant marketplace).
- [ ] Step-up auth cho ShopPay: re-prompt TOTP cho từng giao dịch lớn (không chỉ ở login).
