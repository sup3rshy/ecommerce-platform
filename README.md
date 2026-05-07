# Ecommerce Platform — Multi-App SSO Demo

Hệ sinh thái 3 app dùng chung 1 Keycloak làm IdP — mô phỏng kiến trúc Shopee / ShopeeFood / ShopeePay.

| App | Port | Vai trò |
|---|---|---|
| [web-app/](web-app) | 3000 | **ecommerce** — chợ cho buyer/seller |
| [seller-workspace/](seller-workspace) | 3100 | **back-office** — chủ shop + nhân viên (kho/CSKH/kế toán) |
| [shoppay/](shoppay) | 3200 | **ví điện tử** — wallet + KYC, **bắt buộc MFA (TOTP)** |

Cả 3 app login chung qua realm `ecommerce-realm`. 1 lần đăng nhập → vào được mọi app (silent SSO).

---

## Kiến trúc

```mermaid
flowchart TB
    subgraph Upstream["Upstream IdP (federation)"]
        Google["Google OIDC<br/>(2.3 — pending creds)"]
        SAML["Company AD<br/>realm: acme-corp<br/>(2.4)"]
        LDAP["FreeIPA / LDAP<br/>(5.x — deferred)"]
    end

    subgraph KC["Keycloak — realm: ecommerce-realm (:8080)"]
        Broker["Identity Broker<br/>+ Authentication Flows<br/>+ Groups + Roles"]
        Users[(users · roles · groups)]
        Broker --- Users
    end

    subgraph Apps["Downstream Apps"]
        Web["ecommerce :3000<br/>client: nextjs-app"]
        Seller["seller-workspace :3100<br/>client: seller-workspace<br/>SAML SP"]
        Pay["ShopPay :3200<br/>client: shoppay-app<br/>+ TOTP enforced"]
    end

    subgraph DB["Postgres (tách 2 instance)"]
        PgKC[(postgres-keycloak<br/>nội bộ)]
        PgApp[(postgres-app :5432<br/>ecommerce · seller_workspace · shoppay<br/>user_profile cache mỗi DB)]
    end

    Google -.OIDC broker.-> Broker
    SAML  -.SAML broker.-> Broker
    LDAP  -.user federation.-> Broker

    Browser((Browser)) --> Web & Seller & Pay
    Web --> Broker
    Seller --> Broker
    Pay --> Broker

    Broker --- PgKC
    Web --- PgApp
    Seller --- PgApp
    Pay --- PgApp

    Web ==Cross-app payment<br/>HMAC signed==> Pay
    Pay ==Return + sig==> Web
```

| Stack | Version |
|---|---|
| Next.js | 16 (App Router, Turbopack) |
| NextAuth | 4.24 |
| Keycloak | latest |
| Drizzle ORM | 0.45 |
| PostgreSQL | 15 |
| Node.js | **22 LTS** |

---

## Sequence diagrams

### OIDC silent SSO cross-app (Kịch bản B)

```mermaid
sequenceDiagram
    participant U as User Browser
    participant A1 as ecommerce :3000
    participant KC as Keycloak :8080
    participant A2 as seller-workspace :3100

    U->>A1: 1. Login form
    A1->>KC: 2. authz request
    KC->>U: 3. Login page
    U->>KC: 4. credentials
    KC-->>A1: 5. code → token
    A1->>U: Set ecommerce.session-token cookie<br/>+ KEYCLOAK_SESSION cookie

    Note over U: User opens :3100 tab

    U->>A2: 6. /dashboard (no session)
    A2->>KC: 7. authz request (silent)
    KC-->>U: 8. KEYCLOAK_SESSION cookie có sẵn<br/>→ skip login form
    KC-->>A2: 9. code → token
    A2->>U: Set seller-workspace.session-token<br/>vào /dashboard
```

### SAML brokering (Kịch bản G1)

```mermaid
sequenceDiagram
    participant U as User
    participant A as seller-workspace :3100
    participant KC as Keycloak<br/>ecommerce-realm
    participant IdP as Keycloak<br/>acme-corp-realm

    U->>A: 1. Click "Đăng nhập SSO"
    A->>KC: 2. authz request
    KC->>U: 3. Login page có nút<br/>"Sign in with Acme Corp"
    U->>KC: 4. Click SAML button
    KC->>IdP: 5. SAML AuthnRequest (POST binding)
    IdP->>U: 6. Acme Corp login form
    U->>IdP: 7. john.doe / Acme@2024
    IdP-->>KC: 8. SAML Response<br/>(POST /broker/acme-corp/endpoint)
    KC->>KC: 9. Verify, run "first broker login"<br/>+ apply mapper → role: seller
    KC-->>A: 10. OIDC code → token<br/>(roles=[seller])
    A->>U: 11. /dashboard (logged in)
```

