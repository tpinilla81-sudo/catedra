#!/bin/bash
# ============================================================================
# VERIFICACIÓN GOLDEN-PATH v2 — idempotente y a prueba de residuos
# 1) Mata TODA instancia previa (next, dev-postgres, postgres embebido)
# 2) Limpia .next (caché Turbopack)
# 3) Arranca UNA vez: npm run dev (PG + prisma-check + Next)
# 4) HTTP: / y /api/auth/csrf
# 5) Navegador real: / → login → Vista Hoy → screenshot
# ============================================================================
cd /home/z/my-project

echo "── 0) Limpieza de instancias previas ──"
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null
pkill -f "dev-postgres.mjs" 2>/dev/null
pkill -f "embedded-postgres/linux-x64/native/bin/postgres" 2>/dev/null
sleep 3
rm -rf .next
echo "  sin residuos — .next limpia"

echo "── 1) Arranque único: npm run dev ──"
setsid nohup npm run dev > smoke.log 2>&1 < /dev/null &
READY=0
for i in $(seq 1 75); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 http://localhost:3000/ 2>/dev/null)
  if [ "$code" = "200" ]; then READY=1; break; fi
  sleep 2
done
if [ "$READY" != "1" ]; then
  echo "❌ la app no llegó a 200 (último código: $code)"
  grep -aE "Error|error|⨯" smoke.log | head -8
  exit 1
fi
echo "✅ / → 200"
CSRF=$(curl -s --max-time 8 http://localhost:3000/api/auth/csrf)
echo "$CSRF" | grep -q csrfToken && echo "✅ NextAuth csrf: OK" || { echo "❌ csrf falló: $CSRF"; exit 1; }

echo "── 2) Navegador real: carga + login golden-path ──"
agent-browser open http://localhost:3000 2>&1 | tail -1
sleep 4
agent-browser find first "#email" fill "mister@cfmetodo.es" 2>&1 | tail -1
agent-browser find first "#password" fill "metodo2025" 2>&1 | tail -1
agent-browser find first "button[type=submit]" click 2>&1 | tail -1
sleep 8
echo "── 3) Estado tras login ──"
URL=$(agent-browser get url 2>&1)
echo "  url: $URL"
mkdir -p /tmp/render
agent-browser screenshot /tmp/render/hoy-tras-login.png 2>&1 | tail -1
echo "── 4) Elementos visibles (Vista Hoy) ──"
agent-browser snapshot -i 2>&1 | head -25
echo "── 5) Errores de página ──"
agent-browser errors 2>&1 | head -4
agent-browser close 2>&1 | tail -1
echo "── 6) dev.log (último) ──"
tail -4 dev.log | grep -av "GET /_next" | head -4
