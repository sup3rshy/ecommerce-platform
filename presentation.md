# Kịch bản Thuyết trình Đồ án: Hệ sinh thái Ecommerce Platform & Identity Management

Dưới đây là kịch bản chi tiết từ A-Z dành cho buổi bảo vệ đồ án của bạn. Kịch bản được thiết kế cho khoảng 15-20 phút trình bày, kết hợp giữa slide và demo thực tế.

---

## Phần 1: Mở đầu (2 phút)

**[Slide 1: Tên đồ án & Thành viên]**
"Xin chào các thầy cô và các bạn. Hôm nay, em/nhóm em xin trình bày về đồ án: **Xây dựng Hệ sinh thái Thương mại điện tử tích hợp Quản lý Định danh tập trung (Identity Management) với Keycloak.**"

**[Slide 2: Đặt vấn đề]**
"Trong thực tế, một hệ sinh thái lớn như Shopee hay Grab không chỉ có một ứng dụng duy nhất. Họ có ứng dụng cho người mua, portal cho người bán, và ví điện tử để thanh toán. 
Vấn đề đặt ra là:
1. Làm sao để người dùng chỉ cần đăng nhập một lần (SSO) mà có thể dùng chung cho cả 3 hệ thống?
2. Làm sao để tích hợp tài khoản nội bộ của các đối tác doanh nghiệp B2B (như đăng nhập bằng tài khoản công ty) mà không bắt họ tạo tài khoản mới?
3. Làm sao để đảm bảo an toàn tuyệt đối cho ứng dụng Ví điện tử (bắt buộc xác thực 2 lớp - 2FA) trong khi các ứng dụng mua hàng thông thường không cần thiết?
Đó chính là lý do chúng em xây dựng hệ thống này."

---

## Phần 2: Tổng quan Kiến trúc (3 phút)

**[Slide 3: Sơ đồ Kiến trúc Hệ thống]**
"Hệ thống của chúng em được chia làm 3 ứng dụng Next.js độc lập:
1. **Web-app**: Nơi người mua (Buyer) mua sắm.
2. **Seller-workspace**: Portal quản lý cho người bán (Seller) và Admin.
3. **Shoppay**: Ví điện tử xử lý thanh toán.

Đứng ở trung tâm bảo mật là **Keycloak** đóng vai trò là Identity Provider (IdP) xử lý toàn bộ quy trình Authentication (xác thực) và Authorization (phân quyền). Dữ liệu được lưu trữ độc lập trên 2 instance PostgreSQL (một cho Keycloak, một cho hệ thống App) để đảm bảo cô lập dữ liệu."

---

## Phần 3: Các Tính năng Bảo mật Cốt lõi (5 phút)

**[Slide 4: Single Sign-On (SSO) & Quản lý Phiên]**
"Tính năng đầu tiên là SSO. Chúng em sử dụng giao thức OpenID Connect (OIDC). Điểm đặc biệt trong thiết kế là chúng em đã tuỳ biến luồng Rotate Refresh Token trong NextAuth. Khi Access Token hết hạn sau 5 phút, hệ thống tự động xin token mới ở background, giúp trải nghiệm người dùng không bị gián đoạn, đồng thời thu hồi token cũ ngay lập tức để chống Replay Attack."

**[Slide 5: Tích hợp B2B với SAML Identity Brokering]**
*(Đây là phần ăn điểm nhất)*
"Một tính năng nâng cao là **SAML Identity Brokering**. Giả sử chúng em có một đối tác doanh nghiệp là công ty Acme Corp. Thay vì bắt nhân viên Acme Corp tạo tài khoản mới, hệ thống của chúng em (đóng vai trò Service Provider) sẽ liên kết trực tiếp với Active Directory của Acme Corp (đóng vai trò Identity Provider) thông qua giao thức **SAML 2.0**.
Người dùng nhấn nút 'Sign in with Acme Corp', hệ thống sẽ bẻ lái sang hệ thống của công ty họ, xác thực thành công sẽ tự động cấp quyền `seller` và bỏ qua bước điền thông tin rườm rà. Hệ thống cũng được thiết kế chuẩn vòng lặp **Single Sign-Out (SLO)**: đăng xuất ở app của chúng em sẽ tự động dọn dẹp luôn session bên phía công ty đối tác."

