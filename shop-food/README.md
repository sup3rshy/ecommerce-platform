# ShopFood — Đặt món ăn

App đặt món ăn trong hệ sinh thái ecommerce. SSO qua Keycloak (`ecommerce-realm`), DB **độc lập** `shopfood` (tách khỏi DB dùng chung của ShopEcommerce/ShopSell để bảo vệ throughput khi đơn món tăng đột biến).

> Trạng thái: **SCAFFOLD**. Đây mới là khung thư mục để khớp kiến trúc mục tiêu. NextAuth, role guard, và logic đặt món chưa được triển khai. Xem [../TODO.md](../TODO.md) mục "ShopFood".

| Thuộc tính | Giá trị |
| --- | --- |
| Port | 3300 |
| OIDC client | `shopfood-app` |
| Realm | `ecommerce-realm` |
| DB | `shopfood` (độc lập) |
| Role tối thiểu | `buyer` (đặt món); quản trị: `food_admin` |

## Cấu trúc

```text
shop-food/
├── app/            # layout + landing (placeholder)
├── db/             # drizzle schema + connection (menu_items mẫu)
├── lib/            # TODO: auth.ts, refreshAccessToken.ts, syncUserProfile.ts
├── types/          # next-auth type augmentation
├── .env.example
├── drizzle.config.ts
├── next.config.ts
└── tsconfig.json
```

## Việc cần làm để chạy được

1. `app/api/auth/[...nextauth]/route.ts` với Keycloak provider + refresh token (copy pattern từ `shop-pay/lib/refreshAccessToken.ts`).
2. `proxy.ts` / middleware guard role `buyer`, redirect `/denied` nếu thiếu.
3. Frontchannel logout endpoint + `SingleLogoutWatcher` (đồng bộ SLO toàn hệ).
4. Schema menu/đơn món hoàn chỉnh trong `db/schema.ts`.
5. Thêm `shop-food` vào script `dev`/`db:push` ở root `package.json`.
