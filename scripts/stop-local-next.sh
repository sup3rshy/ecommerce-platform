#!/usr/bin/env bash
# Stop the root `npm run dev` / Next.js dev processes that bind ports 3000-3400
# directly in WSL. Docker app services need those same ports.
set -euo pipefail

cd "$(dirname "$0")/.."

patterns=(
  "concurrently -n web,seller,pay,food,admin"
  "npm --prefix shop-ecommerce run dev"
  "npm --prefix shop-sell run dev"
  "npm --prefix shop-pay run dev"
  "npm --prefix shop-food run dev"
  "npm --prefix admin-portal run dev"
  "shop-ecommerce/node_modules/.bin/next dev"
  "shop-sell/node_modules/.bin/next dev"
  "shop-pay/node_modules/.bin/next dev"
  "shop-food/node_modules/.bin/next dev"
  "admin-portal/node_modules/.bin/next dev"
)

pids=()
for pattern in "${patterns[@]}"; do
  while IFS= read -r pid; do
    [ -n "$pid" ] && pids+=("$pid")
  done < <(pgrep -f "$pattern" || true)
done

if [ "${#pids[@]}" -eq 0 ]; then
  echo "[stop-local-next] no local Next dev processes found"
  exit 0
fi

mapfile -t unique_pids < <(printf "%s\n" "${pids[@]}" | sort -n -u)
echo "[stop-local-next] stopping local Next dev processes: ${unique_pids[*]}"
kill "${unique_pids[@]}" 2>/dev/null || true
sleep 2

for pid in "${unique_pids[@]}"; do
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
done

echo "[stop-local-next] done"