### Cross-app payment với HMAC (Kịch bản F2/F3)

```mermaid
sequenceDiagram
    participant U as User Browser
    participant E as ecommerce :3000
    participant S as ShopPay :3200

    U->>E: 1. /orders → click "Pay"
    E->>E: 2. Build URL:<br/>?orderId,amount,returnUrl,nonce<br/>+ sig=HMAC(fields, secret)
    E->>U: 3. 302 → :3200/pay?...
    U->>S: 4. GET /pay
    S->>S: 5. Verify HMAC
    S->>U: 6. Confirmation page<br/>(số tiền, balance ví)
    U->>S: 7. Submit confirm
    S->>S: 8. Re-verify HMAC,<br/>idempotent dedupe theo merchant:orderId,<br/>db.transaction trừ ví,<br/>audit log
    S->>U: 9. 302 → :3000/payment/return<br/>?orderId,status,txnId<br/>+ sig=HMAC mới
    U->>E: 10. GET /payment/return
    E->>E: 11. Verify HMAC,<br/>UPDATE order SET status='shipping'
    E->>U: 12. /orders?payment=success
```

### TOTP enforce per-client (Kịch bản E)

```mermaid
sequenceDiagram
    participant U as User
    participant SP as ShopPay :3200
    participant KC as Keycloak

    U->>SP: 1. /wallet (no session)
    SP->>KC: 2. authz request<br/>(client_id=shoppay-app)
    KC->>KC: 3. Detect client binding override<br/>browser → browser-shoppay flow
    Note over KC: KHÔNG dùng auth-cookie SSO<br/>Buộc password+TOTP fresh

    KC->>U: 4. Password form
    U->>KC: 5. password
    KC->>KC: 6. shoppay-forms flow: REQUIRED OTP
    alt User chưa có TOTP
        KC->>U: 7a. QR code setup (userSetupAllowed=true)
        U->>KC: 8a. Quét QR + nhập code
    else User có TOTP
        KC->>U: 7b. Form nhập 6 số
        U->>KC: 8b. code
    end
    KC-->>SP: 9. code → token (with mfa claim)
    SP->>U: 10. /wallet
```

---

## Setup từ 0

Yêu cầu: Docker + Node.js 22 LTS. WSL/Linux/Mac đều OK.

```bash
git clone <repo> && cd ecommerce-platform

bash scripts/bootstrap.sh    # sinh secret, tạo root .env + 3 app .env (idempotent)
bash scripts/reset.sh        # up infra Docker + push DB schema cho 3 app
npm install && npm run dev   # cài concurrently + chạy cả 3 app
```

Xong. 3 app sống ở :3000 / :3100 / :3200, Keycloak :8080. `Ctrl+C` 1 lần kill cả 3.

> Mọi lệnh đời sống (`dev`, `db:push`) chạy ở **root**. KHÔNG `cd` vào `web-app/`, `seller-workspace/`, `shoppay/`.

> Lần đầu mỗi route compile ~20–30s (Turbopack). Đã có warmup script chạy ngầm pre-compile các route chính, log thấy `[warm] ✓ done` là routes ấm rồi.

---

## Tài khoản

### Keycloak Admin Console — http://localhost:8080

Username/password đọc từ root `.env`:

```bash
grep -E '^KEYCLOAK_ADMIN' .env
```

(Mặc định cũ `admin/admin` đã bỏ — secret giờ là 32-byte random.)

### User demo trong realm `ecommerce-realm`

Password policy: `length(8) and digits(1) and upperCase(1) and lowerCase(1) and specialChars(1)`.

| Username | Password | Role | Dùng cho |
|---|---|---|---|
| `buyer1` | `Buyer1@2024` | buyer | Mua hàng ở ecommerce |
| `seller1` | `Seller1@2024` | seller | Bán hàng + vào seller-workspace |
| `admin1` | `Admin1@2024` | admin | Duyệt seller request |
| `warehouse1` | `Warehouse1@2024` | staff-warehouse | Nhân viên kho (group `/store-demo-1/warehouse`) |
| `cs1` | `Cs1@2024` | staff-cs | Nhân viên CSKH |
| `finance1` | `Finance1@2024` | staff-finance | Nhân viên tài chính |
| `wallet1` | `Wallet1@2024` | wallet-user | **Bắt buộc setup TOTP** ở login đầu |

---

## Test theo kịch bản

