#!/usr/bin/env bash
# Wipe Postgres volume → up lại Keycloak với secret mới từ .env → tạo DB → push schema.
# Chạy 1 phát từ root repo:  bash scripts/reset.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Auto-prefix sudo nếu user chưa ở group docker
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then DOCKER="sudo docker"; fi

echo "→ backup DB hiện tại..."
$DOCKER ps -qf "name=postgres" | head -1 | xargs -I{} $DOCKER exec -t {} \
  pg_dumpall -U admin > "backup-$(date +%Y%m%d-%H%M).sql" 2>/dev/null || echo "  (không có container cũ, skip)"

echo "→ wipe + up..."
$DOCKER compose down
$DOCKER volume rm ecommerce-platform_postgres_data 2>/dev/null || true
$DOCKER compose up -d

echo "→ đợi Keycloak ready..."
until curl -sf http://localhost:8080/realms/ecommerce-realm/.well-known/openid-configuration >/dev/null; do
  sleep 2
done

echo "→ tạo 3 DB app..."
PG=$($DOCKER ps -qf "name=postgres")
$DOCKER exec -i "$PG" psql -U admin -d postgres \
  -c "CREATE DATABASE ecommerce;" \
  -c "CREATE DATABASE seller_workspace;" \
  -c "CREATE DATABASE shoppay;"

echo "→ push schema..."
(cd web-app          && npx drizzle-kit push && cd ..)
(cd seller-workspace && npm run db:push && cd ..)
(cd shoppay          && npm run db:push && cd ..)

echo "✓ Done. Login http://localhost:3000 / 3100 / 3200"