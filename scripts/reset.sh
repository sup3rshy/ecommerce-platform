#!/usr/bin/env bash
# Wipe Postgres volumes → up lại với secret mới từ .env → push schema.
# Chạy 1 phát từ root repo:  bash scripts/reset.sh
set -euo pipefail

cd "$(dirname "$0")/.."

DOCKER="docker"
if ! docker info >/dev/null 2>&1; then DOCKER="sudo docker"; fi

echo "→ backup DB app hiện tại (nếu có)..."
APP_PG=$($DOCKER ps -qf "name=postgres-app" 2>/dev/null | head -1 || true)
if [ -n "$APP_PG" ]; then
  $DOCKER exec -t "$APP_PG" pg_dumpall -U admin > "backup-app-$(date +%Y%m%d-%H%M).sql" || echo "  (skip)"
else
  echo "  (không có container cũ, skip)"
fi

echo "→ wipe + up..."
$DOCKER compose down
$DOCKER volume rm ecommerce-platform_postgres_keycloak_data 2>/dev/null || true
$DOCKER volume rm ecommerce-platform_postgres_app_data      2>/dev/null || true
# Volume cũ từ thời chưa tách Postgres
$DOCKER volume rm ecommerce-platform_postgres_data          2>/dev/null || true
$DOCKER compose up -d

echo "→ đợi Keycloak ready..."
until curl -sf http://localhost:8080/realms/ecommerce-realm/.well-known/openid-configuration >/dev/null; do
  sleep 2
done

echo "→ verify DB app đã được Postgres init tự tạo..."
APP_PG=$($DOCKER ps -qf "name=postgres-app" | head -1)
$DOCKER exec -i "$APP_PG" psql -U admin -d postgres -c "\l" | grep -E '^ (ecommerce|seller_workspace|shoppay|shopfood|admin_portal)' \
  || { echo "✗ DB app chưa được tạo, check init-app-dbs.sql"; exit 1; }

echo "→ push schema (5 app đã triển khai)..."
(cd shop-ecommerce && npx drizzle-kit push)
(cd shop-sell      && npm run db:push)
(cd shop-pay       && npm run db:push)
# shop-food cần deps trước khi push (Phase 2). Bỏ qua nếu chưa cài để không abort reset.
if [ -d shop-food/node_modules ]; then
  (cd shop-food && npm run db:push)
else
  echo "  (shop-food chưa cài deps — bỏ qua push. Chạy: cd shop-food && npm install && npm run db:push && npm run db:seed)"
fi
# admin-portal (Phase 3) — DB riêng admin_portal chỉ cho audit log.
if [ -d admin-portal/node_modules ]; then
  (cd admin-portal && npm run db:push)
else
  echo "  (admin-portal chưa cài deps — bỏ qua push. Chạy: cd admin-portal && npm install && npm run db:push)"
fi

# Phase 1: catalog do ShopSell quản lý (source of truth). ShopEcommerce chỉ là
# bản sao đọc, được đồng bộ qua /api/internal/catalog/*. Không seed catalog trực
# tiếp vào ShopEcommerce nữa — storefront trống cho tới khi seller thêm sản phẩm.
echo
echo "✓ Done. Tiếp theo:"
echo "    npm run dev          # chạy trực tiếp trong WSL"
echo "    npm run dev:docker   # khuyến nghị khi truy cập từ Windows host / Win10 VM"
echo
echo "  Để có catalog mẫu (chọn 1):"
echo "    A. Login seller1 ở http://localhost:3100 -> vào /products -> thêm sản phẩm (tự đồng bộ sang :3000)."
echo "    B. Login seller1 1 lần ở :3100 (để sync user_profile), rồi chạy:"
echo "         npm --prefix shop-sell run db:seed          # seed catalog mẫu cho seller1"
echo "         npm --prefix shop-sell run catalog:backfill # đẩy sang storefront :3000 (cần :3000 đang chạy)"
echo
echo "  Thực đơn mẫu ShopFood: npm --prefix shop-food run db:seed"
echo
echo "  URL: http://localhost:3000 (storefront) | :3100 (ShopSell) | :3200 (ShopPay) | :3300 (ShopFood)"