**[Slide 6: Step-up Authentication & TOTP cho Ví điện tử]**
"Bài toán đau đầu nhất là Ví điện tử Shoppay. Nếu áp dụng SSO thông thường, người dùng đang ở Seller Workspace bấm sang Shoppay sẽ vào thẳng ví, rất nguy hiểm. Nếu ép bật TOTP (2FA) toàn hệ thống thì trải nghiệm mua hàng lại quá tệ.
Giải pháp của chúng em là áp dụng **Step-up Authentication** (Xác thực tăng cường). Chúng em thiết kế một luồng Flow độc lập cho riêng Shoppay trên Keycloak: Nó vẫn nhận diện Cookie SSO hoặc SAML để không bắt nhập lại mật khẩu, nhưng luôn LUÔN bật cờ `REQUIRED` để ép người dùng phải nhập mã TOTP của Google Authenticator mỗi khi chạm vào Ví."

**[Slide 7: Cross-app Payment với HMAC]**
"Về luồng thanh toán giữa Ecommerce và Shoppay, để chống việc người dùng sửa đổi URL thanh toán (ví dụ sửa giá tiền từ 100k thành 10k), chúng em không truyền params thông thường mà sử dụng chữ ký điện tử **HMAC-SHA256**. Cả chiều đi và chiều về đều được ký bằng một Secret Key nội bộ, chặn đứng hoàn toàn rủi ro can thiệp dữ liệu từ phía Client."

---

## Phần 4: Demo Thực tế (5 - 7 phút)

*(Lúc này bạn thao tác trực tiếp trên màn hình, vừa làm vừa thuyết minh)*

1. **Demo SSO**: Mở 2 tab `web-app` và `seller-workspace`. Đăng nhập ở web-app bằng tài khoản Buyer. Chuyển sang seller-workspace, F5 và thấy hệ thống tự nhận diện. Sau đó bấm Đăng xuất, cả 2 tab đều bị out (Chứng minh Front-channel Logout).
2. **Demo SAML Brokering**: Bấm vào nút "Sign in with Acme Corp" ở seller-workspace. Giải thích rằng nó đang chuyển hướng sang hệ thống IdP của công ty đối tác. Đăng nhập bằng `john.doe / Acme@2024`. Đăng nhập thành công và cho thấy tài khoản tự động được gán role Seller. Bấm Đăng xuất để demo SAML SLO (Single Sign-Out).
3. **Demo Step-up Auth (TOTP)**: Giữ session của `john.doe` ở seller-workspace. Mở tab mới truy cập `Shoppay`. Màn hình Shoppay lập tức chặn lại, bỏ qua bước nhập mật khẩu nhưng yêu cầu nhập mã TOTP. (Chứng minh luồng Step-up Auth hoạt động hoàn hảo).
4. **Demo HMAC Payment**: Đặt một đơn hàng bên web-app, click thanh toán. Chỉ cho hội đồng xem đoạn URL dài ngoằng có chứa chữ ký số `sig=...`. Thử sửa một tham số trên URL (ví dụ đổi amount) và nhấn Enter -> Hệ thống báo lỗi "Invalid Signature" ngay lập tức.

---

## Phần 5: Khó khăn, Đánh đổi (Trade-offs) & Tương lai (2 phút)

**[Slide 8: Khó khăn và Quyết định Thiết kế]**
"Trong quá trình làm đồ án, chúng em đã phải đưa ra các quyết định đánh đổi (Trade-offs):
1. **Front-channel vs Back-channel Logout**: Hiện tại hệ thống dùng Front-channel qua iframe để clear cookie SSO. Nó nhẹ, dễ triển khai nhưng sẽ bị lỗi nếu trình duyệt chặn 3rd-party cookie (như Safari). Trong tương lai, hệ thống nên chuyển sang Back-channel với JWT Logout Token.
2. Quản lý Secret: Chúng em đã viết custom script để tách toàn bộ secret ra khỏi file JSON của Keycloak, nhúng vào `.env` lúc khởi động để tránh leak credential lên Github. Tuy nhiên ở mô hình Production chuẩn thì cần dùng AWS Secrets Manager hoặc Hashicorp Vault."

**[Slide 9: Tổng kết]**
"Tóm lại, đồ án không chỉ xây dựng một ứng dụng bán hàng thông thường, mà tập trung giải quyết bài toán cốt lõi về **Kiến trúc Bảo mật Hệ thống** ở quy mô doanh nghiệp lớn: từ SSO, SAML B2B, xác thực tăng cường Step-up Auth, cho đến toàn vẹn dữ liệu bằng HMAC. 

Cảm ơn các thầy cô và các bạn đã lắng nghe. Em/Nhóm em xin phép kết thúc phần trình bày và rất mong nhận được câu hỏi từ hội đồng."
