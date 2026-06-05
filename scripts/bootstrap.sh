#!/usr/bin/env bash
# 1-shot bootstrap: sinh secret + tạo root .env + app .env với giá trị khớp.
# Idempotent: nếu .env đã tồn tại thì skip tạo mới, nhưng vẫn bổ sung secret mới còn thiếu.
set -euo pipefail

cd "$(dirname "$0")/.."

gen() { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }

if [ -f .env ]; then
  echo "→ root .env đã tồn tại, skip tạo mới (xoá đi nếu muốn regen)."
else
  echo "→ sinh secret + tạo root .env..."
  POSTGRES_PASSWORD=$(gen)
  KEYCLOAK_ADMIN_PASSWORD=$(gen)
  NEXTJS_APP_CLIENT_SECRET=$(gen)
  SELLER_WORKSPACE_CLIENT_SECRET=$(gen)
  SHOPPAY_CLIENT_SECRET=$(gen)
  SHOPFOOD_CLIENT_SECRET=$(gen)
  ADMIN_PORTAL_CLIENT_SECRET=$(gen)
  BACKEND_ADMIN_CLIENT_SECRET=$(gen)
  MERCHANT_HMAC_SECRET=$(gen)
  CATALOG_SYNC_SECRET=$(gen)

  cat > .env <<EOF
POSTGRES_DB=keycloak
POSTGRES_USER=admin
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=$KEYCLOAK_ADMIN_PASSWORD

NEXTJS_APP_CLIENT_SECRET=$NEXTJS_APP_CLIENT_SECRET
SELLER_WORKSPACE_CLIENT_SECRET=$SELLER_WORKSPACE_CLIENT_SECRET
SHOPPAY_CLIENT_SECRET=$SHOPPAY_CLIENT_SECRET
SHOPFOOD_CLIENT_SECRET=$SHOPFOOD_CLIENT_SECRET
ADMIN_PORTAL_CLIENT_SECRET=$ADMIN_PORTAL_CLIENT_SECRET
BACKEND_ADMIN_CLIENT_SECRET=$BACKEND_ADMIN_CLIENT_SECRET

SMTP_PASSWORD=changeme-not-used-yet
MERCHANT_HMAC_SECRET=$MERCHANT_HMAC_SECRET
CATALOG_SYNC_SECRET=$CATALOG_SYNC_SECRET

# Google IdP — để "disabled" cho đến khi đăng ký Google OAuth client
GOOGLE_IDP_CLIENT_ID=disabled
GOOGLE_IDP_CLIENT_SECRET=disabled
EOF
  echo "  ✓ root .env"
fi

# Bổ sung secret mới còn thiếu cho .env đã tồn tại từ trước (idempotent).
ensure_var() {
  local key="$1"
  if ! grep -q "^$key=" .env; then
    echo "$key=$(gen)" >> .env
    echo "  + bổ sung $key vào .env"
  fi
}
ensure_var SHOPFOOD_CLIENT_SECRET
ensure_var ADMIN_PORTAL_CLIENT_SECRET
ensure_var CATALOG_SYNC_SECRET

# Đọc lại các giá trị từ root .env (kể cả khi vừa tạo hoặc đã có sẵn)
set -a
source .env
set +a

write_app_env() {
  local app="$1" port="$2" db="$3" client_secret="$4" client_id="$5"
  local target="$app/.env"
  if [ -f "$target" ]; then
    echo "→ $target đã tồn tại, skip."
    return
  fi
  local nextauth_secret
  nextauth_secret=$(gen)
  cat > "$target" <<EOF
DATABASE_URL=postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$db

NEXTAUTH_URL=http://localhost:$port
NEXTAUTH_SECRET=$nextauth_secret

KEYCLOAK_ISSUER=http://localhost:8080/realms/ecommerce-realm
KEYCLOAK_CLIENT_ID=$client_id
KEYCLOAK_CLIENT_SECRET=$client_secret
EOF
  echo "  ✓ $target"
}

