# PLAN — Tách secret ra `.env` (todo 1.3)

> Mục tiêu: loại bỏ mọi `client_secret`, password, admin credential khỏi file commit (`docker-compose.yml`, `keycloak/ecommerce-realm.json`, các `.env.example`). Đẩy hết về 1 file `.env` ở root (không commit) + Keycloak resolve placeholder lúc import realm.

---

## 1. Bối cảnh & lý do

### 1.1. Vì sao việc này phải làm trước các todo khác

Các todo còn lại (Google IdP, SAML brokering, FreeIPA federation, Event Listener SPI…) đều **thêm secret mới** vào hệ thống: client secret cho Google, signing key cho SAML, bind-DN password cho LDAP. Nếu chưa có pattern chuẩn để chứa secret, mỗi lần thêm 1 IdP là thêm 1 chỗ phải hardcode → càng để lâu càng khó dọn. Làm 1.3 trước = đặt nền cho mọi tích hợp sau.

### 1.2. Vấn đề cụ thể đang tồn tại trong repo

| File | Dòng | Vấn đề |
|---|---|---|
| `keycloak/ecommerce-realm.json` | 805 | `backend-admin-client` secret đang là `"**********"` (có vẻ đã bị che lúc export, nhưng nếu rotate lại thì sẽ ghi giá trị thật vào file commit) |
| `keycloak/ecommerce-realm.json` | 983 | `seller-workspace` client secret = `"seller-workspace-secret"` plaintext |
| `keycloak/ecommerce-realm.json` | 1043 | `shoppay-app` client secret = `"shoppay-secret"` plaintext |
| `docker-compose.yml` | 7 | `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}` — default password yếu được commit |
| `docker-compose.yml` | 22 | `KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-admin}` — admin/admin được commit |
| `seller-workspace/.env.example` | — | Chứa `KEYCLOAK_CLIENT_SECRET=seller-workspace-secret` (giá trị thật, không phải placeholder) |
| `shoppay/.env.example` | — | Tương tự, chứa `shoppay-secret` |
| `web-app/.env.example` | — | `KEYCLOAK_CLIENT_SECRET=changeme-generate-random-secret` (đúng quy ước, giữ nguyên) |

### 1.3. Tác hại nếu không sửa

1. **Repo public/leak = ai cũng impersonate app được.** Có `client_id` (public) + `client_secret` (lộ) → gọi `/token` endpoint của Keycloak với `grant_type=authorization_code` để lấy access token. Đặc biệt nguy hiểm với `backend-admin-client` (line 795–810): client này có `serviceAccountsEnabled` và thường được gán role `realm-admin` — leak secret = leak quyền admin realm.
2. **Không rotate được.** Đổi secret phải sửa cả `.env` và `realm.json` rồi commit → vòng commit history còn nguyên giá trị cũ.
3. **Không phân biệt dev/staging/prod.** 1 file `realm.json` = 1 bộ secret cố định. Lên prod phải maintain 1 fork của file → drift.
4. **`.env.example` đang leak giá trị thật** = anti-pattern. File này được commit, nên phải là template, không phải bản sao của `.env`.

---

## 2. Kiến thức nền

### 2.1. OAuth2/OIDC client_secret là gì

Trong OIDC Authorization Code flow:

```
Browser ── (1) authz request ──> Keycloak
        <─ (2) code ──────────
Browser ── (3) code ──> Next.js server
Next.js  ── (4) code + client_id + client_secret ──> Keycloak /token
         <─ (5) access_token + id_token ────────────
```

`client_secret` xuất hiện ở bước (4) — Next.js server xác thực với Keycloak rằng "tao đúng là app `seller-workspace`, không phải kẻ chặn code". Vì `client_secret` không bao giờ rời server-side, nó là credential mạnh. Leak = mất authenticity của toàn bộ luồng.

Client `public` (SPA, mobile) không có secret và phải dùng PKCE thay thế. Tất cả 3 app trong dự án này là `confidential` (Next.js render server-side) → có secret.

### 2.2. Keycloak environment variable substitution

Keycloak (≥ v17, Quarkus distribution) hỗ trợ replace `${VARNAME}` trong realm JSON khi import qua flag `--import-realm`. Quy tắc:

