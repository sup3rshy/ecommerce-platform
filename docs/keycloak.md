# Keycloak — Hướng dẫn xem và quản lý cấu hình

Cách truy cập Admin Console, xem nội dung realm, và cơ chế lưu cấu hình để tái lập
trên máy khác / môi trường deploy.

## 0. Phase 1 có thay đổi gì trong Keycloak không?

**Không.** Đồng bộ catalog (Phase 1) nằm hoàn toàn ở tầng app (HMAC `CATALOG_SYNC_SECRET`),
không đụng OIDC/realm. Realm `ecommerce-realm` giữ nguyên như trước. Đã chạy container
xác nhận realm import sạch:
```
[entrypoint] ✓ ecommerce-realm-realm.json resolved
INFO [ImportUtils] Realm 'ecommerce-realm' imported
```

## 1. Điểm truy cập

| Thành phần | URL trực tiếp | Qua Nginx (:8000) |
| --- | --- | --- |
| Keycloak Admin Console | http://localhost:8080/ | http://localhost:8000/auth/ |
| ShopEcommerce (storefront) | http://localhost:3000 | http://localhost:8000/ |
| ShopSell | http://localhost:3100 | http://localhost:8000/seller/ |
| ShopPay | http://localhost:3200 | (chưa route) |
| ShopFood | http://localhost:3300 | http://localhost:8000/food/ |
| Admin Portal | http://localhost:3400 | http://localhost:8000/portal/ |

> Infra (Keycloak/Postgres/Nginx) chạy trong Docker Compose. Các app Next hiện chạy bằng
> `npm run dev` trên host (sẽ container hóa ở giai đoạn deploy). Postgres app expose ở `:5432`,
> Postgres của Keycloak KHÔNG expose (nội bộ docker network).

## 2. Đăng nhập Admin Console

- URL: http://localhost:8080/ → **Administration Console**.
- Tài khoản admin master:
  - user = giá trị `KEYCLOAK_ADMIN` (mặc định `admin`)
  - password = `KEYCLOAK_ADMIN_PASSWORD` trong **root `.env`**
  - Xem nhanh: `grep -E '^KEYCLOAK_ADMIN' .env`
- Sau khi vào, đổi realm ở góc trên-trái từ `master` sang **`ecommerce-realm`**.

## 3. Xem gì trong realm `ecommerce-realm`