> Mở 1 trình duyệt **incognito riêng cho mỗi kịch bản** (hoặc clear cookie giữa các lần) — vì SSO nhớ session, dễ "ngỡ là OK" do phiên cũ.

### Kịch bản A — Smoke test (5 phút, làm trước tiên)

Mục tiêu: chắc chắn 3 app + Keycloak alive, secret khớp đúng.

1. **Health check**:
   ```bash
   curl -s http://localhost:8080/realms/ecommerce-realm/.well-known/openid-configuration | head -c 80
   curl -sI http://localhost:3000  # 200 hoặc 307 đều OK
   curl -sI http://localhost:3100
   curl -sI http://localhost:3200
   ```
2. Mở incognito → http://localhost:3000 → click "Đăng nhập" → Keycloak hỏi tài khoản → nhập `buyer1` / `Buyer1@2024` → quay về :3000 với header chào tên user.
3. Logout → kết thúc.

❌ Nếu thấy `invalid_client` → secret trong `web-app/.env` không khớp `NEXTJS_APP_CLIENT_SECRET` ở root `.env`. Sửa rồi `npm run dev` lại.

### Kịch bản B — Silent SSO cross-app

Mục tiêu: chứng minh 1 lần login dùng cho cả 3 app.

1. Trong incognito, login `seller1` ở http://localhost:3000.
2. Mở **tab mới cùng cửa sổ** → http://localhost:3100 → click "Đăng nhập SSO".
3. **Kỳ vọng**: redirect Keycloak rồi quay về luôn — KHÔNG hỏi password.

Verify trong DevTools → Network: request `…/auth/realms/ecommerce-realm/protocol/openid-connect/auth?...` trả `302` thẳng về `/api/auth/callback/keycloak`, không qua trang login.

### Kịch bản C — Phân quyền nhân viên (Keycloak Groups)

Mục tiêu: cùng 1 store, 3 nhân viên có 3 quyền khác nhau.

1. Login `warehouse1` ở :3100 → vào `/dashboard`. Page hiển thị `roles: ["staff-warehouse"]` và `groups: ["/store-demo-1/warehouse"]`.
2. Logout → login `cs1` → role/group khác.
3. Logout → login `finance1` → role/group khác.

→ Cùng group cha `store-demo-1`, sub-group quyết định quyền.

### Kịch bản D — Server actions + audit log

Mục tiêu: action có authZ check + ghi audit.

1. Login `seller1` ở :3100 (vì action `staff.invite` yêu cầu role `seller` hoặc `admin`).
2. Vào `/staff` → nhập email + role staff → submit.
3. Vào `/audit` → thấy entry mới với `action: "staff.invite"`, `actorId`, `metadata`.
4. Logout, login `warehouse1` → vào `/staff` → thử mời → bị reject (action guard chặn ở server).

### Kịch bản E — MFA bắt buộc cho ShopPay

Mục tiêu: cùng 1 user pool nhưng app `shoppay-app` có policy bảo mật khác.

1. Login `wallet1` / `Wallet1@2024` ở http://localhost:3200.
2. Keycloak detect required action `CONFIGURE_TOTP` → bắt setup.
3. Cài Google Authenticator / 1Password / Authy → quét QR.
4. Nhập 6 chữ số → confirm → redirect về :3200.
5. Logout, login lại → bị hỏi TOTP code mỗi lần (không chỉ lần đầu).
6. Login cùng `wallet1` ở :3000 (nếu wallet1 có role buyer) → vẫn cần TOTP do realm-level credential.

> Nếu muốn skip TOTP cho `wallet1` lúc dev: vào Keycloak Admin → Users → wallet1 → Required user actions → xoá `Configure OTP`.

### Kịch bản F1 — KYC admin approve (full e2e)

Mục tiêu: chứng minh chuỗi action guard 2 bên + Keycloak Admin API call.

1. Login `wallet1` ở :3200 → vào `/kyc` → submit form (CCCD + số bất kỳ).
2. Logout → login `admin1` (hoặc `finance1`) ở :3200 → top nav xuất hiện thêm 2 link **KYC Review** + **Audit log**.
3. Vào `/kyc/admin` → thấy hồ sơ pending của `wallet1` → click **Approve**.
4. ShopPay server action: update DB status → call Keycloak Admin API (`backend-admin-client` token) → POST `/admin/realms/.../users/{wallet1-id}/role-mappings/realm` gán role `kyc-verified` → ghi audit log.
5. Vào `/audit` → thấy entry `kyc.approve` với metadata `{targetUserId, assignedRole: "kyc-verified"}`.
6. Logout `admin1`, login lại `wallet1` (cần TOTP) → role mới có hiệu lực → topup > 5tr OK.

