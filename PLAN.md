# PLAN - Kiến trúc và quyết định thiết kế

Tài liệu này giải thích "vì sao" hệ thống được thiết kế như hiện tại. Hướng dẫn chạy và demo nằm trong [README.md](README.md); danh sách việc còn lại nằm trong [TODO.md](TODO.md).

## 1. Mục tiêu

Repo mô phỏng một hệ sinh thái ecommerce gồm 3 ứng dụng độc lập nhưng dùng chung danh tính:

| Ứng dụng | Port | Mục đích |
| --- | --- | --- |
| `web-app` | 3000 | Marketplace cho buyer, seller và admin |
| `seller-workspace` | 3100 | Back-office cho seller và nhân viên shop |
| `shoppay` | 3200 | Ví điện tử, KYC, nạp tiền, thanh toán |

Keycloak đóng vai trò IdP trung tâm cho SSO, MFA, SAML brokering, role/group mapping và Single Logout.

## 2. Ranh giới kiến trúc

Hệ thống tách 3 lớp rõ ràng:

- Identity plane: Keycloak realm `ecommerce-realm`, mock enterprise realm `acme-corp-realm`, roles, groups, auth flows, IdP brokering.
- App plane: 3 Next.js app dùng NextAuth v4, mỗi app có cookie riêng để không đè lên nhau trên `localhost`.
- Data plane: `postgres-keycloak` nội bộ cho Keycloak và `postgres-app` expose `:5432` cho DB ứng dụng.

Quyết định tách Postgres giúp tránh trộn lẫn lifecycle: reset Keycloak realm không đồng nghĩa với reset dữ liệu app, và ngược lại.

## 3. Secrets và realm import

Realm export từ Keycloak thường nhúng plaintext client secret. Repo này không commit secret trực tiếp trong realm JSON:

- Root `.env` chứa secret runtime.
- `keycloak/ecommerce-realm.json` và `keycloak/acme-corp-realm.json` dùng placeholder `${VAR_NAME}`.
- `keycloak/entrypoint.sh` resolve placeholder trước khi Keycloak import realm.
- `scripts/bootstrap.sh` sinh secret và sync `.env` cho 3 app.

Trade-off: `.env` phù hợp local demo, không phải production-grade. Production nên dùng Vault, Doppler, AWS Secrets Manager hoặc secret của orchestrator.

## 4. OIDC SSO giữa 3 app

Mỗi app là một confidential OIDC client riêng:

- `nextjs-app` cho `web-app`.
- `seller-workspace` cho back-office.
- `shoppay-app` cho ví điện tử.

Mỗi app dùng NextAuth JWT session. Cookie được đặt tên riêng:

- `ecommerce.session-token`
- `seller-workspace.session-token`
- `shoppay.session-token`

Lý do: cả 3 app chạy trên `localhost` với port khác nhau. Nếu dùng cookie mặc định của NextAuth, cookie có thể đè lên nhau và làm sai session.

## 5. Refresh token rotation và stale session

Keycloak access token ngắn hạn. NextAuth không tự refresh, nên mỗi app có `lib/refreshAccessToken.ts`.

Luôn xử lý 3 trường hợp:

- Access token còn hạn: giữ nguyên.
- Gần hết hạn: gọi Keycloak token endpoint với `grant_type=refresh_token`.
- Refresh fail do `invalid_grant`, `Session not active`, revoke session: đánh dấu `RefreshAccessTokenError`.

Sau fix mới, app không refresh lặp vô hạn và không ném `console.error` trong server render gây Next dev overlay. Session callback coi token lỗi như logged-out, proxy cũng redirect về signin nếu gặp stale JWT.

## 6. ShopPay MFA per-client

ShopPay cần bảo mật cao hơn marketplace. Thay vì bắt TOTP toàn realm, repo bind authentication flow riêng cho client `shoppay-app`:

- Flow `browser-shoppay`.
- Không dựa vào `auth-cookie` silent login như client thường.
- Username/password và OTP là required trong flow ShopPay.
- `userSetupAllowed=true` để user chưa có TOTP được setup lần đầu.

