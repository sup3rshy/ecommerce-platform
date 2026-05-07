-- Postgres tự chạy file này lúc init container lần đầu (volume rỗng).
-- Tạo 3 DB cho 3 app. DB `ecommerce` đã được tạo sẵn qua POSTGRES_DB.
CREATE DATABASE seller_workspace;
CREATE DATABASE shoppay;
