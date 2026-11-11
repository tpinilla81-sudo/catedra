#!/bin/bash
# Flujo visual completo: login → pizarra global → detalle (3 pestañas) desktop/móvil
set -e
cd /home/z/my-project
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/metodo" DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5432/metodo"

ss -ltn | rg -q 5432 || { node scripts/dev-postgres.mjs > /tmp/pg.log 2>&1 & sleep 6; }
ss -ltn | rg -q ":3000 " || { npx next dev -p 3000 > /tmp/next-dev.log 2>&1 & sleep 6; }
for i in $(seq 1 30); do curl -sf -o /dev/null --max-time 3 http://localhost:3000/api/auth/csrf && break; sleep 2; done

mkdir -p /tmp/shots
agent-browser close >/dev/null 2>&1 || true

agent-browser set viewport 1440 900
agent-browser open http://localhost:3000 >/dev/null
sleep 2
agent-browser find label "Email del cuerpo técnico" fill "mister@cfmetodo.es" >/dev/null
agent-browser find label "Contraseña" fill "metodo2025" >/dev/null
agent-browser press Enter >/dev/null
sleep 5
echo "tras login: $(agent-browser get url)"

# ---------- PIZARRA GLOBAL (desktop) ----------
agent-browser open http://localhost:3000/dashboard/pizarra >/dev/null
sleep 3
agent-browser screenshot /tmp/shots/pizarra-desktop.png >/dev/null
echo "pizarra desktop OK"

# ---------- DETALLE DE PARTIDO (desktop, 3 pestañas) ----------
G="cmwb2602m000aooulhmgqk40i:jornada10"
agent-browser open "http://localhost:3000/dashboard/match?g=$G" >/dev/null
sleep 4
agent-browser screenshot /tmp/shots/detalle-resumen.png >/dev/null
agent-browser find text "Vestuario (Notas)" click >/dev/null
sleep 1.5
agent-browser screenshot /tmp/shots/detalle-vestuario.png >/dev/null
agent-browser find text "Guardar Datos" click >/dev/null
sleep 1.5
agent-browser screenshot /tmp/shots/detalle-datos.png >/dev/null
echo "detalle desktop OK"

# ---------- MÓVIL ----------
agent-browser set device "iPhone 14" >/dev/null || agent-browser set viewport 390 844 >/dev/null
agent-browser open http://localhost:3000/dashboard/pizarra >/dev/null
sleep 3
agent-browser screenshot /tmp/shots/pizarra-movil.png >/dev/null
agent-browser open "http://localhost:3000/dashboard/match?g=$G" >/dev/null
sleep 4
agent-browser screenshot /tmp/shots/detalle-movil.png >/dev/null
echo "móvil OK"

agent-browser close >/dev/null
ls -la /tmp/shots/
