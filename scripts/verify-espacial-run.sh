#!/usr/bin/env bash
# ============================================================================
# Verificación E2E completa de la pizarra espacial — TODO EN UNA LLAMADA
# (el sandbox mata procesos background entre llamadas: PG → migrate → seed →
#  dev server → login → tests API → tests UI táctiles → cleanup)
# ============================================================================
cd /home/z/my-project
set +e
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"
export DIRECT_URL="postgresql://postgres:postgres@localhost:5432/metodo"
export NEXTAUTH_SECRET="cambia-esto-en-produccion"
export NEXTAUTH_URL="http://localhost:3000"
R=/tmp/espacial-results.txt
: > "$R"

say() { echo "== $1" | tee -a "$R"; }

# ---------- 1. PostgreSQL embebido ----------
say "[1] PostgreSQL"
node scripts/dev-postgres.mjs > /tmp/pg-espacial.log 2>&1 &
for i in $(seq 1 40); do
  node -e "const n=require('net');const s=n.connect(5432,'localhost',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(1000,()=>{s.destroy();process.exit(1)})" && break
  sleep 1
done
node -e "const n=require('net');const s=n.connect(5432,'localhost',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(1000,()=>{s.destroy();process.exit(1)})" \
  && say "  PG listo en :5432" || { say "  💥 PG NO ARRANCÓ"; cat /tmp/pg-espacial.log >> "$R"; exit 1; }

# ---------- 2. Migraciones (incluye la nueva: vector end) + seed ----------
say "[2] prisma migrate deploy"
bunx prisma migrate deploy > /tmp/mig-espacial.log 2>&1 && say "  OK" || { say "  💥 FALLO"; tail -15 /tmp/mig-espacial.log >> "$R"; exit 1; }
say "[3] seed"
bun prisma/seed.ts > /tmp/seed-espacial.log 2>&1 && say "  OK" || { say "  💥 FALLO"; tail -10 /tmp/seed-espacial.log >> "$R"; exit 1; }

# ---------- 4. ids reales ----------
say "[4] ids de prueba"
bun scripts/p3-test-ids.ts > /tmp/p3-ids-espacial.json 2>/dev/null
MATCH_ID=$(python3 -c "import json;print(json.load(open('/tmp/p3-ids-espacial.json'))['matchId'])" 2>/dev/null)
[ -n "$MATCH_ID" ] || { say "  💥 sin matchId"; cat /tmp/p3-ids-espacial.json >> "$R"; exit 1; }
say "  partido=$MATCH_ID"

# ---------- 5. dev server ----------
say "[5] next dev"
pkill -f "next dev" 2>/dev/null; sleep 1; pkill -9 -f "next dev" 2>/dev/null; sleep 1
nohup node_modules/.bin/next dev -p 3000 > /tmp/next-espacial.log 2>&1 &
UP=0
for i in $(seq 1 120); do
  curl -sf -o /dev/null http://localhost:3000/api/auth/csrf && { UP=1; break; }
  sleep 1
done
[ "$UP" = "1" ] && say "  server arriba" || { say "  💥 server no respondió"; tail -25 /tmp/next-espacial.log >> "$R"; exit 1; }

# ---------- 6. login NextAuth (curl → cookie jar) ----------
say "[6] login NextAuth (curl)"
CSRF=$(curl -s -c /tmp/cj-espacial.txt http://localhost:3000/api/auth/csrf | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
LOGIN=$(curl -s -b /tmp/cj-espacial.txt -c /tmp/cj-espacial.txt -X POST http://localhost:3000/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=mister@cfmetodo.es" \
  --data-urlencode "password=metodo2025" \
  --data-urlencode "callbackUrl=http://localhost:3000/dashboard" \
  -o /dev/null -w "%{http_code}")
DASH=$(curl -s -b /tmp/cj-espacial.txt -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard/today)
say "  login=$LOGIN dashboard/today=$DASH"
[ "$DASH" = "200" ] || { say "  💥 login falló"; exit 1; }

# ---------- 7. tests API ----------
say "[7] API: pizarra espacial (12 checks)"
node scripts/verify-pilar3-espacial.mjs /tmp/cj-espacial.txt "$MATCH_ID" 2>&1 | tee -a "$R"
API_RC=$?

# ---------- 8. tests UI (gesto real) ----------
say "[8] UI: pizarra espacial con gesto real"
bash scripts/verify-pilar3-espacial-ui.sh "$MATCH_ID" 2>&1 | tee -a "$R"
UI_RC=${PIPESTATUS[0]}

say "[9] resumen"
say "  API_RC=$API_RC UI_RC=$UI_RC"
tail -5 "$R"
pkill -f "next dev" 2>/dev/null
[ "$API_RC" = "0" ] && [ "$UI_RC" = "0" ] && echo "🎯 ESPACIAL E2E COMPLETO: TODO VERDE" || echo "💥 hay fallos — revisar $R"
exit $(( API_RC + UI_RC ))
