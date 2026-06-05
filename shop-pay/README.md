# ShopPay — Ví điện tử

App ví điện tử trong hệ sinh thái ecommerce. Dùng chung Keycloak realm với web-app và seller-workspace, nhưng client OIDC riêng (`shoppay-app`) và **chính sách MFA bắt buộc**.

## Khác gì với 2 app còn lại

- **ecommerce** (3000): mua/bán hàng — buyer/seller flow.
- **seller-workspace** (3100): quản lý nhân viên, audit log.
- **ShopPay** (3200): ví, top-up, KYC, thanh toán cross-app.

ShopPay yêu cầu **TOTP (Authenticator app)** — dùng `wallet1` đã pre-configure required action `CONFIGURE_TOTP` để demo.

## Chạy local

```bash
docker exec -i $(docker ps -qf "name=postgres") \
  psql -U admin -d postgres -c "CREATE DATABASE shoppay;"

cd shoppay
cp .env.example .env
npm install
npm run db:push
npm run dev    # http://localhost:3200
```

## Demo MFA flow

1. Mở `http://localhost:3200` → Đăng nhập SSO.
2. Login bằng `wallet1` / `Wallet1@2024`.
3. Keycloak detect required action `CONFIGURE_TOTP` → bắt buộc setup TOTP:
   - Cài app Authenticator (Google Authenticator, Microsoft Authenticator, 1Password, ...) trên điện thoại.
   - Quét QR code Keycloak hiện ra.
   - Nhập 6 chữ số từ app.
4. Sau khi confirm → redirect về ShopPay.
5. Lần đăng nhập **kế tiếp** chỉ cần password + TOTP code (không phải setup lại).

## Routes

| URL | Chức năng |
|---|---|
| `/` | Landing |
| `/wallet` | Số dư + 20 giao dịch gần nhất |
| `/topup` | Nạp tiền (mock gateway) |
| `/kyc` | Nộp giấy tờ xác minh |

## Schema

```
wallets         (user_id, currency, balance)
transactions    (wallet_id, type, amount, status, external_ref, description)
kyc_documents   (user_id, full_name, doc_type, doc_number, status)
```

## Bước tiếp theo (chưa làm)

- Wire flow **ecommerce checkout → ShopPay**: redirect sang `/pay?orderId=X&amount=Y&returnUrl=Z`, ShopPay deduct + redirect ngược lại với token.
- Approve KYC từ admin app + tự động gán role `kyc-verified` qua Keycloak Admin API.
- Step-up auth: re-prompt TOTP cho mỗi giao dịch &gt; 5 triệu (không chỉ ở login).
