#!/usr/bin/env bash
# Seed 2 demo user vào FreeIPA. Chạy SAU KHI freeipa container provision xong
# (~5-10 phút sau `docker compose --profile domain up -d freeipa`).
#
# Verify FreeIPA ready: `docker compose logs freeipa | grep "FreeIPA server configured"`

set -euo pipefail

DOCKER="docker"
if ! docker info >/dev/null 2>&1; then DOCKER="sudo docker"; fi

IPA="$DOCKER exec freeipa-1 ipa"
ADMIN_PW="Admin@2024"

echo "→ kinit admin..."
$DOCKER exec freeipa-1 bash -c "echo '$ADMIN_PW' | kinit admin"

echo "→ tạo user employee1..."
$IPA user-add employee1 \
  --first=Employee --last=One \
  --email=employee1@example.test \
  --password <<EOF || true
Emp@2024
Emp@2024
EOF

echo "→ tạo user employee2..."
$IPA user-add employee2 \
  --first=Employee --last=Two \
  --email=employee2@example.test \
  --password <<EOF || true
Emp@2024
Emp@2024
EOF

echo "✓ Done. Test:"
echo "    docker compose exec freeipa-1 kinit employee1   # nhập Emp@2024"
echo "    → Kerberos ticket được cấp"
echo
echo "Tiếp theo: wire LDAP federation trong Keycloak Admin Console (xem README)."