- Cú pháp: `"key": "${ENV_VAR_NAME}"` hoặc `"${ENV_VAR_NAME:default_value}"`.
- Biến phải tồn tại trong env của process Keycloak (truyền qua `environment:` trong compose).
- Replace xảy ra **lúc parse JSON** ngay trước khi tạo realm trong DB. Sau khi import xong, giá trị thật được lưu trong DB Postgres của Keycloak.
- Nghĩa là: **rotate secret = đổi `.env` + xoá DB Keycloak + restart.** Hoặc đổi qua Admin Console (không động vào file).

Hệ quả: chiến lược đúng là dùng env substitution **chỉ cho lần bootstrap đầu tiên**; sau đó secret sống trong DB Keycloak. Khi muốn rotate, đổi qua Admin Console (Clients → Credentials → Regenerate) rồi cập nhật `.env` của app tương ứng.

### 2.3. Docker Compose & file `.env`

- Compose tự động đọc file `.env` ở **cùng thư mục với `docker-compose.yml`**.
- `${VAR}` trong compose YAML được thay từ file `.env` đó (hoặc shell env, shell ưu tiên cao hơn).
- `environment:` truyền tiếp vào container. Container chỉ thấy biến nào được khai báo ở đây.
- File `.env` đã nằm trong `.gitignore` (đã verify ở [.gitignore](.gitignore)) → an toàn.

### 2.4. Quy ước `.env` vs `.env.example`

- `.env` — giá trị thật, **không commit**, mỗi dev/server tự tạo.
- `.env.example` — template, **commit**, chứa tên biến và placeholder mô tả (`changeme`, `<paste-from-keycloak>`, …). Dev mới clone repo chạy `cp .env.example .env` rồi điền.
- Không bao giờ để giá trị thật của secret trong `.env.example`.

### 2.5. Twelve-Factor — Config

> "An app's config is everything that is likely to vary between deploys. […] Apps sometimes store config as constants in the code. This is a violation of twelve-factor, which requires strict separation of config from code."

Secret = config. Code = không secret. Quy tắc đơn giản: nếu xem repo public mà bạn rùng mình → đó là config, phải đẩy ra ngoài.

---

## 3. Phương án thực hiện — chi tiết end-to-end

### 3.1. Tạo file `.env` ở root repo

Tạo `D:\ecommerce-platform\.env` (đã trong `.gitignore`):

```dotenv
# === Postgres (shared) ===
POSTGRES_DB=keycloak
POSTGRES_USER=admin
POSTGRES_PASSWORD=<random-strong-pw>

# === Keycloak admin ===
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<random-strong-pw>

# === Keycloak client secrets (resolve trong realm.json khi import) ===
NEXTJS_APP_CLIENT_SECRET=<random-32-byte-hex>
SELLER_WORKSPACE_CLIENT_SECRET=<random-32-byte-hex>
SHOPPAY_CLIENT_SECRET=<random-32-byte-hex>
BACKEND_ADMIN_CLIENT_SECRET=<random-32-byte-hex>
```

Cách sinh giá trị:
```bash
openssl rand -hex 32
# hoặc
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3.2. Tạo `.env.example` ở root (commit)

```dotenv
POSTGRES_DB=keycloak
POSTGRES_USER=admin
POSTGRES_PASSWORD=changeme-generate-with-openssl-rand-hex-32

KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=changeme-generate-with-openssl-rand-hex-32

