# Seller Workspace

Back-office riêng cho người bán + nhân viên shop. Dùng chung Keycloak realm với app ecommerce, nhưng client OIDC riêng (`seller-workspace`).

## Khác gì với ecommerce

- ecommerce phục vụ **buyer** (mua hàng).
- Seller Workspace phục vụ **chủ shop + nhân viên** (kho / CSKH / kế toán).
- Cùng 1 user pool (Keycloak), khác role + khác client.

## Chạy local

```bash
cd seller-workspace
cp .env.example .env
npm install
npm run db:push   # tạo bảng staff_invitations, store_permissions, audit_logs
npm run dev       # http://localhost:3100
```

Yêu cầu Keycloak + Postgres đã chạy sẵn (`docker compose up` ở repo root).

## User mẫu để test

| Username     | Password | Role             | Group                       |
|--------------|----------|------------------|-----------------------------|
| seller1      | 123456   | seller           | -                           |
| warehouse1   | 123456   | staff-warehouse  | /store-demo-1/warehouse     |
| cs1          | 123456   | staff-cs         | /store-demo-1/cs            |
| finance1     | 123456   | staff-finance    | /store-demo-1/finance       |

## Cấu trúc

```
seller-workspace/
├── app/
│   ├── api/auth/[...nextauth]/route.ts   # OIDC config
│   ├── components/TopBar.tsx
│   ├── dashboard/page.tsx                # protected route
│   ├── layout.tsx
│   └── page.tsx
├── db/
│   ├── index.ts
│   └── schema.ts                         # staff_invitations, store_permissions, audit_logs
├── types/next-auth.d.ts
├── middleware.ts                         # bảo vệ /dashboard, /staff, /audit
└── package.json
```
