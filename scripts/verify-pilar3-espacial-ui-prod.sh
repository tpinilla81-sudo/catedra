#!/bin/bash
# E2E UI PRODUCCIÓN — Pilar 3: selector de eventos configurable (catálogo de
# 2 niveles del mock 'LiveAnalysisWithEventSelector') contra Vercel.
# móvil 414×896 · login → live?g=<id> → Espacial → drag REAL → 4 categorías →
# cambio a Robo → guardar detalle → fila → recarga → persistencia SSR → desktop.
set -uo pipefail
cd /home/z/my-project

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ FALLO: $1"; }
check() { if [ "$2" = "1" ]; then ok "$1"; else bad "$1"; fi }

ev() {
  agent-browser eval "$1" 2>/dev/null | python3 -c '
import sys, json
try:
    v = json.loads(sys.stdin.read().strip())
    if isinstance(v, bool):
        print("true" if v else "false")
    else:
        print(v)
except Exception:
    print("")'
}
bbox() {
  agent-browser --json get box "$1" 2>/dev/null | python3 -c '
import sys, json
try:
    d = json.loads(sys.stdin.read())["data"]
    print(int(d["x"]), int(d["y"]), int(d["width"]), int(d["height"]))
except Exception:
    print("")'
}

BASE="${2:-https://catedra-sooty.vercel.app}"
MATCH_ID="$1"
[ -n "$MATCH_ID" ] || { echo "Uso: $0 <matchId> [base]"; exit 1; }

AB="agent-browser"
$AB close >/dev/null 2>&1 || true

echo "=== 1 · login PRODUCCIÓN (móvil 414×896) ==="
$AB set viewport 414 896 >/dev/null 2>&1
$AB open "$BASE" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
$AB find first "input[type=email]" fill "mister@cfmetodo.es" >/dev/null 2>&1
$AB find first "input[type=password]" fill "metodo2025" >/dev/null 2>&1
$AB find first "button[type=submit]" click >/dev/null 2>&1
L=""
for i in $(seq 1 40); do
  L=$(ev "!document.querySelector('input[type=email]')")
  [ "$L" = "true" ] && break
  sleep 1
done
check "login completado" "$([ "$L" = "true" ] && echo 1)"

echo "=== 2 · tablón en directo + botón Espacial ==="
$AB open "$BASE/dashboard/match/live?g=$MATCH_ID" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 3
BTN=$(ev "!!document.querySelector('[data-testid=btn-espacial]')")
check "botón Espacial visible en el tablón" "$([ "$BTN" = "true" ] && echo 1)"
$AB eval "document.querySelector('[data-testid=btn-espacial]')?.scrollIntoView({block:'center'})" >/dev/null 2>&1
sleep 0.5
$AB find first "[data-testid=btn-espacial]" click >/dev/null 2>&1
sleep 1.5
BOARD=$(ev "!!document.querySelector('[data-testid=spatial-board]')")
check "pizarra espacial desplegada" "$([ "$BOARD" = "true" ] && echo 1)"
LIST0=$(ev "document.querySelectorAll('[data-testid=spatial-row]').length")
echo "  [dbg] filas previas: ${LIST0:-?}"

echo "=== 3 · GESTO real: pulsa la pérdida y arrastra a la consecuencia ==="
$AB eval "document.querySelector('[data-testid=spatial-pitch]')?.scrollIntoView({block:'center'})" >/dev/null 2>&1
sleep 0.5
BOX=$(bbox "[data-testid=spatial-pitch]")
if [ -z "$BOX" ]; then bad "no pude medir el campo"; fi
read -r BX BY BW BH <<< "$BOX"
OX=$((BX + BW * 22 / 100)); OY=$((BY + BH * 62 / 100))
FX=$((BX + BW * 78 / 100)); FY=$((BY + BH * 25 / 100))
$AB mouse move "$OX" "$OY" >/dev/null 2>&1
$AB mouse down left >/dev/null 2>&1
$AB mouse move "$(( (OX+FX)/2 ))" "$(( (OY+FY)/2 ))" >/dev/null 2>&1
$AB mouse move "$FX" "$FY" >/dev/null 2>&1
$AB mouse up left >/dev/null 2>&1
sleep 0.8
MENU=$(ev "!!document.querySelector('[data-testid=spatial-menu]')")
check "selector de eventos tras el gesto" "$([ "$MENU" = "true" ] && echo 1)"
CATS=$(ev "document.querySelectorAll('[data-testid=spatial-cats] button').length")
check "4 categorías (Pérdida·Robo·Tiro·Falta)" "$([ "${CATS:-0}" = "4" ] && echo 1)"
DET0=$(ev "document.querySelectorAll('[data-testid=spatial-menu] [data-testid^=spatial-detail-]').length")
check "4 detalles en Pérdida (catálogo)" "$([ "${DET0:-0}" = "4" ] && echo 1)"
$AB find first "[data-testid=spatial-cat-RECOVERY]" click >/dev/null 2>&1
sleep 0.4
DETR=$(ev "!!document.querySelector('[data-testid=spatial-detail-RECOVERY_PRESS]')")
DETREC=$(ev "document.querySelectorAll('[data-testid=spatial-menu] [data-testid^=spatial-detail-RECOVERY]').length")
check "cambio a Robo: 4 detalles RECOVERY_*" "$([ "$DETR" = "true" ] && [ "${DETREC:-0}" = "4" ] && echo 1)"
$AB screenshot /tmp/prod-espacial-menu.png >/dev/null 2>&1 && ok "screenshot del selector (móvil)"

