# Ecommerce Platform

Nền tảng thương mại điện tử đa vai trò (buyer / seller / admin) xây dựng với Next.js, Keycloak và PostgreSQL.

## Kiến trúc tổng quan

```
Browser
  │
  ▼
Nginx (port 8000)          ← Reverse proxy
  ├── /auth/*  → Keycloak (port 8080)   ← Identity Provider
  └── /*       → Next.js  (port 3000)   ← Monolithic App
                    │
                    ▼
              PostgreSQL (port 5432)     ← App Database
```

| Thành phần | Mô tả |
|------------|--------|
| **Next.js 16** | App Router, Server Actions, Tailwind CSS v4 |
| **Keycloak** | Quản lý user, role (buyer/seller/admin), OAuth2/OpenID Connect |
| **PostgreSQL** | Lưu stores, products, orders, cart, seller requests |
| **Nginx** | Reverse proxy, gom Keycloak + Next.js chung 1 origin |
| **NextAuth v4** | Tích hợp Keycloak vào Next.js |
| **Drizzle ORM** | Type-safe query builder cho PostgreSQL |

## Yêu cầu

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (đang chạy)
- [Node.js](https://nodejs.org/) >= 18
- npm (đi kèm Node.js)

## Hướng dẫn chạy

### 1. Khởi động Infrastructure

```bash
# Tại thư mục gốc của project
docker compose up -d
```

Lệnh này khởi động 3 container:

| Container | Port | Chức năng |
|-----------|------|-----------|
| PostgreSQL | 5432 | Database |
| Keycloak | 8080 | Identity Provider |
| Nginx | 8000 | Reverse Proxy |

Chờ **~30-60 giây** để Keycloak import realm xong. Kiểm tra bằng cách truy cập http://localhost:8080 (đăng nhập admin console: `admin` / `admin`).

### 2. Tạo database riêng cho app

PostgreSQL mặc định chỉ có database `keycloak`. Cần tạo database `ecommerce` riêng cho app:

```bash
docker exec -it ecommerce-platform-postgres-1 psql -U admin -d keycloak -c "CREATE DATABASE ecommerce;"
```

> Nếu tên container khác, chạy `docker ps` để xem tên chính xác.

### 3. Tạo file environment

```bash
cd web-app
cp .env.example .env.local
```

Hoặc tạo file `web-app/.env.local` thủ công với nội dung:

```env
# Database
DATABASE_URL=postgresql://admin:password@localhost:5432/ecommerce

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=my-super-secret-key-change-in-production

# Keycloak
KEYCLOAK_ISSUER=http://localhost:8080/realms/ecommerce-realm
KEYCLOAK_CLIENT_ID=nextjs-app
KEYCLOAK_CLIENT_SECRET=changeme-generate-random-secret
```

### 4. Cài dependencies và tạo bảng trong database

```bash
cd web-app
npm install

# Push schema từ code vào PostgreSQL (tạo bảng stores, products, orders, ...)
DATABASE_URL=postgresql://admin:password@localhost:5432/ecommerce npx drizzle-kit push
```

> `drizzle-kit` không tự đọc `.env.local`, nên cần truyền `DATABASE_URL` trực tiếp.
> Chỉ cần chạy **1 lần** khi setup. Nếu sau này sửa `db/schema.ts`, chạy lại để cập nhật.

### 5. Chạy ứng dụng

```bash
npm run dev
```

### 6. Truy cập

| URL | Mô tả |
|-----|-------|
| http://localhost:3000 | Next.js (trực tiếp) |
| http://localhost:8000 | Qua Nginx gateway |
| http://localhost:8080 | Keycloak Admin Console |

## Tài khoản test

Các tài khoản sau đã được tạo sẵn trong Keycloak realm:

| Username | Password | Role | Mô tả |
|----------|----------|------|-------|
| `buyer1` | `Buyer1@2024` | buyer | Người mua hàng |
| `seller1` | `Seller1@2024` | seller | Người bán hàng |
| `admin1` | `Admin1@2024` | admin | Quản trị viên |

## Cấu trúc thư mục

```
ecommerce-platform/
├── docker compose.yml          # Định nghĩa PostgreSQL + Keycloak + Nginx
├── keycloak/
│   └── ecommerce-realm.json    # Cấu hình realm, roles, users mặc định
├── nginx/
│   └── nginx.conf              # Reverse proxy config
└── web-app/                    # Next.js application
    ├── app/
    │   ├── page.tsx            # Trang chủ - danh sách sản phẩm
    │   ├── cart/               # Giỏ hàng
    │   ├── orders/             # Lịch sử đơn hàng
    │   ├── product/[id]/       # Chi tiết sản phẩm
    │   ├── seller/             # Dashboard seller + đăng ký bán hàng
    │   ├── admin/              # Dashboard admin (users, stores)
    │   ├── api/                # API routes
    │   │   ├── auth/           # NextAuth + Keycloak
    │   │   ├── cart/           # CRUD giỏ hàng + checkout
    │   │   ├── orders/         # Cập nhật trạng thái đơn hàng
    │   │   ├── seller/         # Đăng ký seller
    │   │   ├── admin/          # Duyệt yêu cầu seller
    │   │   └── mock-payment/   # Thanh toán giả lập
    │   └── components/         # React components
    ├── db/
    │   ├── schema.ts           # Drizzle ORM schema (bảng DB)
    │   └── index.ts            # Database connection
    ├── lib/
    │   └── keycloak-admin.ts   # Keycloak Admin API client
    ├── proxy.ts                # NextAuth middleware (RBAC)
    └── types/
        └── next-auth.d.ts      # TypeScript type augmentation
```

## Database Schema

```
stores                    products                 orders
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ id (PK)      │────┐    │ id (PK)      │────┐    │ id (PK)      │
│ owner_id     │    └───→│ store_id (FK)│    └───→│ product_id   │
│ name         │         │ name         │         │ user_id      │
│ created_at   │         │ price        │         │ quantity     │
└──────────────┘         │ stock        │         │ unit_price   │
                         │ description  │         │ status       │
                         │ image_url    │         │ created_at   │
                         │ created_at   │         └──────────────┘
                         └──────────────┘

cart_items                     seller_upgrade_requests
┌──────────────────┐          ┌──────────────────┐
│ id (PK)          │          │ id (PK)          │
│ user_id          │          │ user_id          │
│ product_id (FK)  │          │ store_name       │
│ quantity         │          │ status           │
│ created_at       │          │ reviewed_by      │
└──────────────────┘          │ admin_note       │
                              │ requested_at     │
                              │ reviewed_at      │
                              └──────────────────┘
```

## Luồng nghiệp vụ chính

### Flow A: Đăng nhập / Đăng ký
1. User truy cập app → Click "Đăng nhập với Keycloak"
2. Redirect tới Keycloak login page
3. Đăng nhập thành công → Keycloak trả JWT về app
4. NextAuth lưu session với roles từ JWT

### Flow B: Buyer đăng ký bán hàng
1. Buyer vào trang "Đăng ký bán hàng" → Nhập tên gian hàng
2. Tạo `seller_upgrade_request` (status: pending)
3. Admin vào trang quản trị → Duyệt yêu cầu
4. Hệ thống assign role `seller` trên Keycloak + tạo store trong DB
5. Buyer đăng nhập lại để nhận role mới

### Flow C: Mua hàng
1. Buyer thêm sản phẩm vào giỏ / mua trực tiếp
2. Checkout → Tạo order (status: pending)
3. Seller cập nhật trạng thái: pending → shipping → completed
