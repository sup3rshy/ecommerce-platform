#!/usr/bin/env bash
# Switch app .env files from localhost to a LAN hostname usable by a domain-joined
# Windows VM. This is required for Kerberos/SPNEGO because localhost means
# "this machine", not the WSL/host machine, when opened from Win10.
set -euo pipefail

cd "$(dirname "$0")/.."

HOSTNAME="${1:-app.ecommerce.local}"
KEYCLOAK_PORT="${KEYCLOAK_PORT:-8080}"
SCHEME="${SCHEME:-http}"
ISSUER="$SCHEME://$HOSTNAME:$KEYCLOAK_PORT/realms/ecommerce-realm"

set_var() {
  local file="$1" key="$2" value="$3"
  [ -f "$file" ] || return 0

  if grep -q "^$key=" "$file"; then
    sed -i "s|^$key=.*|$key=$value|" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

switch_app() {
  local app="$1" port="$2"
  local env_file="$app/.env"
  [ -f "$env_file" ] || return 0

  set_var "$env_file" NEXTAUTH_URL "$SCHEME://$HOSTNAME:$port"
  set_var "$env_file" KEYCLOAK_ISSUER "$ISSUER"
  set_var "$env_file" NEXT_PUBLIC_KEYCLOAK_ISSUER "$ISSUER"
  echo "  ✓ $env_file -> $SCHEME://$HOSTNAME:$port"
}

switch_app shop-ecommerce 3000
switch_app shop-sell 3100
switch_app shop-pay 3200
switch_app shop-food 3300
switch_app admin-portal 3400

set_var shop-ecommerce/.env SHOPPAY_BASE_URL "$SCHEME://$HOSTNAME:3200"
set_var shop-pay/.env SHOP_ECOMMERCE_PUBLIC_URL "$SCHEME://$HOSTNAME:3000"
set_var shop-pay/.env SHOP_SELL_PUBLIC_URL "$SCHEME://$HOSTNAME:3100"

echo
echo "Done. Restart npm run dev after changing env files."
echo "Use these browser URLs from the Windows 10 VM and from the host:"
echo "  Admin Portal: $SCHEME://$HOSTNAME:3400"
echo "  Keycloak:     $SCHEME://$HOSTNAME:$KEYCLOAK_PORT"
