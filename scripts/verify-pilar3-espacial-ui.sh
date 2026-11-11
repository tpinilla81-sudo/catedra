#!/bin/bash
# E2E UI — Pilar 3: pizarra espacial causa→efecto con GESTO REAL (ratón/touch)
# móvil 414×896 · login → live?g=<id> → botón Espacial → drag en el campo →
# botonera → consecuencia → fila en el registro → recarga → persistencia SSR.
set -uo pipefail
cd /home/z/my-project

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ FALLO: $1"; }
check() { if [ "$2" = "1" ]; then ok "$1"; else bad "$1"; fi }

# eval de agent-browser → "true"/"false"/texto limpio
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
# get box --json → "x y width height"
bbox() {
  agent-browser --json get box "$1" 2>/dev/null | python3 -c '
import sys, json
try:
    d = json.loads(sys.stdin.read())["data"]
    print(int(d["x"]), int(d["y"]), int(d["width"]), int(d["height"]))
except Exception:
    print("")'
}

MATCH_ID="$1"
[ -n "$MATCH_ID" ] || { echo "Uso: $0 <matchId>"; exit 1; }

AB="agent-browser"
$AB close >/dev/null 2>&1 || true

echo "=== 1 · login (móvil 414×896) ==="
$AB set viewport 414 896 >/dev/null 2>&1
$AB open http://localhost:3000 >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 1
$AB find first "input[type=email]" fill "mister@cfmetodo.es" >/dev/null 2>&1
$AB find first "input[type=password]" fill "metodo2025" >/dev/null 2>&1
$AB find first "button[type=submit]" click >/dev/null 2>&1
L=""
for i in $(seq 1 25); do
  L=$(ev "!document.querySelector('input[type=email]')")
  [ "$L" = "true" ] && break
  sleep 1
done
check "login completado" "$([ "$L" = "true" ] && echo 1)"

echo "=== 2 · tablón en directo + botón Espacial ==="
$AB open "http://localhost:3000/dashboard/match/live?g=$MATCH_ID" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
BTN=$(ev "!!document.querySelector('[data-testid=btn-espacial]')")
check "botón Espacial visible en el tablón" "$([ "$BTN" = "true" ] && echo 1)"
$AB eval "document.querySelector('[data-testid=btn-espacial]')?.scrollIntoView({block:'center'})" >/dev/null 2>&1
sleep 0.5
$AB find first "[data-testid=btn-espacial]" click >/dev/null 2>&1
sleep 1
BOARD=$(ev "!!document.querySelector('[data-testid=spatial-board]')")
check "pizarra espacial desplegada" "$([ "$BOARD" = "true" ] && echo 1)"
LIST0=$(ev "document.querySelectorAll('[data-testid=spatial-row]').length")
echo "  [dbg] filas previas (de los tests API): ${LIST0:-?}"

echo "=== 3 · GESTO real: pulsa la pérdida y arrastra a la consecuencia ==="
$AB eval "document.querySelector('[data-testid=spatial-pitch]')?.scrollIntoView({block:'center'})" >/dev/null 2>&1
sleep 0.5
BOX=$(bbox "[data-testid=spatial-pitch]")
if [ -z "$BOX" ]; then bad "no pude medir el campo"; fi
read -r BX BY BW BH <<< "$BOX"
OX=$((BX + BW * 22 / 100)); OY=$((BY + BH * 62 / 100))   # origen (causa)
FX=$((BX + BW * 78 / 100)); FY=$((BY + BH * 25 / 100))   # fin (efecto)
$AB mouse move "$OX" "$OY" >/dev/null 2>&1
$AB mouse down left >/dev/null 2>&1
$AB mouse move "$(( (OX+FX)/2 ))" "$(( (OY+FY)/2 ))" >/dev/null 2>&1
$AB mouse move "$FX" "$FY" >/dev/null 2>&1
$AB mouse up left >/dev/null 2>&1
sleep 0.6
MENU=$(ev "!!document.querySelector('[data-testid=spatial-menu]')")
check "selector de eventos tras el gesto" "$([ "$MENU" = "true" ] && echo 1)"
CATS=$(ev "document.querySelectorAll('[data-testid=spatial-cats] button').length")
check "4 categorías en el filtro (Pérdida·Robo·Tiro·Falta)" "$([ "${CATS:-0}" = "4" ] && echo 1)"
DET0=$(ev "document.querySelectorAll('[data-testid=spatial-menu] [data-testid^=spatial-detail-]').length")
check "4 detalles en Pérdida (catálogo configurable)" "$([ "${DET0:-0}" = "4" ] && echo 1)"
$AB find first "[data-testid=spatial-cat-RECOVERY]" click >/dev/null 2>&1
sleep 0.3
DETR=$(ev "!!document.querySelector('[data-testid=spatial-detail-RECOVERY_PRESS]')")
DETREC=$(ev "document.querySelectorAll('[data-testid=spatial-menu] [data-testid^=spatial-detail-RECOVERY]').length")
check "cambio a Robo: 4 detalles RECOVERY_* visibles" "$([ "$DETR" = "true" ] && [ "${DETREC:-0}" = "4" ] && echo 1)"
$AB screenshot /tmp/espacial-menu.png >/dev/null 2>&1 && ok "screenshot del selector"

echo "=== 4 · detalle del catálogo: Robo por Presión Alta (POST en vivo) ==="
# El selector es más alto que la botonera vieja: en móvil puede quedar fuera
# de pantalla → scroll al botón y clic sintético (React onClick fiable)
$AB eval "document.querySelector('[data-testid=spatial-detail-RECOVERY_PRESS]')?.scrollIntoView({block:'center'})" >/dev/null 2>&1
sleep 0.3
$AB eval "document.querySelector('[data-testid=spatial-detail-RECOVERY_PRESS]')?.click() || 0" >/dev/null 2>&1
ROW=""
for i in $(seq 1 15); do
  N=$(ev "document.querySelectorAll('[data-testid=spatial-row]').length")
  [ -n "$N" ] && [ "$N" -gt "${LIST0:-0}" ] && { ROW=1; break; }
  sleep 1
done
check "fila NUEVA en el registro tras el gesto ($(( ${LIST0:-0} + 1 )))" "$([ -n "$ROW" ] && echo 1)"
LBL=$(ev "document.querySelector('[data-testid=spatial-row]')?.innerText?.slice(0,60)?.replace(/\\n/g,'|')")
echo "  [dbg] fila: $LBL"
$AB screenshot /tmp/espacial-guardado.png >/dev/null 2>&1 && ok "screenshot del vector guardado"

echo "=== 5 · persistencia: recarga dura y vuelve del servidor ==="
$AB open "http://localhost:3000/dashboard/match/live?g=$MATCH_ID" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
$AB find first "[data-testid=btn-espacial]" click >/dev/null 2>&1
sleep 1
ROW2=$(ev "document.querySelectorAll('[data-testid=spatial-row]').length")
check "vector sobrevive a la recarga (SSR, ≥$(( ${LIST0:-0} + 1 )) filas)" "$([ "${ROW2:-0}" -ge $(( ${LIST0:-0} + 1 )) ] && echo 1)"
SVG=$(ev "document.querySelectorAll('[data-testid=spatial-svg] line').length")
check "el vector se dibuja en el campo (SVG)" "$([ "${SVG:-0}" -ge 1 ] && echo 1)"
$AB screenshot /tmp/espacial-persistente.png >/dev/null 2>&1 && ok "screenshot persistente"

echo ""
echo "RESULTADO UI: $PASS ✓ / $FAIL ✗"
[ "$FAIL" = "0" ] || exit 1
exit 0