write_app_env shop-ecommerce 3000 ecommerce        "$NEXTJS_APP_CLIENT_SECRET"       nextjs-app
write_app_env shop-sell      3100 seller_workspace "$SELLER_WORKSPACE_CLIENT_SECRET" seller-workspace
write_app_env shop-pay       3200 shoppay          "$SHOPPAY_CLIENT_SECRET"          shoppay-app
write_app_env shop-food      3300 shopfood         "$SHOPFOOD_CLIENT_SECRET"         shopfood-app

# shop-ecommerce cần thêm MERCHANT_HMAC_SECRET + SHOPPAY_BASE_URL cho cross-app payment
if ! grep -q '^MERCHANT_HMAC_SECRET=' shop-ecommerce/.env 2>/dev/null; then
  cat >> shop-ecommerce/.env <<EOF

MERCHANT_HMAC_SECRET=$MERCHANT_HMAC_SECRET
SHOPPAY_BASE_URL=http://localhost:3200
EOF
fi
if ! grep -q '^MERCHANT_HMAC_SECRET=' shop-pay/.env 2>/dev/null; then
  echo "" >> shop-pay/.env
  echo "MERCHANT_HMAC_SECRET=$MERCHANT_HMAC_SECRET" >> shop-pay/.env
fi
if ! grep -q '^KEYCLOAK_ADMIN_CLIENT_ID=' shop-pay/.env 2>/dev/null; then
  cat >> shop-pay/.env <<EOF
KEYCLOAK_ADMIN_CLIENT_ID=backend-admin-client
KEYCLOAK_ADMIN_CLIENT_SECRET=$BACKEND_ADMIN_CLIENT_SECRET
EOF
fi

# Catalog sync (Phase 1): CATALOG_SYNC_SECRET phải khớp ở cả shop-sell và shop-ecommerce.
# shop-sell còn cần URL nội bộ của ShopEcommerce để gọi /api/internal/catalog/*.
if ! grep -q '^CATALOG_SYNC_SECRET=' shop-sell/.env 2>/dev/null; then
  cat >> shop-sell/.env <<EOF

CATALOG_SYNC_SECRET=$CATALOG_SYNC_SECRET
SHOP_ECOMMERCE_INTERNAL_URL=http://localhost:3000
EOF
fi
if ! grep -q '^CATALOG_SYNC_SECRET=' shop-ecommerce/.env 2>/dev/null; then
  echo "" >> shop-ecommerce/.env
  echo "CATALOG_SYNC_SECRET=$CATALOG_SYNC_SECRET" >> shop-ecommerce/.env
fi

# admin-portal .env — thao tác user/role qua Keycloak Admin API; DB riêng admin_portal chỉ để ghi audit.
if [ ! -f admin-portal/.env ]; then
  ADMIN_PORTAL_NEXTAUTH_SECRET=$(gen)
  cat > admin-portal/.env <<EOF
DATABASE_URL=postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/admin_portal
ECOMMERCE_DATABASE_URL=postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/ecommerce
SHOPFOOD_DATABASE_URL=postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/shopfood

NEXTAUTH_URL=http://localhost:3400
NEXTAUTH_SECRET=$ADMIN_PORTAL_NEXTAUTH_SECRET

KEYCLOAK_ISSUER=http://localhost:8080/realms/ecommerce-realm
KEYCLOAK_CLIENT_ID=admin-portal
KEYCLOAK_CLIENT_SECRET=$ADMIN_PORTAL_CLIENT_SECRET

KEYCLOAK_ADMIN_CLIENT_ID=backend-admin-client
KEYCLOAK_ADMIN_CLIENT_SECRET=$BACKEND_ADMIN_CLIENT_SECRET
EOF
  echo "  ✓ admin-portal/.env"
fi
if ! grep -q '^ECOMMERCE_DATABASE_URL=' admin-portal/.env 2>/dev/null; then
  sed -i "/^DATABASE_URL=/a ECOMMERCE_DATABASE_URL=postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/ecommerce\\nSHOPFOOD_DATABASE_URL=postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/shopfood" admin-portal/.env
fi

echo
echo "✓ Bootstrap done. Tiếp theo:"
echo "    bash scripts/reset.sh   # up infra + push DB schema"
echo "    npm install && npm run dev"