### Kịch bản F2 — Topup ví + KYC gating

Mục tiêu: action guard 2 layer (route guard + business rule).

1. Login `wallet1` ở :3200 (sau khi xong TOTP ở E).
2. Vào `/topup` → nạp 1.000.000 → OK, balance tăng.
3. Topup 6.000.000 → fail với message "cần `kyc-verified`".
4. Vào `/kyc` → submit giấy tờ (mock) → admin approve qua Keycloak Admin → assign role `kyc-verified` cho user → logout/login → topup 6.000.000 OK.

### Kịch bản G1 — SAML brokering (Acme Corp → Seller Workspace)

Mục tiêu: chứng minh employee SAML từ "công ty seller" login thẳng vào Seller Workspace, không cần tạo password trên Keycloak chính.

Setup tự động — `acme-corp-realm` đã có sẵn 2 user mẫu (`john.doe` / `jane.smith`, password `Acme@2024`).

1. Mở incognito → http://localhost:3100 → click "Đăng nhập SSO".
2. Trang Keycloak login có thêm nút **"Sign in with Acme Corp (SAML)"** ở dưới form password.
3. Click → redirect sang `acme-corp-realm` login page → nhập `john.doe` / `Acme@2024`.
4. Acme Corp realm tạo SAML assertion → POST về `ecommerce-realm/broker/acme-corp/endpoint`.
5. Keycloak verify, IdP Mapper auto-assign role `seller` → tạo user trong ecommerce-realm với email `john.doe@acme.com`, role `seller`.
6. Redirect về :3100 → vào được `/dashboard` ngay.

→ Verify trong Keycloak Admin → realm `ecommerce-realm` → Users → tìm `john.doe@acme.com` → tab "Identity provider links" thấy `acme-corp` đã link.

### Kịch bản G2 — FreeIPA domain controller + LDAP federation

Mục tiêu: dùng cùng 1 password cho login PC (kerberos), SSH, và app web.

Heavy infra — không tự up với `compose up` thường. Chạy có chủ ý:

```bash
docker compose --profile domain up -d freeipa     # provisioning ~5-10 phút
docker compose logs -f freeipa                    # đợi "FreeIPA server configured"
bash scripts/freeipa-seed.sh                      # tạo 2 user demo employee1/employee2
```

Sau đó wire LDAP federation **manual qua Keycloak Admin Console** (config LDAP qua realm.json không reliable):

1. Vào http://localhost:8080 → realm `ecommerce-realm` → User Federation → **Add Ldap providers**.
2. Vendor: **Red Hat Directory Server** (FreeIPA dùng 389-ds).
3. Connection URL: `ldap://freeipa:389`.
4. Bind type: simple. Bind DN: `uid=admin,cn=users,cn=accounts,dc=example,dc=test`. Bind credential: `Admin@2024`.
5. Edit mode: READ_ONLY. Users DN: `cn=users,cn=accounts,dc=example,dc=test`. Username LDAP attribute: `uid`. RDN LDAP attribute: `uid`.
6. Test connection + Test authentication → đều OK → Save.
7. Tab **Mappers** → đảm bảo `email`, `first name`, `last name` được map.
8. **Synchronize all users** → Keycloak import 2 user FreeIPA vào realm.

Test: ở :3100 → click "Đăng nhập SSO" → form Keycloak → nhập `employee1` / `Emp@2024` → vào dashboard. Cùng 1 password đó dùng được:
- `kinit employee1` trong container FreeIPA → nhận Kerberos ticket.
- SSH vào VM Linux đã join domain (out-of-scope demo này).

> Ghi chú: FreeIPA hostname phải resolve được. Trong Docker Compose mặc định, service `keycloak` thấy `freeipa` qua docker DNS internal — OK. Browser host dùng `localhost:443` để vào FreeIPA Web UI nếu muốn.

### Kịch bản G — Logout + hết session

1. Login đủ 3 app.
2. Logout ở :3000.
3. Reload :3100 và :3200 → khi token cũ hết hạn (default 5 phút), Keycloak phát hiện session đã chết → app redirect signin.

> Back-channel logout chính thống (single logout đồng bộ ngay) cần thêm config — xem [todo.md](todo.md).

---

## Reset nhanh

Khi sửa `keycloak/ecommerce-realm.json`, đổi user/role/client → cần wipe + import lại:

```bash
bash scripts/reset.sh
```

Script tự backup `pg_dumpall` ra `backup-YYYYMMDD-HHMM.sql` trước khi wipe.

---

## Cấu trúc