NEXTJS_APP_CLIENT_SECRET=changeme-generate-with-openssl-rand-hex-32
SELLER_WORKSPACE_CLIENT_SECRET=changeme-generate-with-openssl-rand-hex-32
SHOPPAY_CLIENT_SECRET=changeme-generate-with-openssl-rand-hex-32
BACKEND_ADMIN_CLIENT_SECRET=changeme-generate-with-openssl-rand-hex-32
```

### 3.3. Sửa `docker-compose.yml`

Bỏ default values yếu để compose fail loud nếu thiếu biến:

```yaml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]

  keycloak:
    image: quay.io/keycloak/keycloak:latest
    command: start-dev --import-realm
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/${POSTGRES_DB}
      KC_DB_USERNAME: ${POSTGRES_USER}
      KC_DB_PASSWORD: ${POSTGRES_PASSWORD}
      KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN}
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
      # Đẩy biến vào để realm.json resolve được
      NEXTJS_APP_CLIENT_SECRET: ${NEXTJS_APP_CLIENT_SECRET}
      SELLER_WORKSPACE_CLIENT_SECRET: ${SELLER_WORKSPACE_CLIENT_SECRET}
      SHOPPAY_CLIENT_SECRET: ${SHOPPAY_CLIENT_SECRET}
      BACKEND_ADMIN_CLIENT_SECRET: ${BACKEND_ADMIN_CLIENT_SECRET}
    ports: ["8080:8080"]
    volumes:
      - ./keycloak/ecommerce-realm.json:/opt/keycloak/data/import/realm.json
    depends_on: [postgres]
  # ...nginx giữ nguyên
```

**Lý do bỏ `:-default`:** với secret, fail-fast tốt hơn fallback ngầm. Nếu dev quên tạo `.env`, compose báo lỗi rõ ràng, không boot lên với password `admin` rồi bị quên.

### 3.4. Sửa `keycloak/ecommerce-realm.json`

3 chỗ cần đổi (đã xác định lúc khảo sát):

```diff
  "clientId": "backend-admin-client",
  ...
- "secret": "**********",
+ "secret": "${BACKEND_ADMIN_CLIENT_SECRET}",
```

```diff
  "clientId": "seller-workspace",
  ...
- "secret": "seller-workspace-secret",
+ "secret": "${SELLER_WORKSPACE_CLIENT_SECRET}",
```

```diff
  "clientId": "shoppay-app",
  ...
- "secret": "shoppay-secret",
+ "secret": "${SHOPPAY_CLIENT_SECRET}",
```

Kiểm tra `nextjs-app` (line 896): hiện tại không có field `"secret"` trong block đó (Keycloak có thể đã dùng generated secret lưu trong DB). Sau khi rebuild, ta sẽ thêm:

```diff
  "clientId": "nextjs-app",
  "clientAuthenticatorType": "client-secret",
+ "secret": "${NEXTJS_APP_CLIENT_SECRET}",
```

### 3.5. Cập nhật `.env.example` của 3 app

Quan trọng: 3 app vẫn đọc secret từ **`.env` của riêng nó** (không phải `.env` root) vì NextAuth chạy trong Next.js process, không phải Keycloak process. Nhưng giá trị phải **trùng** với cái Keycloak đã import.

`web-app/.env.example`:
```dotenv
DATABASE_URL=postgresql://admin:password@localhost:5432/ecommerce
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=changeme-openssl-rand-hex-32
KEYCLOAK_ISSUER=http://localhost:8080/realms/ecommerce-realm
KEYCLOAK_CLIENT_ID=nextjs-app
KEYCLOAK_CLIENT_SECRET=<paste-NEXTJS_APP_CLIENT_SECRET-from-root-.env>
```

`seller-workspace/.env.example`:
```dotenv
DATABASE_URL=postgres://admin:password@localhost:5432/seller_workspace
NEXTAUTH_URL=http://localhost:3100
NEXTAUTH_SECRET=changeme-openssl-rand-hex-32
KEYCLOAK_ISSUER=http://localhost:8080/realms/ecommerce-realm
KEYCLOAK_CLIENT_ID=seller-workspace
KEYCLOAK_CLIENT_SECRET=<paste-SELLER_WORKSPACE_CLIENT_SECRET-from-root-.env>
```

`shoppay/.env.example`: tương tự, dùng `SHOPPAY_CLIENT_SECRET`.

### 3.6. Cập nhật `.env` thật của 3 app

Copy giá trị từ root `.env` sang `KEYCLOAK_CLIENT_SECRET` của từng app `.env`. Đây là chỗ duy nhất giá trị bị duplicate, nhưng cả 2 đều không commit → chấp nhận được.

(Cải tiến tương lai: viết script `scripts/sync-secrets.sh` đọc root `.env` rồi sinh ra `.env` của 3 app — không cần làm bây giờ.)

### 3.7. Bootstrap lại Keycloak

Vì secret đã được lưu vào DB Keycloak từ lần import trước, phải wipe DB để import lại với giá trị mới:

```bash
docker compose down
docker volume rm ecommerce-platform_postgres_data    # xoá DB Keycloak + ecommerce nếu chung volume
# Hoặc, nếu đã tách volume (todo 1.2): chỉ xoá volume Keycloak
docker compose up -d
```

> **Cảnh báo:** thao tác này xoá data ecommerce (orders, users app-side). Nếu chưa làm todo 1.2 (tách Postgres), nên backup trước:
> ```bash
> docker exec -t <postgres-container> pg_dump -U admin ecommerce > backup-ecommerce.sql
> ```

### 3.8. Verify

Sau khi up:

1. Truy cập `http://localhost:8080` → login admin với `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` từ `.env`.
2. Clients → `seller-workspace` → tab Credentials → copy "Client secret" → so sánh với `SELLER_WORKSPACE_CLIENT_SECRET` trong `.env`. Phải khớp.
3. Tương tự `shoppay-app`, `nextjs-app`, `backend-admin-client`.
4. Chạy 3 app:
   ```bash
   cd web-app && npm run dev          # 3000
   cd seller-workspace && npm run dev  # 3100
   cd shoppay && npm run dev           # 3200
   ```