Trade-off: đây là client-specific MFA enforcement, không phải step-up theo từng action. Production có thể nâng cấp sang ACR/AMR step-up: chỉ yêu cầu MFA khi topup lớn, pay, đổi PIN, rút tiền.

## 7. SAML brokering với `acme-corp-realm`

Để demo B2B identity brokering mà không cần Azure AD/Okta thật, repo dùng realm thứ hai `acme-corp-realm` làm mock company IdP.

Luồng đi như sau:

1. User vào `seller-workspace`.
2. Keycloak `ecommerce-realm` hiện nút "Sign in with Acme Corp".
3. Browser sang `acme-corp-realm` qua SAML.
4. Acme xác thực user và POST SAML Response về broker endpoint.
5. `ecommerce-realm` tạo/link user và mapper role `seller`.

Production cần bật signed assertions, cert rotation và metadata endpoint từ IdP thật.

## 8. Cross-app payment với HMAC

`web-app` redirect sang `shoppay` để thanh toán. Query string có thể bị user sửa, nên hai app ký payload bằng HMAC-SHA256 với `MERCHANT_HMAC_SECRET`.

Pattern:

- Ecommerce tạo payment URL với `merchant`, `orderId`, `amount`, `returnUrl`, `nonce`, `sig`.
- ShopPay verify signature khi render và verify lại trong server action.
- ShopPay trừ ví idempotent theo external ref `merchant:orderId`.
- Return URL về ecommerce cũng có signature riêng để update order.

Trade-off: HMAC là symmetric secret; nếu một bên leak secret thì bên đó có thể forge. Production PSP thường dùng asymmetric signature.

## 9. KYC và giao dịch giá trị cao

Business rule: giao dịch ShopPay trên 5.000.000 VND cần KYC.

Ban đầu action chỉ check `session.user.roles.includes("kyc-verified")`. Cách này sai UX sau khi admin approve vì role mới đã có trong Keycloak nhưng JWT cookie cũ chưa có claim mới.

Quyết định mới:

- `approveKyc` cập nhật DB và luôn gọi Keycloak Admin API gán role, kể cả khi document đã `approved`.
- `topup` > 5 triệu check 3 nguồn: role trong session, role mới nhất từ Keycloak Admin API, và DB `kyc_documents.status = approved`.
- User được nạp tiền ngay sau khi duyệt KYC, không cần logout/login lại.

## 10. Frontchannel logout và giới hạn của browser

Keycloak frontchannel logout gọi iframe ẩn tới mỗi client:

- `http://localhost:3000/api/auth/frontchannel-logout`
- `http://localhost:3100/api/auth/frontchannel-logout`
- `http://localhost:3200/api/auth/frontchannel-logout`

Endpoint xoá cookie NextAuth và các cookie transient (`csrf`, `callback`, `pkce`, `state`, `nonce`). Để tránh browser chặn Set-Cookie trong iframe làm tab active vẫn còn session, endpoint còn ghi marker `localStorage`. Client component `SingleLogoutWatcher` lắng nghe marker và gọi `signOut({ redirect: false })`, sau đó reload tab.

Trade-off: frontchannel vẫn phụ thuộc browser. Production nên có backchannel logout: verify `logout_token`, lưu revoked `sid` trong DB, và check trong session/proxy.

## 11. User profile cache

Mỗi app có bảng `user_profile` để cache sub, email, name, roles, groups khi login. Mục tiêu là giảm gọi Keycloak Admin API trên mỗi request và có đủ thông tin cho audit/business logic.

Trade-off: data có thể stale nếu admin sửa user ngoài luồng login. Nếu cần consistency mạnh, nên viết Keycloak Event Listener SPI hoặc webhook để sync UserUpdated/UserDeleted.

## 12. Hướng production

Những thay đổi nên làm nếu đưa ra môi trường thật:

- HTTPS và cookie `secure: true`.
- Backchannel logout thay cho frontchannel-only.
- Secrets manager thay `.env`.
- Drizzle migration versioned thay `db:push`.
- Nonce replay table cho payment URL.
- Step-up auth bằng ACR/AMR cho ShopPay.
- Integration test cho SSO, SLO, KYC, HMAC payment.
