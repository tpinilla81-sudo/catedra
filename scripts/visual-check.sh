#!/bin/bash
# Verificación visual: Pizarra global + detalle en 3 sub-pestañas (desktop y móvil)
set -e
cd /home/z/my-project
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/metodo" DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5432/metodo"

ss -ltn | rg -q 5432 || { node scripts/dev-postgres.mjs > /tmp/pg.log 2>&1 & sleep 6; }
ss -ltn | rg -q ":3000 " || { npx next dev -p 3000 > /tmp/next-dev.log 2>&1 & sleep 6; }
for i in $(seq 1 30); do curl -sf -o /dev/null --max-time 3 http://localhost:3000/api/auth/csrf && break; sleep 2; done

mkdir -p /tmp/shots
agent-browser close >/dev/null 2>&1 || true

# ---------- login ----------
agent-browser set viewport 1440 900
agent-browser open http://localhost:3000
sleep 3
agent-browser snapshot -i -c | head -20