5. Login từng app → nếu thành công và không có lỗi `invalid_client` trong log Keycloak → DONE.

### 3.9. Kiểm tra lần cuối: secret KHÔNG còn trong git

```bash
git grep -n "seller-workspace-secret\|shoppay-secret\|hehe dont steal"
# phải trả về 0 dòng

git status
# .env, web-app/.env, seller-workspace/.env, shoppay/.env phải ở "untracked"
```

---

## 4. Định nghĩa "xong"

- [ ] `.env` root tồn tại, chứa 4 client secret + admin password ngẫu nhiên 32-byte.
- [ ] `.env.example` root được commit, chỉ có placeholder.
- [ ] `docker-compose.yml` không còn default password yếu.
- [ ] `keycloak/ecommerce-realm.json` không còn plaintext secret nào (grep `"secret":` trả về toàn `${VAR}`).
- [ ] 3 app `.env.example` thay giá trị thật bằng placeholder.
- [ ] Wipe + reimport realm thành công, login 3 app OK.
- [ ] `git grep` không tìm thấy secret cũ.

---

## 5. Rủi ro & cách giảm thiểu

| Rủi ro | Cách xử lý |
|---|---|
| Quên đồng bộ giá trị giữa root `.env` và app `.env` → `invalid_client` | Verify ở bước 3.8.2 trước khi chạy app |
| Wipe volume làm mất data ecommerce dev | Backup pg_dump trước (3.7) hoặc làm todo 1.2 (tách volume) trước |
| `${VAR}` không resolve nếu Keycloak version cũ | Đang dùng `quay.io/keycloak/keycloak:latest` → OK. Nếu pin version cũ < 17, phải đổi |
| Secret cũ vẫn còn trong git history | Sau khi merge, chạy `git filter-repo` hoặc rotate lần nữa. Trong demo project chấp nhận được |
| Dev mới clone repo không biết tạo `.env` | README.md phần Setup phải nói: "copy `.env.example` → `.env`, sinh secret mới, làm tương tự cho 3 app/" |

---

## 6. Sau khi xong — bước tiếp theo

Mở đường cho:
- **Todo 3.1** — bảng `user_profile`: schema-only, không động secret, làm rất nhanh sau khi hạ tầng sạch.
- **Todo 1.2** — tách Postgres ecommerce/keycloak: giờ đã có `.env` chuẩn, chỉ cần thêm service `postgres-app` với `POSTGRES_APP_PASSWORD` riêng.
- **Todo 2.3 (Google IdP)** — secret Google OAuth client đẩy thẳng vào root `.env` theo cùng pattern: `GOOGLE_IDP_CLIENT_SECRET=...`, reference trong realm.json bằng `${GOOGLE_IDP_CLIENT_SECRET}`.

Pattern đã thiết lập ở 1.3 sẽ tái sử dụng cho mọi tích hợp về sau.
