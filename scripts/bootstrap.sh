#!/usr/bin/env bash
# 1-shot bootstrap: sinh secret + tạo root .env + 3 app .env với giá trị khớp.
# Idempotent: nếu .env đã tồn tại thì skip (không ghi đè).
set -euo pipefail

cd "$(dirname "$0")/.."

gen() { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }

if [ -f .env ]; then
  echo "→ root .env đã tồn tại, skip (xoá đi nếu muốn regen)."
else
  echo "→ sinh secret + tạo root .env..."
  POSTGRES_PASSWORD=$(gen)
  KEYCLOAK_ADMIN_PASSWORD=$(gen)
  NEXTJS_APP_CLIENT_SECRET=$(gen)
  SELLER_WORKSPACE_CLIENT_SECRET=$(gen)
  SHOPPAY_CLIENT_SECRET=$(gen)
  BACKEND_ADMIN_CLIENT_SECRET=$(gen)
  MERCHANT_HMAC_SECRET=$(gen)

  cat > .env <<EOF
POSTGRES_DB=keycloak
POSTGRES_USER=admin
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=$KEYCLOAK_ADMIN_PASSWORD

NEXTJS_APP_CLIENT_SECRET=$NEXTJS_APP_CLIENT_SECRET
SELLER_WORKSPACE_CLIENT_SECRET=$SELLER_WORKSPACE_CLIENT_SECRET
SHOPPAY_CLIENT_SECRET=$SHOPPAY_CLIENT_SECRET
BACKEND_ADMIN_CLIENT_SECRET=$BACKEND_ADMIN_CLIENT_SECRET

SMTP_PASSWORD=changeme-not-used-yet
MERCHANT_HMAC_SECRET=$MERCHANT_HMAC_SECRET

# Google IdP — để "disabled" cho đến khi đăng ký Google OAuth client
GOOGLE_IDP_CLIENT_ID=disabled
GOOGLE_IDP_CLIENT_SECRET=disabled
EOF
  echo "  ✓ root .env"
fi

# Đọc lại các giá trị từ root .env (kể cả khi vừa tạo hoặc đã có sẵn)
set -a
source .env
set +a

write_app_env() {
  local app="$1" port="$2" db="$3" client_secret="$4"
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
KEYCLOAK_CLIENT_ID=$5
KEYCLOAK_CLIENT_SECRET=$client_secret
EOF
  echo "  ✓ $target"
}

write_app_env web-app          3000 ecommerce        "$NEXTJS_APP_CLIENT_SECRET"      nextjs-app
write_app_env seller-workspace 3100 seller_workspace "$SELLER_WORKSPACE_CLIENT_SECRET" seller-workspace
write_app_env shoppay          3200 shoppay          "$SHOPPAY_CLIENT_SECRET"          shoppay-app

# web-app cần thêm MERCHANT_HMAC_SECRET + SHOPPAY_BASE_URL cho cross-app payment
if ! grep -q '^MERCHANT_HMAC_SECRET=' web-app/.env 2>/dev/null; then
  cat >> web-app/.env <<EOF

MERCHANT_HMAC_SECRET=$MERCHANT_HMAC_SECRET
SHOPPAY_BASE_URL=http://localhost:3200
EOF
fi
if ! grep -q '^MERCHANT_HMAC_SECRET=' shoppay/.env 2>/dev/null; then
  echo "" >> shoppay/.env
  echo "MERCHANT_HMAC_SECRET=$MERCHANT_HMAC_SECRET" >> shoppay/.env
fi

echo
echo "✓ Bootstrap done. Tiếp theo:"
echo "    bash scripts/reset.sh   # up infra + push DB schema"
echo "    npm install && npm run dev"
