#!/usr/bin/env bash
# Pre-warm các route chính sau khi dev server lên, để user không phải đợi
# Turbopack compile 20-30s ở lần đầu navigate.
# Chạy ngầm song song với `npm run dev`.

# Đợi các app Ready (port mở). Bounded ~90s/port để không treo nếu app nào chưa
# cài deps / chưa chạy.
echo "[warmup] đợi các app ready..."
for port in 3000 3100 3200 3300 3400; do
  tries=0
  until nc -z localhost $port 2>/dev/null; do
    sleep 1; tries=$((tries + 1))
    if [ $tries -ge 90 ]; then echo "[warmup] port $port chưa lên sau 90s, bỏ qua"; break; fi
  done
done

sleep 3  # đợi thêm cho Next bind handler

ROUTES_3000=(/ /orders /cart /account /seller/register /api/auth/providers /api/auth/csrf /api/auth/session)
ROUTES_3100=(/ /denied /api/auth/providers /api/auth/csrf /api/auth/session)
ROUTES_3200=(/ /wallet /topup /kyc /api/auth/providers /api/auth/csrf /api/auth/session)
ROUTES_3300=(/ /cart /orders /admin /api/auth/providers /api/auth/csrf /api/auth/session)
ROUTES_3400=(/ /users /kyc /audit /denied /api/auth/providers /api/auth/csrf /api/auth/session)

echo "[warmup] đang compile các route chính..."
for r in "${ROUTES_3000[@]}"; do curl -s -o /dev/null -m 60 "http://localhost:3000$r" & done
for r in "${ROUTES_3100[@]}"; do curl -s -o /dev/null -m 60 "http://localhost:3100$r" & done
for r in "${ROUTES_3200[@]}"; do curl -s -o /dev/null -m 60 "http://localhost:3200$r" & done
for r in "${ROUTES_3300[@]}"; do curl -s -o /dev/null -m 60 "http://localhost:3300$r" & done
for r in "${ROUTES_3400[@]}"; do curl -s -o /dev/null -m 60 "http://localhost:3400$r" & done
wait

echo "[warmup] ✓ done — các route chính đã được compile, navigate sẽ nhanh"
