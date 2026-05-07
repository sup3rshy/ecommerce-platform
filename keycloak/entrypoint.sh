#!/bin/bash
# Resolve ${VAR} placeholders trong realm template thành giá trị env vars,
# rồi gọi entrypoint gốc của Keycloak.
#
# Tại sao cần script này: Keycloak Quarkus distribution KHÔNG luôn luôn
# substitute ${VAR} trong realm import JSON một cách đáng tin cậy. Tự sed thay
# trước khi Keycloak parse là cách bulletproof.

set -euo pipefail

TEMPLATE=/opt/keycloak/data/import-template/realm.json
TARGET=/opt/keycloak/data/import/realm.json

if [ -f "$TEMPLATE" ]; then
  echo "[entrypoint] Resolving placeholders in realm template..."
  mkdir -p "$(dirname "$TARGET")"
  cp "$TEMPLATE" "$TARGET"

  for var in \
    NEXTJS_APP_CLIENT_SECRET \
    SELLER_WORKSPACE_CLIENT_SECRET \
    SHOPPAY_CLIENT_SECRET \
    BACKEND_ADMIN_CLIENT_SECRET \
    SMTP_PASSWORD \
    GOOGLE_IDP_CLIENT_ID \
    GOOGLE_IDP_CLIENT_SECRET; do
    val="${!var:-}"
    if [ -z "$val" ]; then
      echo "[entrypoint] ERROR: env var $var is not set" >&2
      exit 1
    fi
    # Dùng | làm delimiter để tránh xung đột với /
    sed -i "s|\${$var}|$val|g" "$TARGET"
  done

  # Sanity: không còn ${...} nào trong file
  if grep -qE '\$\{[A-Z_]+\}' "$TARGET"; then
    echo "[entrypoint] ERROR: unresolved placeholder(s) remain in realm.json:" >&2
    grep -nE '\$\{[A-Z_]+\}' "$TARGET" >&2
    exit 1
  fi
  echo "[entrypoint] Realm template resolved -> $TARGET"
fi

exec /opt/keycloak/bin/kc.sh "$@"