```
ecommerce-platform/
├── .env / .env.example         # Secret root (Postgres + Keycloak admin + client secrets)
├── package.json                # Root: concurrently runner cho 3 app
├── docker-compose.yml          # Postgres + Keycloak + Nginx
├── scripts/reset.sh            # Wipe + reimport realm + tạo DB + push schema
│
├── keycloak/
│   ├── ecommerce-realm.json    # Realm + clients + roles + groups + users (secret = ${VAR})
│   └── entrypoint.sh           # Resolve ${VAR} từ env vào realm.json trước khi Keycloak start
├── nginx/nginx.conf
│
├── web-app/                    # ecommerce (3000)
│   ├── app/                    # buyer/seller/admin pages + API
│   ├── db/schema.ts            # stores, products, orders, cart, seller_upgrade_requests
│   ├── lib/keycloak-admin.ts   # Keycloak Admin API client
│   └── proxy.ts                # NextAuth middleware
│
├── seller-workspace/           # back-office (3100)
│   ├── app/dashboard, /staff, /audit
│   ├── db/schema.ts            # staff_invitations, store_permissions, audit_logs
│   └── lib/audit.ts
│
└── shoppay/                    # ví (3200)
    ├── app/wallet, /topup, /kyc
    ├── db/schema.ts            # wallets, transactions, kyc_documents
    └── lib/wallet.ts           # topUp / pay (transactional)
```

---

## Troubleshooting

**`invalid_client` khi login** → Secret trong app `.env` không khớp giá trị Keycloak đang giữ. Verify:
```bash
grep CLIENT_SECRET .env web-app/.env seller-workspace/.env shoppay/.env
```

**`/dashboard` redirect lặp về signin** → Cookie name custom phải khớp giữa `app/api/auth/[...nextauth]/route.ts` và `proxy.ts` của app đó.

**`relation "products" does not exist`** → Chưa push schema. `bash scripts/reset.sh` hoặc `npm run db:push`.

**`CLIENT_FETCH_ERROR / NetworkError when attempting to fetch resource`** → next-auth client timeout chờ `/api/auth/session` lúc Turbopack compile lần đầu (xem log thấy session 200 sau 13–20s). Refresh trang khi đã `Ready` là hết. Nếu kéo dài, kiểm tra `NEXTAUTH_URL` trong app `.env` có đúng port không.

**Buyer login :3100 bị redirect `/?denied=role`** → Đúng intent. `seller-workspace/proxy.ts` chỉ cho `seller / admin / staff-*` vào `/dashboard`, `/staff`, `/audit`. Để test :3100, dùng `seller1` hoặc `warehouse1` / `cs1` / `finance1`.

**`permission denied … docker.sock`** → User WSL chưa thuộc group docker:
```bash
sudo usermod -aG docker $USER && exit   # mở lại WSL tab
```

**`CREATE DATABASE cannot run inside a transaction block`** → Mỗi DB tách 1 cờ `-c` riêng trong `psql`.

**Next dev exit silently sau "Ready"** → Đang dùng Node 25/odd. Đổi Node 22 LTS:
```bash
nvm install 22 && nvm use 22 && rm -rf node_modules && npm install
```

**`WSL 1 is not supported`** khi chạy node trong WSL → đang gọi Windows node.exe. Cài node trong WSL hoặc chạy từ PowerShell.

**`Can't resolve 'tailwindcss'`** → 3 `next.config.ts` phải có `turbopack: { root: import.meta.dirname }` để pin root vào app dir, không dùng monorepo root.

**`npm audit fix --force` đã chạy lỡ tay** → Lệnh đó downgrade `next-auth` về v3, vỡ tất cả import. Restore:
```json
"next-auth": "^4.24.13",
"drizzle-kit": "^0.31.10"
```
Rồi `rm -rf node_modules package-lock.json && npm install`.

---

## Lộ trình mở rộng

Xem [todo.md](todo.md) và [PLAN.md](PLAN.md). Còn lại:

- [ ] **SAML 2.0 Identity Brokering** — nhân viên seller login bằng IdP công ty (Azure AD / Okta).
- [ ] **Google Identity Brokering** cho buyer.
- [ ] Cross-app payment flow: `ecommerce checkout → shoppay /pay → ecommerce return`.
- [ ] **Back-channel logout** — Single Logout chuẩn.
- [ ] **Keycloak Event Listener SPI** — đồng bộ user create/update/delete sang `user_profile` cache.
- [ ] **FreeIPA / Samba AD-DC + LDAP federation** — domain control cho thiết bị.
- [ ] App **ShopFood** (multi-tenant restaurant marketplace).
- [ ] Step-up auth ShopPay: re-prompt TOTP cho từng giao dịch lớn.
