# lib/ (scaffold)

Các module cần thêm khi triển khai ShopFood (tham khảo `shop-pay/lib/`):

- `refreshAccessToken.ts` — refresh Keycloak access token khi gần hết hạn.
- `syncUserProfile.ts` — cache sub/email/name/roles vào DB lúc login.
- `auth.ts` — `authOptions` cho NextAuth (Keycloak provider, callbacks).
