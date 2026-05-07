#!/usr/bin/env bash
# Pre-warm các route chính sau khi dev server lên, để user không phải đợi
# Turbopack compile 20-30s ở lần đầu navigate.
# Chạy ngầm song song với `npm run dev`.

# Đợi 3 app Ready (port mở)
echo "[warmup] đợi 3 app ready..."
for port in 3000 3100 3200; do
  until nc -z localhost $port 2>/dev/null; do sleep 1; done
done

sleep 3  # đợi thêm cho Next bind handler

ROUTES_3000=(/ /orders /cart /account /seller/register /api/auth/providers /api/auth/csrf /api/auth/session)
ROUTES_3100=(/ /denied /api/auth/providers /api/auth/csrf /api/auth/session)
ROUTES_3200=(/ /wallet /topup /kyc /api/auth/providers /api/auth/csrf /api/auth/session)

echo "[warmup] đang compile các route chính..."
for r in "${ROUTES_3000[@]}"; do curl -s -o /dev/null -m 60 "http://localhost:3000$r" & done
for r in "${ROUTES_3100[@]}"; do curl -s -o /dev/null -m 60 "http://localhost:3100$r" & done
for r in "${ROUTES_3200[@]}"; do curl -s -o /dev/null -m 60 "http://localhost:3200$r" & done
wait

echo "[warmup] ✓ done — các route chính đã được compile, navigate sẽ nhanh"
