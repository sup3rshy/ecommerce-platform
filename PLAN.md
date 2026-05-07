# PLAN — Phân tích kiến trúc & Quyết định thiết kế

> Đồ án mô phỏng hệ sinh thái Shopee/ShopeeFood/ShopeePay với Keycloak làm IdP trung tâm. File này KHÔNG kể lại hướng dẫn — đó nằm ở [README.md](README.md). Đây là **why** đằng sau các quyết định kiến trúc, để người đọc hiểu trade-off và replicate được cho dự án thật.

Mục lục:
1. [Tách secret ra `.env`](#1-tách-secret-ra-env)
2. [TOTP enforce per-client](#2-totp-enforce-per-client-cho-shoppay)
3. [SAML brokering qua realm thứ 2](#3-saml-brokering-qua-realm-thứ-2)
4. [Cross-app payment với HMAC](#4-cross-app-payment-với-hmac-2-chiều)
5. [Refresh token rotation](#5-refresh-token-rotation-trong-nextauth)
6. [Frontchannel logout vs Backchannel](#6-frontchannel-logout-vs-backchannel)
7. [Sync `user_profile` vs Event Listener SPI](#7-sync-user_profile-vs-event-listener-spi)
8. [Tách Postgres thành 2 instance](#8-tách-postgres-thành-2-instance)

---

## 1. Tách secret ra `.env`

### Vấn đề
Realm.json export từ Keycloak Admin Console mặc định nhúng plaintext: client secrets, admin password, SMTP password, IdP credentials. Commit nguyên xi vào git = leak hàng loạt credential.

### Quyết định
- Mọi secret → root `.env` (gitignore'd).
- Realm JSON chỉ giữ `${VAR_NAME}` placeholder.
- Custom entrypoint sed-replace placeholder TRƯỚC khi Keycloak parse → secrets được inject lúc runtime, không bao giờ ở rest trên disk dạng plaintext (trừ trong DB Keycloak sau import).

### Kiến thức cốt lõi
- **OAuth2 `client_secret`** là bearer credential. Leak = ai cũng đổi auth code → access token. Với client `confidential` có service account và quyền `realm-admin` (như `backend-admin-client`), leak ngang ngửa root password.
- **Twelve-Factor App III**: config vs code. Config = thứ thay đổi giữa môi trường (dev/staging/prod). Secret thuộc config → không bao giờ hard-code.
- **Keycloak placeholder substitution native** không reliable cross-version. Tự sed bulletproof.

### Trade-off
- ✅ Repo public không leak secret.
- ✅ Rotate secret = sửa 1 dòng `.env`.
- ❌ Sau import lần đầu, secret nằm trong DB Keycloak — rotate phải wipe + reimport (hoặc đổi qua Admin Console).
- 🔄 **Bước tiếp**: dùng Vault / Doppler / AWS Secrets Manager + dynamic credentials thay file `.env`. `.env` là bước 1 hợp lý cho dev, không phải production-grade.

---

## 2. TOTP enforce per-client cho ShopPay

### Vấn đề
ShopPay là ví điện tử — phải MFA. Nhưng bắt MFA toàn realm thì user mua hàng ecommerce cũng bị bắt → UX tệ. Cần **policy isolation theo app** dù dùng chung user pool.

### Quyết định
1. Tạo Authentication Flow `browser-shoppay`:
   - **KHÔNG có `auth-cookie`** → silent SSO bị bypass cho client này.
   - Subflow `shoppay-forms` REQUIRED: `auth-username-password-form` REQUIRED + `auth-otp-form` REQUIRED + `userSetupAllowed=true`.
2. Bind flow đó vào client `shoppay-app` qua `authenticationFlowBindingOverrides.browser`.
3. Các client khác (`nextjs-app`, `seller-workspace`) vẫn dùng flow `browser` mặc định → silent SSO + không TOTP.

### Kiến thức cốt lõi
- **Authentication Flow**: Keycloak modeled login như cây các "execution" với requirement `REQUIRED / ALTERNATIVE / CONDITIONAL / DISABLED`. ALTERNATIVE = cần ít nhất 1 ăn; REQUIRED = phải ăn.
- **Client binding override**: 1 client có thể tự chọn flow riêng cho `browser`/`direct grant`/`reset credentials`/`docker auth` thay vì dùng default realm.
- **`userSetupAllowed=true`**: nếu user chưa có credential (TOTP), authenticator triggers required action `CONFIGURE_TOTP` thay vì fail. Đây là magic bít cho UX setup-on-first-login.

### Trade-off đã cân nhắc
| Approach | Pros | Cons |
|---|---|---|
| **Bind flow per-client (đã chọn)** | Policy chỉ apply cho client cần | OTP add như user-level required action → bám user, mọi client login sau bị hỏi |
| Step-up `acr_values` | Per-action MFA, UX best | Phức tạp setup, cần app-side code phức tạp |
| Realm-level `verifyEmail` style | Đơn giản | Apply toàn realm, không isolate được |
| Force `prompt=login` ở app | Không cần Keycloak setup | Re-auth password mỗi lần, UX kém |

### Trade-off thực tế phải sống chung
TOTP enforce per-client KHÔNG hoàn toàn isolate: 1 khi user setup TOTP cho ShopPay, required action `CONFIGURE_TOTP` đã hoàn thành, OTP credential bám user → các flow khác có check `Conditional 2FA` cũng có thể trigger. Đây không phải bug, là Keycloak design (credential = user attribute, không phải client attribute).

### 🔄 Bước tiếp
Step-up auth qua `acr_values=2` là solution chuẩn ngành: app chỉ request MFA khi sensitive op, Keycloak prompt OTP cho session đó, không persist user-level required action. Cần custom Authentication Flow trả `acr` claim khác nhau theo path đi qua + NextAuth track session AAL.

---

## 3. SAML brokering qua realm thứ 2

### Vấn đề
Demo Identity Brokering pattern thật: nhân viên seller login bằng "tài khoản công ty" (Azure AD / Okta / Google Workspace SAML) thay vì tự tạo password trên Keycloak chính. Điều kiện: KHÔNG có Azure / Okta thật để test.

### Quyết định
Tạo realm thứ 2 (`acme-corp-realm`) trong cùng Keycloak instance, đóng vai **mock company IdP**. Realm chính (`ecommerce-realm`) làm SAML SP (Service Provider) brokering tới realm phụ.

```
[browser] → seller-workspace → ecommerce-realm (broker)
                                      ↓ SAML
                               acme-corp-realm (IdP)
                                      ↓
                          john.doe / Acme@2024
```

### Kiến thức cốt lõi
- **Identity Brokering**: Keycloak vừa là IdP (cho app) vừa là RP/SP (cho upstream IdP). App KHÔNG biết Google/SAML/LDAP tồn tại; Keycloak abstract đi.
- **First Broker Login Flow**: khi user lần đầu đến từ external IdP, Keycloak chạy flow này: review profile → create user / link existing → apply role mappers.
- **SAML SP-IdP relationship**: SP (ecommerce-realm) có entity ID = `http://localhost:8080/realms/ecommerce-realm`, redirect URL = `/broker/acme-corp/endpoint`. IdP (acme-corp-realm) có 1 SAML client với `clientId` = SP's entityId, `redirectUris` includes broker endpoint.
- **NameID format**: `emailAddress` để map `subject` của SAML assertion → `email` của Keycloak user.

### Trade-off
- ✅ Hoàn toàn tự động hoá được, không phụ thuộc account ngoài.
- ✅ Demo cùng Keycloak vừa làm OIDC IdP (cho buyer login form) vừa làm SAML SP (cho enterprise) — chứng minh versatile.
- ❌ KHÔNG ký assertion (`signAssertions=false`) → tránh chicken-and-egg về cert sync giữa 2 realm. Production phải sign + verify với cert chain thật.
- ❌ Mock realm nằm cùng Keycloak instance → không reflect setup thật (2 organizations khác nhau, 2 instance khác nhau, network giữa cách nhau qua internet).

### 🔄 Bước tiếp
Replace `acme-corp-realm` mock bằng integration thật với 1 trong:
- Azure AD Enterprise Application (free tier).
- Auth0 / Okta dev tenant.
- Self-host realm thứ 2 trên VPS riêng để mô phỏng cross-network.

---

## 4. Cross-app payment với HMAC 2 chiều

### Vấn đề
ecommerce checkout cần redirect user sang ShopPay để trừ ví, sau đó callback về với status. 2 service riêng biệt — query string trong URL có thể bị user tamper. Cần authenticate request 2 chiều mà KHÔNG dùng OIDC token (vì token có scope app-specific, dài, không phù hợp redirect).

### Quyết định
HMAC-SHA256 với shared secret `MERCHANT_HMAC_SECRET`:
- **Outbound** (ecommerce → ShopPay): `?merchant&orderId&amount&returnUrl&nonce` + `sig = HMAC(sorted_fields, secret)`.
- **Return** (ShopPay → ecommerce): `?orderId&status&txnId` + `sig = HMAC(those_fields, secret)`.
- ShopPay re-verify sig trên server action (chống user sửa form), idempotent dedupe theo `external_ref = "merchant:orderId"`.

### Kiến thức cốt lõi
- **HMAC vs raw hash**: HMAC immune length-extension (xem PLAN cũ section TOTP/SHA-1).
- **Sort fields trước khi hash**: 2 bên ký cùng input. Map iteration order không guaranteed.
- **`crypto.timingSafeEqual`**: chống timing attack khi compare sig.
- **Nonce**: chống replay attack — server có thể track nonce đã dùng (TODO chưa wire).
- **Idempotency**: thanh toán phải idempotent qua dedupe key (`merchant:orderId`) — user F5 không trừ ví 2 lần.

### Trade-off
- ✅ Đơn giản, không phụ thuộc OIDC token, share giữa 2 service.
- ✅ Verify ở cả page render (UX warning) lẫn server action (security).
- ❌ Shared secret = symmetric → cả 2 bên đều có thể giả forge. Production B2B PSP dùng RSA signature (PSP có private key, merchant verify với public).
- ❌ Nonce chưa được track (state-less) → vẫn có thể replay trong window.

### 🔄 Bước tiếp
- Lưu nonce đã dùng vào DB → reject duplicate.
- Đổi sang RSA-SHA256 cho "real PSP" pattern (ShopPay private key, ecommerce verify).
- Idle timeout cho payment URL (`exp` claim trong sig payload).

---

## 5. Refresh token rotation trong NextAuth

### Vấn đề
Keycloak default access token TTL = 5 phút. NextAuth không tự refresh. Sau 5 phút user chưa logout, mọi request đến Keycloak Admin API (KYC approve, role mgmt) sẽ fail vì token expired.

### Quyết định
Trong `jwt` callback của NextAuth, kiểm tra `Date.now() > token.accessTokenExpires - 60s` → gọi Keycloak `/token` với `grant_type=refresh_token` + `refresh_token` cũ → cập nhật token mới + nonce nếu Keycloak rotate refresh token.

```ts
const expires = token.accessTokenExpires as number | undefined;
if (expires && Date.now() < expires - 60_000) return token;
return await refreshAccessToken(token);
```

Nếu refresh fail (refresh token revoked / Keycloak session đã chết) → set `token.error = "RefreshAccessTokenError"`. Client-side thấy error → force re-login.

### Kiến thức cốt lõi
- **Access token vs refresh token**: access ngắn hạn (5 min) cho API call. Refresh dài hạn (30 min default) chỉ để xin access mới — KHÔNG đi chung mọi request.
- **Refresh token rotation**: Keycloak có thể trả refresh token mới mỗi lần refresh (chống reuse), nếu config `revoke_refresh_token=true` ở client.
- **NextAuth JWT cookie**: stateless, không có DB backing. Để invalidate session thật sự (không phải chỉ chờ token expire) cần custom logic — dùng `events.signOut` gọi Keycloak `/logout`, hoặc backchannel.

### Trade-off
- ✅ User không bị logout sau 5 phút khi đang dùng app.
- ✅ Refresh token rotation = security best practice (compromise của 1 token cũ không tái sử dụng được).
- ❌ Refresh logic chạy ở server side → mỗi page load có potential extra request đến Keycloak. Cache hit ratio quan trọng.
- ❌ NextAuth không trigger refresh proactive (chỉ lazy lúc page request) → API call ngay khi access token vừa expire có thể fail trước khi callback chạy.

---

## 6. Frontchannel logout vs Backchannel

### Vấn đề
Logout 1 app (ecommerce) phải invalidate session ở 2 app khác (seller-workspace, ShopPay) cùng SSO. Không thì user logout xong vẫn còn session ở các app khác.

### Quyết định: Frontchannel (chọn) vs Backchannel (defer)

| | Frontchannel | Backchannel |
|---|---|---|
| Cách hoạt động | Browser load 3 iframe ẩn, mỗi iframe gọi 1 client `/api/auth/frontchannel-logout` (GET) → app clear cookie | Keycloak POST `logout_token` JWT trực tiếp tới mỗi client `/api/auth/backchannel-logout` (server-to-server) |
| Phụ thuộc | Browser (3rd-party cookie phải work) | Network (Keycloak phải reach client từ server side) |
| Invalidation guarantee | Tốt khi browser cooperative; fail nếu browser block 3rd-party cookie hoặc tab đang đóng | Strong, không phụ thuộc browser |
| Implementation | Đơn giản: 1 GET endpoint xoá cookie | Phức tạp: verify JWT signature, store revoked sid trong DB, check trong session callback |

Demo này chọn frontchannel vì:
- Đủ tốt cho `localhost` dev (cùng eTLD+1).
- Setup cấu hình client + endpoint = vài phút.
- Backchannel cần DB revoked-sid table + signed JWT verification = 1-2h code đáng để dành cho production.

### Trade-off
- ✅ Frontchannel hoạt động cho 90% use case demo.
- ❌ Browser block 3rd-party cookie (Safari ITP, Brave default, Firefox ETP strict) → iframe không clear cookie được.
- 🔄 **Bước tiếp**: production switch sang backchannel chuẩn — JWT logout token verify, DB revoked sid list, NextAuth `session` callback consult list.

---

## 7. Sync `user_profile` vs Event Listener SPI

### Vấn đề
App cần biết user info (email, name, roles) cho audit log, owner_id, business logic. Gọi Keycloak Admin API mỗi request = chậm + tải Keycloak.

### Quyết định: Sync khi login (chọn) vs Event Listener SPI (defer)

| | Sync khi login | Event Listener SPI |
|---|---|---|
| Cách | NextAuth `jwt` callback gọi `syncUserProfile()` upsert vào DB app | Keycloak emit event (UserRegistered/UserUpdated/UserDeleted) → SPI listener notify app DB |
| Implementation | 1 file TS, ~30 dòng | Java module, build jar, extend Keycloak Docker image, deploy `/opt/keycloak/providers/`, register SPI |
| Coverage | User CRUD ngoài luồng login (admin xoá user) → app DB stale | Real-time, mọi event |
| Maintenance | Cao: stale data nếu user không login lâu | Cao: Java deps, Keycloak version compat |

Demo chọn sync-khi-login vì:
- 90% use case OK (user không login = không cần data ở app DB).
- Pure TypeScript, không thêm Java toolchain.
- Stale data tối đa = thời gian giữa 2 lần login user, acceptable cho non-critical app.

### Trade-off
- ✅ Implementation đơn giản, debug bằng Node.
- ❌ Admin xoá user trong Keycloak → row `user_profile` còn lại trong DB app cho đến khi cleanup tay.
- 🔄 **Bước tiếp**: SPI Java khi cần tight consistency (vd compliance: user yêu cầu xoá data theo GDPR, phải xoá cross-system trong vài phút).

---

## 8. Tách Postgres thành 2 instance

### Vấn đề
Ban đầu 1 Postgres chứa cả Keycloak data lẫn 3 app DB. Wipe Keycloak DB phải tránh wipe ecommerce/seller_workspace/shoppay → script phức tạp + nguy hiểm.

### Quyết định
2 service Postgres riêng:
- `postgres-keycloak`: chỉ Keycloak, không expose port → security tốt hơn.
- `postgres-app`: chứa 3 DB app, expose `:5432` cho dev (drizzle-kit chạy từ host).

2 volume riêng → wipe 1 không đụng cái kia.

### Trade-off
- ✅ Wipe Keycloak (mỗi lần đổi realm.json) không mất data app.
- ✅ Postgres Keycloak không expose → giảm attack surface.
- ❌ 2 container = ~+150MB RAM. Không vấn đề cho dev.
- ❌ App schema không thể JOIN với Keycloak schema (đúng intent: app chỉ thấy `user_profile` cache).

---

## Quy tắc thiết kế chung (rút ra từ project)

1. **Mọi instruction chứa secret phải đọc từ `.env`, không bao giờ commit**.
2. **Realm config phải reproducible**: chạy `bash scripts/reset.sh` ở máy mới phải ra kết quả y hệt máy cũ. Không có "config drift" giữa các môi trường.
3. **Defense in depth**: route guard (proxy.ts) + action guard (server action). Bypass 1 lớp không đủ để leak.
4. **Audit mọi sensitive action**: topup, pay, kyc.approve/reject, role.assign/revoke. 1 dòng `await logAudit(...)` ở cuối server action.
5. **Idempotency**: mọi server action có thể được trigger 2 lần (user F5, network retry). Dedupe ở layer thấp nhất (DB unique constraint hoặc `onConflictDoUpdate`).
6. **Cookie name riêng cho mỗi app**: 3 app trên `localhost` không đè cookie nhau. Trong prod (sub-domain khác nhau) không cần, nhưng cookie name riêng vẫn là good practice.
7. **HMAC 2 chiều cho cross-service redirect**: không bao giờ trust query string.

---

Xem [todo.md](todo.md) cho status các item, [README.md](README.md) cho hướng dẫn vận hành + test plan A-L.
