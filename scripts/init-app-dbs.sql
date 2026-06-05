-- Postgres tự chạy file này lúc init container lần đầu (volume rỗng).
-- DB `ecommerce` đã được tạo sẵn qua POSTGRES_DB.
-- Hiện ShopEcommerce dùng `ecommerce`, ShopSell dùng `seller_workspace`
-- (kiến trúc mục tiêu là DB dùng chung — xem TODO.md). ShopFood/ShopPay độc lập.
-- Admin Portal (Phase 3) thao tác user/role qua Keycloak Admin API nhưng giữ
-- một DB riêng `admin_portal` chỉ để ghi audit log thao tác quản trị.
CREATE DATABASE seller_workspace;
CREATE DATABASE shoppay;
CREATE DATABASE shopfood;
CREATE DATABASE admin_portal;