echo "=== 4 · detalle del catálogo: Robo por Presión Alta (POST en producción) ==="
$AB eval "document.querySelector('[data-testid=spatial-detail-RECOVERY_PRESS]')?.scrollIntoView({block:'center'})" >/dev/null 2>&1
sleep 0.3
$AB eval "document.querySelector('[data-testid=spatial-detail-RECOVERY_PRESS]')?.click() || 0" >/dev/null 2>&1
ROW=""
for i in $(seq 1 30); do
  N=$(ev "document.querySelectorAll('[data-testid=spatial-row]').length")
  [ -n "$N" ] && [ "$N" -gt "${LIST0:-0}" ] && { ROW=1; break; }
  sleep 1
done
check "fila NUEVA en el registro ($(( ${LIST0:-0} + 1 )))" "$([ -n "$ROW" ] && echo 1)"
LBL=$(ev "document.querySelector('[data-testid=spatial-row]')?.innerText?.slice(0,60)?.replace(/\\n/g,'|')")
echo "  [dbg] fila: $LBL"
$AB screenshot /tmp/prod-espacial-guardado.png >/dev/null 2>&1 && ok "screenshot del vector guardado (móvil)"

echo "=== 5 · persistencia: recarga dura y vuelve del servidor ==="
$AB open "$BASE/dashboard/match/live?g=$MATCH_ID" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 3
$AB find first "[data-testid=btn-espacial]" click >/dev/null 2>&1
sleep 1.5
ROW2=$(ev "document.querySelectorAll('[data-testid=spatial-row]').length")
check "vector sobrevive a la recarga (SSR, ≥$(( ${LIST0:-0} + 1 )) filas)" "$([ "${ROW2:-0}" -ge $(( ${LIST0:-0} + 1 )) ] && echo 1)"
SVG=$(ev "document.querySelectorAll('[data-testid=spatial-svg] line').length")
check "vector dibujado en el campo (SVG)" "$([ "${SVG:-0}" -ge 1 ] && echo 1)"
$AB screenshot /tmp/prod-espacial-persistente.png >/dev/null 2>&1 && ok "screenshot persistente (móvil)"

echo "=== 6 · escritorio 1440×900 · selector desplegado ==="
$AB set viewport 1440 900 >/dev/null 2>&1
$AB open "$BASE/dashboard/match/live?g=$MATCH_ID" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 3
$AB find first "[data-testid=btn-espacial]" click >/dev/null 2>&1
sleep 1.5
$AB eval "document.querySelector('[data-testid=spatial-pitch]')?.scrollIntoView({block:'center'})" >/dev/null 2>&1
sleep 0.5
BOX=$(bbox "[data-testid=spatial-pitch]")
read -r BX BY BW BH <<< "$BOX"
OX=$((BX + BW * 30 / 100)); OY=$((BY + BH * 55 / 100))
FX=$((BX + BW * 70 / 100)); FY=$((BY + BH * 35 / 100))
$AB mouse move "$OX" "$OY" >/dev/null 2>&1
$AB mouse down left >/dev/null 2>&1
$AB mouse move "$(( (OX+FX)/2 ))" "$(( (OY+FY)/2 ))" >/dev/null 2>&1
$AB mouse move "$FX" "$FY" >/dev/null 2>&1
$AB mouse up left >/dev/null 2>&1
sleep 0.8
MENU2=$(ev "!!document.querySelector('[data-testid=spatial-menu]')")
CATS2=$(ev "document.querySelectorAll('[data-testid=spatial-cats] button').length")
check "desktop: selector con 4 categorías" "$([ "$MENU2" = "true" ] && [ "${CATS2:-0}" = "4" ] && echo 1)"
$AB screenshot /tmp/prod-espacial-desktop.png >/dev/null 2>&1 && ok "screenshot escritorio"

echo ""
echo "RESULTADO PRODUCCIÓN UI: $PASS ✓ / $FAIL ✗"
[ "$FAIL" = "0" ] || exit 1
exit 0
