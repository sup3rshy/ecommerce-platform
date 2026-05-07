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

echo "→ verify 3 DB app đã được Postgres init tự tạo..."
APP_PG=$($DOCKER ps -qf "name=postgres-app" | head -1)
$DOCKER exec -i "$APP_PG" psql -U admin -d postgres -c "\l" | grep -E '^ (ecommerce|seller_workspace|shoppay)' \
  || { echo "✗ DB app chưa được tạo, check init-app-dbs.sql"; exit 1; }

echo "→ push schema..."
(cd web-app          && npx drizzle-kit push)
(cd seller-workspace && npm run db:push)
(cd shoppay          && npm run db:push)

echo "✓ Done. Login http://localhost:3000 / 3100 / 3200"