| Mục trong Console | Nội dung | Liên quan app |
| --- | --- | --- |
| **Clients** | `nextjs-app`, `seller-workspace`, `shoppay-app`, `shopfood-app`, `admin-portal` + `backend-admin-client` | Mỗi client = 1 app; xem Settings (Valid redirect URIs, Frontchannel logout URL), Credentials (secret), Client scopes |
| **Realm roles** | composite phía khách: `buyer` ⊂ `staff` ⊂ `seller`, `buyer` ⊂ `food-seller`, `buyer` ⊂ `wallet-user` ⊂ `kyc-verified`; platform: `admin`, `ecommerce_admin`, `food_admin`, `pay_admin` | Guard ở từng app đọc role từ token (`realm_access.roles`); composite được resolve nên gán role cha là đủ. `ecommerce_admin` là role hợp nhất cho ShopEcommerce + ShopSell |
| **Groups** | `store-demo-1` (attr `storeId=1`), `store-demo-2` (`storeId=2`) = shop; staff/seller là member đúng 1 group | Mapper `groups` (full-path) bật trên client `seller-workspace` |
| **Users** | demo: `buyer1`, `buyer2`, `buyer3`, `seller1`+`staff1` (shop1), `seller2`+`staff2` (shop2), `food-seller1`, `wallet1`, `kyc1`, `admin1` | Mật khẩu trong [README.md](../README.md#tài-khoản-demo-keycloak-local). Xem Role mapping + Groups của từng user |
| **Authentication > Flows** | `browser-shoppay` = flow tùy biến **buộc TOTP** khi vào ShopPay | Bind ở client `shoppay-app` (MFA per-client) |
| **Authentication > Required actions** | `CONFIGURE_TOTP` bật | `wallet1` được gắn để buộc cấu hình OTP |
| **Identity providers** | `google` — đã cấu hình client thật (root `.env`: `GOOGLE_IDP_CLIENT_ID/SECRET`), `enabled=true`, `trustEmail=true`. Redirect URI Google nhận = `http://localhost:8080/realms/ecommerce-realm/broker/google/endpoint` | Social login. Xem mục 8 |
| **Realm settings > Tokens** | Access token **5 phút**, refresh rotation (`revokeRefreshToken`), chữ ký **ES256** | Nền cho deprovisioning AD (Phase 4) + refresh token ở mỗi app |
| **Sessions** | Phiên đang hoạt động | Dùng để kiểm thử SSO / Single Logout |

## 4. Xem nhanh bằng API (không cần mở console)

Chạy từ gốc repo (cần infra đang chạy):

```bash
set -a; source .env; set +a
KC=http://localhost:8080

# Lấy admin token
TOKEN=$(curl -s -X POST "$KC/realms/master/protocol/openid-connect/token" \
  -d grant_type=password -d client_id=admin-cli \
  -d "username=$KEYCLOAK_ADMIN" -d "password=$KEYCLOAK_ADMIN_PASSWORD" \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

# Liệt kê clients / roles / users
curl -s "$KC/admin/realms/ecommerce-realm/clients" -H "Authorization: Bearer $TOKEN" | grep -oE '"clientId":"[^"]*"'
curl -s "$KC/admin/realms/ecommerce-realm/roles"   -H "Authorization: Bearer $TOKEN" | grep -oE '"name":"[^"]*"'
curl -s "$KC/admin/realms/ecommerce-realm/users?max=20" -H "Authorization: Bearer $TOKEN" | grep -oE '"username":"[^"]*"'

# Kiểm tra service account backend-admin-client (dùng cho Admin Portal / KYC approve)
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "$KC/realms/ecommerce-realm/protocol/openid-connect/token" \
  -d grant_type=client_credentials -d client_id=backend-admin-client \
  -d "client_secret=$(grep '^BACKEND_ADMIN_CLIENT_SECRET=' .env | cut -d= -f2)"   # 200 = OK

# Xem log import realm
docker compose logs keycloak | grep -iE "entrypoint|imported realm"
```

## 5. Cấu hình được lưu ở đâu (tái lập trên máy khác / deploy)

- **Single source of truth**: [`keycloak/ecommerce-realm.json`](../keycloak/ecommerce-realm.json) (commit vào repo). Toàn bộ
  clients, roles, users demo, auth flows, IdP, token settings nằm ở đây.
- **Secrets KHÔNG hardcode**: realm dùng placeholder `${VAR}` (vd `${SHOPPAY_CLIENT_SECRET}`).
  Khi container start, [`keycloak/entrypoint.sh`](../keycloak/entrypoint.sh) thay placeholder bằng giá trị env
  (docker-compose lấy từ root `.env`) rồi import. Có sanity-check: còn `${VAR}` chưa resolve thì fail.
- **Secret chain** cho client mới phải wire đủ 4 chỗ (nếu thiếu → import fail):
  1. `keycloak/ecommerce-realm.json` — client tham chiếu `${VAR}`
  2. `keycloak/entrypoint.sh` — thêm vào mảng `VARS_TO_RESOLVE`
  3. `docker-compose.yml` — env của service `keycloak`
  4. `scripts/bootstrap.sh` — sinh secret vào root `.env`
- **Tái lập trên máy khác / deploy**: chỉ cần repo + chạy `bash scripts/bootstrap.sh` (sinh `.env`)
  rồi `docker compose up`. Không cần copy state Keycloak — realm tự import từ JSON.

### Áp dụng thay đổi realm JSON
`--import-realm` chỉ import khi realm **chưa tồn tại**. Để thay đổi trong file có hiệu lực, phải
**wipe volume Keycloak** rồi up lại:
```bash
bash scripts/reset.sh     # đã bao gồm wipe volume + reimport
```

## 6. Khi chỉnh trong Console và muốn lưu lại vào file (vd Phase 4: LDAP federation)

```bash
docker compose exec keycloak /opt/keycloak/bin/kc.sh export \
  --dir /tmp/kc-export --realm ecommerce-realm --users realm_file
docker compose cp keycloak:/tmp/kc-export/ecommerce-realm-realm.json ./keycloak/ecommerce-realm.json
```

> **QUAN TRỌNG**: bản export chứa secret/giá trị **thật**. Trước khi commit, thay lại các secret
> bằng placeholder `${VAR}` (đối chiếu `VARS_TO_RESOLVE` trong `entrypoint.sh`), nếu không sẽ
> lộ secret và mất cơ chế tái lập. Các biến hiện được resolve:
> `NEXTJS_APP_CLIENT_SECRET`, `SELLER_WORKSPACE_CLIENT_SECRET`, `SHOPPAY_CLIENT_SECRET`,
> `SHOPFOOD_CLIENT_SECRET`, `ADMIN_PORTAL_CLIENT_SECRET`, `BACKEND_ADMIN_CLIENT_SECRET`,
> `SMTP_PASSWORD`, `GOOGLE_IDP_CLIENT_ID`, `GOOGLE_IDP_CLIENT_SECRET`.

## 7. Sự cố thường gặp

- **`password authentication failed for user "admin"`** khi Keycloak khởi động: volume Postgres cũ
  còn mật khẩu cũ trong khi `.env` vừa sinh mật khẩu mới (Postgres chỉ set password lúc init volume rỗng).
  Khắc phục:
  ```bash
  docker compose down
  docker volume rm ecommerce-platform_postgres_keycloak_data ecommerce-platform_postgres_app_data
  docker compose up -d
  # hoặc đơn giản: bash scripts/reset.sh
  ```
- **`unresolved placeholder` khi import**: thiếu biến trong root `.env`, hoặc quên thêm vào
  `entrypoint.sh` `VARS_TO_RESOLVE`.
- **`invalid_client` ở app**: `KEYCLOAK_CLIENT_SECRET` trong app `.env` không khớp secret realm
  → `bash scripts/bootstrap.sh && bash scripts/reset.sh`.
- **Win10 domain-joined không tự login**: Desktop SSO phải dùng hostname LAN
  `app.ecommerce.local`, không dùng `localhost`; xem [desktop-sso-kerberos.md](desktop-sso-kerberos.md).

## 8. Social login Google + Email (SMTP) — chế độ localhost demo

Cấu hình cho demo "đăng nhập với Google" + "quên mật khẩu" + "verify email khi đăng ký",
chạy trên **trình duyệt máy thật qua `http://localhost`** (KHÔNG dùng `app.ecommerce.local`).

### Vì sao bắt buộc localhost
Google OAuth **từ chối** redirect URI dạng `http://app.ecommerce.local/...` (Google chỉ chấp
nhận HTTPS công khai, hoặc HTTP với host `localhost`/`127.0.0.1`, và chặn TLD `.local`). Do đó
trình duyệt phải vào Keycloak qua `http://localhost:8080`. Hệ quả: chế độ này **loại trừ**
Desktop SSO/Kerberos (cần FQDN `app.ecommerce.local`) — hai demo chạy ở hai chế độ khác nhau,
chuyển qua lại bằng `scripts/use-local-domain.sh` + `scripts/apply-keycloak-local-domain.sh`.

### Đã cấu hình (realm LIVE + nguồn)
- **Google IdP**: `enabled=true`, `trustEmail=true`, `syncMode=IMPORT`; client thật trong root
  `.env` (`GOOGLE_IDP_CLIENT_ID`, `GOOGLE_IDP_CLIENT_SECRET`). `trustEmail=true` nên user đăng
  nhập Google KHÔNG phải verify email.
- **SMTP (Gmail)**: `smtp.gmail.com:465` SSL, `auth=true`, `user=from=minhtrietlove@gmail.com`,
  `password=${SMTP_PASSWORD}` (Gmail **app password** 16 ký tự, KHÔNG phải mật khẩu Gmail).
  Đã verify bằng `POST /admin/realms/ecommerce-realm/testSMTPConnection` → HTTP 204.
- **Email theme**: realm dùng `emailTheme=ecommerce`, mount từ
  `keycloak/themes/ecommerce:/opt/keycloak/themes/ecommerce`. Theme này có template HTML + text
  cho `email-verification.ftl` và `password-reset.ftl`, cùng subject trong
  `messages/messages_en.properties` + `messages/messages_vi.properties`.
- **Realm flags**: `verifyEmail=true`, `registrationAllowed=true`, `resetPasswordAllowed=true`,
  `loginWithEmailAllowed=true`. User demo cũ đã set `emailVerified=true` nên không bị chặn;
  chỉ user **tự đăng ký mới** phải verify email.
- **Required Action**: `VERIFY_EMAIL` phải `enabled=true` (giữ `defaultAction=false`). Nếu live
  realm bị lệch sang `enabled=false`, đăng ký vẫn tạo user nhưng không đi đúng bước gửi/chặn verify
  email. `scripts/apply-keycloak-localhost-demo.sh` đã ép bật lại required action này.
- **SPNEGO**: execution `auth-spnego` trong flow `browser` + `shoppay-alternatives` đã đặt
  `DISABLED` (để trang login hiện form + nút Google ngay, tránh popup native trên máy không
  join domain). Bật lại cho AD bằng `apply-keycloak-local-domain.sh app.ecommerce.local`.
- **LDAP/AD**: trong chế độ localhost demo, LDAP provider được đặt `enabled=false` để Google
  broker login không timeout vào DC local đang tắt. Script AD sẽ bật lại LDAP khi quay về
  `app.ecommerce.local`.
- **SSO Google qua Keycloak**: 5 app đều redirect tới cùng issuer `http://localhost:8080`;
  NextAuth không gửi `prompt=login`, nên sau khi Google login tạo session Keycloak, app khác sẽ
  đi qua `/auth/sso` rồi nhận lại code ngay bằng `auth-cookie`. Riêng `shoppay-app` vẫn bind
  flow `browser-shoppay`, nên dù có SSO cookie vẫn phải qua OTP.
- **Stale session**: `/auth/sso` luôn xoá session NextAuth local của app trước khi gọi Keycloak,
  và tự bóc callback bị lồng để tránh vòng `/auth/sso?callbackUrl=/auth/sso?...` sau khi user
  Google cũ bị xoá hoặc refresh token hết hiệu lực.
- **Dữ liệu Google demo**: các user hiện tại có federated identity `google` đã được xoá khỏi
  Keycloak; cache `user_profile` tương ứng trong các DB app cũng đã xoá. User Google mới sẽ được
  tạo lại sạch trong lần đăng nhập tiếp theo.

### Việc phải làm trong Google Cloud Console (chỉ chủ tài khoản Google làm được)
1. **APIs & Services → Credentials → OAuth client** (Web application) → **Authorized redirect URIs**
   thêm chính xác: `http://localhost:8080/realms/ecommerce-realm/broker/google/endpoint`
2. **OAuth consent screen**: nếu đang ở chế độ **Testing**, thêm các tài khoản Gmail sẽ dùng để
   đăng nhập vào mục **Test users** (nếu không Google trả `access_blocked`). Hoặc Publish app.
   (Không cần khai "Authorized JavaScript origins" vì Keycloak đổi code phía server.)

### Chạy demo
```bash
# 1) hạ tầng (KHÔNG bật app container để khỏi chiếm port 3000-3400)
docker compose up -d keycloak postgres-app postgres-keycloak
curl -sf http://localhost:8080/realms/ecommerce-realm/.well-known/openid-configuration >/dev/null && echo KC-OK
# 2) chuyển app .env sang localhost (idempotent) + chạy 5 app WSL-native
bash scripts/use-local-domain.sh localhost
bash scripts/apply-keycloak-localhost-demo.sh
npm run dev        # giữ terminal này mở trong suốt buổi demo
# 3) trên trình duyệt MÁY THẬT: http://localhost:3000  (Keycloak: http://localhost:8080)
```

Nếu vừa chuyển từ `npm run dev:docker` sang `npm run dev`, xoá cache `.next` của 5 app trước khi
chạy để tránh Turbopack dùng lại path `/app` của container:

```bash
bash scripts/stop-local-next.sh
rm -rf shop-ecommerce/.next shop-sell/.next shop-pay/.next shop-food/.next admin-portal/.next
npm run dev
```

### Lưu ý link trong email
Link verify-email và reset-password trỏ `http://localhost:8080/...` → **chỉ bấm được trên trình
duyệt của chính máy chạy stack** (localhost = máy đó). Mở email bằng Gmail web trong cùng trình
duyệt Windows là được. Khi demo quên-mật-khẩu/verify, đăng ký bằng **email thật** để nhận được thư.

### Email template đang dùng
- Xác thực email: `keycloak/themes/ecommerce/email/html/email-verification.ftl` và
  `keycloak/themes/ecommerce/email/text/email-verification.ftl`.
- Đặt lại mật khẩu: `keycloak/themes/ecommerce/email/html/password-reset.ftl` và
  `keycloak/themes/ecommerce/email/text/password-reset.ftl`.
- Subject: `keycloak/themes/ecommerce/email/messages/messages_en.properties` và
  `keycloak/themes/ecommerce/email/messages/messages_vi.properties`.

Sau khi sửa template, recreate riêng Keycloak để mount/theme reload chắc chắn:

```bash
docker compose up -d --force-recreate keycloak
bash scripts/apply-keycloak-localhost-demo.sh
```

### Lưu ý ShopPay MFA
Mở trực tiếp `http://localhost:3200/wallet` để test MFA; `/` là landing public nên không buộc
login. Nếu vừa xoá user Google hoặc đổi flow, dùng cửa sổ ẩn danh/clear cookies `localhost` để
loại cookie NextAuth/Keycloak cũ.

### Đổi về chế độ AD/Kerberos (app.ecommerce.local)
```bash
bash scripts/use-local-domain.sh app.ecommerce.local
bash scripts/apply-keycloak-local-domain.sh app.ecommerce.local   # bật lại SPNEGO, redirect app host
npm run dev:docker
```
