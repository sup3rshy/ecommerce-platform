#!/bin/bash
# Resolve ${VAR} placeholders trong tất cả realm template, copy vào import dir,
# rồi gọi entrypoint gốc của Keycloak.
#
# Vì sao cần: Keycloak Quarkus không luôn substitute ${VAR} đáng tin cậy. Tự sed
# thay là cách bulletproof. Đồng thời script này hỗ trợ MULTIPLE realm files —
# Keycloak `--import-realm` import mọi *.json trong /opt/keycloak/data/import/.

set -euo pipefail

TEMPLATE_DIR=/opt/keycloak/data/import-template
TARGET_DIR=/opt/keycloak/data/import

VARS_TO_RESOLVE=(
  NEXTJS_APP_CLIENT_SECRET
  SELLER_WORKSPACE_CLIENT_SECRET
  SHOPPAY_CLIENT_SECRET
  SHOPFOOD_CLIENT_SECRET
  ADMIN_PORTAL_CLIENT_SECRET
  BACKEND_ADMIN_CLIENT_SECRET
  SMTP_PASSWORD
  GOOGLE_IDP_CLIENT_ID
  GOOGLE_IDP_CLIENT_SECRET
)

if [ -d "$TEMPLATE_DIR" ]; then
  mkdir -p "$TARGET_DIR"

  for tpl in "$TEMPLATE_DIR"/*.json; do
    [ -f "$tpl" ] || continue
    base=$(basename "$tpl")
    target="$TARGET_DIR/$base"
    echo "[entrypoint] Processing $base..."
    cp "$tpl" "$target"

    for var in "${VARS_TO_RESOLVE[@]}"; do
      val="${!var:-}"
      # Chỉ resolve nếu file có chứa placeholder này (tránh fail unrelated realm)
      if grep -q "\${$var}" "$target" 2>/dev/null; then
        if [ -z "$val" ]; then
          echo "[entrypoint] ERROR: $base references \${$var} but env var is unset" >&2
          exit 1
        fi
        sed -i "s|\${$var}|$val|g" "$target"
      fi
    done

    # Sanity check
    if grep -qE '\$\{[A-Z_]+\}' "$target"; then
      echo "[entrypoint] ERROR: unresolved placeholder(s) in $base:" >&2
      grep -nE '\$\{[A-Z_]+\}' "$target" >&2
      exit 1
    fi
    echo "[entrypoint] ✓ $base resolved"
  done
fi

exec /opt/keycloak/bin/kc.sh "$@"
