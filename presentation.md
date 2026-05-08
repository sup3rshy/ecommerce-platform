# Presentation - Ecommerce Platform và Identity Management

Kịch bản này phù hợp bài trình bày 15-20 phút. Có thể dùng trực tiếp làm speaker notes.

## Slide 1 - Tên đề tài

**Xây dựng hệ sinh thái Ecommerce tích hợp quản lý định danh tập trung với Keycloak**

Mở đầu:

"Đề tài của em không chỉ là một website bán hàng. Em xây dựng một hệ sinh thái gồm marketplace, seller portal và ví điện tử, trong đó danh tính người dùng được quản lý tập trung bằng Keycloak."

## Slide 2 - Bài toán

Trong một hệ sinh thái giống Shopee/Grab:

- Người mua, người bán, nhân viên và admin cần dùng nhiều app khác nhau.
- User không nên phải tạo tài khoản riêng cho từng app.
- Ví điện tử cần bảo mật cao hơn app mua hàng thông thường.
- Đối tác doanh nghiệp có thể muốn login bằng tài khoản công ty.
- Logout một nơi phải logout cả hệ sinh thái.

Thông điệp chính:

"Bài toán cốt lõi là Identity and Access Management, không chỉ là CRUD ecommerce."

## Slide 3 - Kiến trúc tổng quan

Giới thiệu 3 app:

- `web-app`: marketplace cho buyer/seller/admin.
- `seller-workspace`: back-office cho seller và staff.
- `shoppay`: ví điện tử, KYC, topup, payment.

Keycloak:

- OIDC IdP cho 3 app.
- SAML broker cho Acme Corp.
- Role/group/MFA/logout policy.

Database:

- Postgres riêng cho Keycloak.
- Postgres app cho business data.

## Slide 4 - SSO bằng OIDC

Nội dung trình bày:

"Mỗi app là một OIDC client riêng. Khi user login thành công ở app đầu tiên, Keycloak tạo realm session. App thứ hai redirect sang Keycloak, Keycloak nhận ra session có sẵn và trả code về app mà không hỏi password lại."

Điểm kỹ thuật:

- NextAuth v4 xử lý auth code flow.
- Mỗi app có cookie name riêng trên `localhost`.
- Refresh token được xử lý server-side để session không chết sau access token TTL ngắn.

Demo ngắn:

1. Login `seller1` ở `web-app`.
2. Mở `seller-workspace`.
3. Cho thấy không hỏi password lại.

## Slide 5 - Single Logout

Nội dung trình bày:

"SSO mà không có SLO thì nguy hiểm: user logout ở marketplace nhưng seller portal hoặc ví điện tử vẫn còn session."

Implementation:

- Keycloak frontchannel logout bật cho 3 OIDC client.
- Mỗi app có `/api/auth/frontchannel-logout`.
- Endpoint xoá tất cả cookie NextAuth liên quan.
- `SingleLogoutWatcher` giúp tab đang mở tự gọi `signOut` khi iframe logout ghi marker localStorage.

Trade-off:

- Frontchannel dễ demo và dùng tốt local.
- Production nên thêm backchannel logout với signed `logout_token`.

Demo:

1. Login cả 3 app.
2. Logout từ `web-app`.
3. Reload `seller-workspace` và `shoppay`, cả hai phải mất session.

## Slide 6 - Seller Workspace và RBAC

Nội dung:

"Seller Workspace dùng chung user pool nhưng chỉ seller/admin/staff mới vào được. Buyer vào sẽ thấy denied page tối giản, không leak menu hay route."

Điểm kỹ thuật:

- `proxy.ts` guard theo role.
- Server action vẫn check role lại để defense in depth.
- Groups trong Keycloak map staff theo phòng ban: warehouse, cs, finance.
- Audit log ghi các action nhạy cảm.

Demo:

- Login `buyer1` vào `seller-workspace` -> `/denied`.
- Login `warehouse1` -> thấy dashboard role staff.

## Slide 7 - SAML Identity Brokering

Nội dung:

"Để mô phỏng B2B, em tạo realm thứ hai `acme-corp-realm` đóng vai công ty đối tác. Ecommerce realm đóng vai broker, nhận SAML assertion từ Acme và cấp role seller."

Flow:

1. User chọn "Sign in with Acme Corp".
2. Browser sang Acme login.
3. Acme trả SAML Response về broker endpoint.
4. Keycloak tạo/link user và map role seller.
5. App vẫn chỉ nhận OIDC token từ ecommerce realm.

Demo:

- `john.doe` / `Acme@2024` login vào seller workspace.

## Slide 8 - ShopPay MFA per-client

Nội dung:

"Ví điện tử có rủi ro cao hơn marketplace. Nếu ép MFA toàn realm thì UX của buyer kém. Nếu không ép MFA cho ví thì rủi ro cao. Giải pháp là bind authentication flow riêng cho client `shoppay-app`."

Điểm kỹ thuật:

- Flow `browser-shoppay`.
- Password + OTP required.
- `userSetupAllowed=true` cho lần đầu setup TOTP.
- Các app khác không bị ép theo flow này.

