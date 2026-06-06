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
| **Identity providers** | `google` (bật nhưng gated: `clientId/secret = ${GOOGLE_IDP_CLIENT_ID/SECRET}`, để `disabled` khi chưa đăng ký) | Social login (todo) |
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