Demo:

- Vào `shoppay`, login `wallet1`, cho thấy QR/TOTP.

Lưu ý khi bị hỏi:

"Đây là client-specific MFA enforcement. Nếu production cần UX tốt hơn, có thể nâng cấp thành step-up auth theo ACR/AMR chỉ khi giao dịch nhạy cảm."

## Slide 9 - KYC và topup > 5 triệu

Nội dung:

"ShopPay áp dụng rule: giao dịch trên 5.000.000 VND cần KYC. Reviewer có role admin hoặc staff-finance duyệt hồ sơ, app gọi Keycloak Admin API gán role `kyc-verified`."

Fix quan trọng:

- Không chỉ tin role trong JWT cookie vì token có thể stale sau khi approve.
- Topup lớn check role trong session, role mới nhất từ Keycloak Admin API, và DB KYC approved.
- User được nạp ngay sau approve, không cần logout/login.

Demo:

1. `wallet1` nộp KYC.
2. `admin1` approve ở `/kyc/admin`.
3. `wallet1` nạp 6.000.000 VND thành công ngay.

## Slide 10 - Cross-app Payment HMAC

Nội dung:

"Ecommerce redirect sang ShopPay bằng URL. Query string có thể bị sửa, nên không thể tin client. Hai app ký request bằng HMAC-SHA256."

Flow:

1. Ecommerce tạo payment URL với `orderId`, `amount`, `returnUrl`, `nonce`, `sig`.
2. ShopPay verify signature khi render và khi submit.
3. ShopPay trừ ví idempotent.
4. ShopPay return về ecommerce với signature mới.
5. Ecommerce verify và update order.

Demo:

- Đặt hàng.
- Click pay.
- Sửa `amount` trên URL.
- Cho thấy signature fail.
- Thanh toán lại bằng URL hợp lệ.

## Slide 11 - Secret và automation

Nội dung:

"Keycloak realm export thường chứa client secret. Repo này tách secret ra `.env`, realm JSON chỉ giữ placeholder. Entrypoint resolve placeholder lúc import."

Automation:

- `scripts/bootstrap.sh`: sinh secret và sync app env.
- `scripts/reset.sh`: backup, wipe, import realm, push schema, seed data.
- `npm run dev`: chạy 3 app và warmup.

Thông điệp:

"Đề tài có thể reset và demo lại từ đầu bằng script, không phụ thuộc thao tác tay trừ những integration cần credential thật như Google."

## Slide 12 - Trade-off và roadmap

Trade-off hiện tại:

- Frontchannel logout nhanh và dễ demo, production nên có backchannel.
- `.env` phù hợp local, production cần secrets manager.
- ShopPay MFA per-client tốt cho demo, production nên step-up theo từng action.
- HMAC symmetric đơn giản, production payment gateway nên dùng asymmetric signature và nonce replay store.

Roadmap:

- Backchannel logout.
- Step-up ACR/AMR.
- Playwright integration tests.
- Drizzle migrations.
- Azure AD/Okta SAML thật.
- WebAuthn/passkey.

## Slide 13 - Kết luận

Kết luận để nói:

"Kết quả của đồ án là một hệ sinh thái đa app dùng chung danh tính, có SSO, SLO, MFA riêng cho ví điện tử, SAML brokering cho doanh nghiệp, KYC gán role runtime, và thanh toán cross-app có chữ ký HMAC. Điểm trọng tâm không nằm ở giao diện bán hàng, mà nằm ở cách thiết kế Identity Management cho một platform nhiều ứng dụng."

## Demo order gợi ý

Nếu chỉ có 7 phút demo, dùng thứ tự này:

1. SSO `seller1`: `web-app` -> `seller-workspace`.
2. SLO: logout một app, reload app còn lại.
3. SAML: `john.doe` vào seller workspace.
4. ShopPay TOTP: vào `/wallet`.
5. KYC approve + topup 6 triệu.
6. HMAC payment tampering.

## Câu hỏi có thể gặp

**Vì sao không dùng Backchannel Logout ngay?**

Frontchannel dễ demo nhanh trên local. Backchannel cần verify JWT logout token, lưu revoked session id và check trên mỗi request. Đây là roadmap production.

**Vì sao topup check cả DB KYC lẫn Keycloak role?**

Để tránh stale JWT. Role mới có thể đã được gán trong Keycloak nhưng session cookie của user chưa có claim mới. DB approved giúp UX nhanh, Keycloak role giúp đồng bộ IAM.

**TOTP ShopPay có phải step-up không?**

Implementation hiện tại là client-specific MFA flow. Nó giải quyết đúng mục tiêu demo: vào ShopPay thì bắt MFA. Step-up đúng nghĩa theo action/ACR là roadmap nâng cao.

**HMAC có đủ an toàn cho thanh toán thật không?**

HMAC đủ tốt cho service-to-service demo với shared secret. Production nên thêm nonce replay store, expiry và có thể dùng asymmetric signing.
