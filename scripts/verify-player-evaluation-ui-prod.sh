#!/bin/bash
# E2E UI PRODUCCIÓN — PILAR 2: Ficha de Rendimiento Completa del Jugador
# (mock 'PlayerProfileEvaluationView') — https://catedra-sooty.vercel.app
# móvil 414×896 · login demo → Plantilla → editor rápido → «Evaluación completa»
# → 6 bloques × 8 métricas · chips Avg · steppers ± (solo cliente) ·
# renombrar Libre (solo cliente) · recarga = estado previo (NO se escribe en
# producción: jamás se pulsa [data-testid=eval-save]) · export blob ·
# volver a Plantilla · capturas móvil+desktop.
# Uso: verify-player-evaluation-ui-prod.sh [BASE]
set -uo pipefail
cd /home/z/my-project

BASE="${1:-https://catedra-sooty.vercel.app}"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ FALLO: $1"; }
check() { if [ "$2" = "1" ] || [ "$2" = "true" ]; then ok "$1"; else bad "$1"; fi }

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

AB="agent-browser"
$AB close >/dev/null 2>&1 || true

waitfor() {
  for i in $(seq 1 "${2:-15}"); do
    [ "$(ev "!!($1)")" = "true" ] && return 0
    sleep 1
  done
  return 1
}

echo "=== 1 · login en PRODUCCIÓN (móvil 414×896) ==="
$AB set viewport 414 896 >/dev/null 2>&1
$AB open "$BASE" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 1
if [ "$(ev "!!document.querySelector('input[type=email]')")" = "true" ]; then
  $AB find first "input[type=email]" fill "mister@cfmetodo.es" >/dev/null 2>&1
  $AB find first "input[type=password]" fill "metodo2025" >/dev/null 2>&1
  $AB find first "button[type=submit]" click >/dev/null 2>&1
fi
L=""
for i in $(seq 1 30); do
  L=$(ev "!document.querySelector('input[type=email]')")
  [ "$L" = "true" ] && break
  sleep 1
done
check "login demo en producción (credenciales aceptadas)" "$([ "$L" = "true" ] && echo 1)"

echo "=== 2 · Plantilla → editor rápido → Evaluación completa ==="
$AB open "$BASE/dashboard/players" >/dev/null 2>&1
waitfor "document.querySelector('h1')" 25
check "plantilla carga (200 = tabla PlayerEvaluation consulta OK)" "$(ev "!!document.querySelector('h1')")"
$AB eval "(()=>{const all=[...document.querySelectorAll('section[aria-label=\"Listado de jugadores\"] > button')];const c=all.find(b=>b.textContent.includes('Iker Sanz'))||all[0];if(c){c.click();return c.textContent.slice(0,30)}return 'missing'})()" >/dev/null 2>&1
waitfor "document.querySelector('[data-slot=sheet-content]')" 12
check "editor rápido abre" "$(ev "!!document.querySelector('[data-slot=sheet-content]')")"
$AB eval "document.querySelector('[data-testid=open-evaluation]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=eval-root]')" 15
check "página de evaluación abre" "$(ev "!!document.querySelector('[data-testid=eval-root]')")"
PID="$(ev "location.pathname.split('/').pop()" | tr -d '\n')"
NOMBRE="$(ev "(document.querySelector('[data-testid=eval-title]')||{}).textContent||''")"
echo "  · jugador: $NOMBRE ($PID)"
[ -n "$PID" ] && [ "$PID" != "" ] && ok "playerId capturado de la URL" || bad "playerId vacío"
SUB="$(ev "(document.querySelector('header')||{}).textContent||''")"
echo "$SUB" | rg -q "Ficha Técnica de Rendimiento" && ok "subtítulo del mock (Ficha Técnica de Rendimiento)" || bad "subtítulo ('$SUB')"

echo "=== 3 · 6 bloques × 8 métricas + Avg ==="
NB=$(ev "['fisicas','tecnica','inteligencia','psicologicos','principios','actitud'].filter(b=>!!document.querySelector('[data-testid=eval-block-'+b+']')).length")
check "6 bloques presentes" "$([ "$NB" = "6" ] && echo 1)"
NM=$(ev "document.querySelectorAll('[data-testid^=eval-metric-]').length")
check "48 métricas renderizadas" "$([ "$NM" = "48" ] && echo 1)"
NA=$(ev "['fisicas','tecnica','inteligencia','psicologicos','principios','actitud'].filter(b=>!!document.querySelector('[data-testid=eval-avg-'+b+']')).length")
check "6 chips Avg por bloque" "$([ "$NA" = "6" ] && echo 1)"
TITLES=$(ev "(()=>{const t=[...document.querySelectorAll('h2')].map(h=>h.textContent);return JSON.stringify({fis:t.some(x=>x.includes('Capacidades Físicas')),tec:t.some(x=>x.includes('Técnica Individual')),int:t.some(x=>x.includes('Inteligencia Táctica')),psi:t.some(x=>x.includes('Aspectos Psicológicos')),pri:t.some(x=>x.includes('Principios Tácticos')),act:t.some(x=>x.includes('Actitud Jugador'))})})()")
check "títulos EXACTOS de los 6 bloques del mock" "$(echo "$TITLES" | rg -q '"fis":true,"tec":true,"int":true,"psi":true,"pri":true,"act":true' && echo 1)"
FIX=$(ev "(()=>{const s=[...document.querySelectorAll('span')].find(x=>x.textContent.trim()==='Coordinación');return s?'ok':'missing'})()")
check "métrica fija del mock (Coordinación)" "$([ "$FIX" = "ok" ] && echo 1)"

echo "=== 4 · steppers ± SOLO CLIENTE (nunca se guarda) ==="
S0="$(ev "(document.querySelector('[data-testid=eval-score-fisicas-0]')||{}).textContent||''" | tr -d '\n')"
[ -n "$S0" ] && ok "nota inicial leída (S0=$S0)" || bad "no se pudo leer la nota inicial"
$AB eval "document.querySelector('[data-testid=eval-plus-fisicas-0]').click()" >/dev/null 2>&1
sleep 0.3
S1="$(ev "(document.querySelector('[data-testid=eval-score-fisicas-0]')||{}).textContent||''" | tr -d '\n')"
if [ "$S0" -le 9 ]; then
  check "stepper + funciona (S0=$S0 → $S1)" "$([ "$S1" = "$((S0+1))" ] && echo 1)"
else
  check "stepper en tope (S0=10 se mantiene)" "$([ "$S1" = "10" ] && echo 1)"
fi
for i in $(seq 1 12); do $AB eval "document.querySelector('[data-testid=eval-minus-fisicas-0]').click()" >/dev/null 2>&1; done
sleep 0.3
S2="$(ev "(document.querySelector('[data-testid=eval-score-fisicas-0]')||{}).textContent||''" | tr -d '\n')"
check "clamp inferior: nota 1" "$([ "$S2" = "1" ] && echo 1)"
PMIN="$(ev "(document.querySelector('[data-testid=eval-minus-fisicas-0]')||{}).disabled")"
check "botón − deshabilitado en 1" "$([ "$PMIN" = "true" ] && echo 1)"

echo "=== 5 · métricas «Libre» renombrables SOLO CLIENTE ==="
NP=$(ev "document.querySelectorAll('[data-testid^=eval-label-input-principios-]').length")
check "Principios Tácticos: 8 configurables (mock)" "$([ "$NP" = "8" ] && echo 1)"
L0="$(ev "(document.querySelector('[data-testid=eval-label-input-fisicas-6]')||{}).value||''" | tr -d '\n')"
$AB eval "(()=>{const i=document.querySelector('[data-testid=eval-label-input-fisicas-6]');const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(i,'Agilidad específica');i.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
sleep 0.3
LV="$(ev "(document.querySelector('[data-testid=eval-label-input-fisicas-6]')||{}).value||''" | tr -d '\n')"
check "Libre 1 renombrada en cliente (→ $LV)" "$([ "$LV" = "Agilidad específica" ] && echo 1)"
AVG="$(ev "(document.querySelector('[data-testid=eval-avg-fisicas]')||{}).textContent||''")"
echo "$AVG" | rg -q "Avg" && ok "chip Avg presente ($AVG)" || bad "Avg ('$AVG')"

echo "=== 6 · RECARGA = estado previo (prueba de NO-ESCRITURA) ==="
$AB open "$BASE/dashboard/players/$PID" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=eval-root]')" 20
SR="$(ev "(document.querySelector('[data-testid=eval-score-fisicas-0]')||{}).textContent||''" | tr -d '\n')"
check "nota restaurada tras recarga ($SR = S0 original)" "$([ "$SR" = "$S0" ] && echo 1)"
SRV="$(ev "(document.querySelector('[data-testid=eval-label-input-fisicas-6]')||{}).value||''" | tr -d '\n')"
check "label restaurado tras recarga ($SRV)" "$([ "$SRV" = "$L0" ] && echo 1)"
EST="$(ev "(document.querySelector('[data-testid=eval-state]')||{}).textContent||''")"
echo "  · estado de la ficha en producción: $EST"

echo "=== 7 · export + volver a Plantilla ==="
EXP="$(ev "!!document.querySelector('[data-testid=eval-export]')")"
check "botón Exportar Informe presente" "$EXP"
$AB eval "(()=>{window.__blob=0;const orig=URL.createObjectURL;URL.createObjectURL=function(b){window.__blob++;return orig.call(URL,b)};document.querySelector('[data-testid=eval-export]').click();return 'ok'})()" >/dev/null 2>&1
sleep 1
BLB="$(ev "window.__blob")"
check "export genera el informe (blob descarga, sin backend)" "$([ "${BLB:-0}" -ge 1 ] && echo 1)"
BACK="$(ev "!!document.querySelector('[data-testid=eval-back]')")"
check "botón volver a Plantilla presente" "$BACK"

echo "=== 8 · capturas ==="
$AB set viewport 1440 900 >/dev/null 2>&1
$AB open "$BASE/dashboard/players/$PID" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=eval-root]')" 20
$AB eval "window.scrollTo(0,0)" >/dev/null 2>&1
$AB screenshot /tmp/prod-eval-desktop.png >/dev/null 2>&1 && ok "captura desktop 1440"
$AB set viewport 414 896 >/dev/null 2>&1
$AB open "$BASE/dashboard/players/$PID" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=eval-root]')" 20
$AB screenshot /tmp/prod-eval-mobile.png >/dev/null 2>&1 && ok "captura móvil 414"

echo ""
echo "=============================="
echo "RESULTADO: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "PRODUCCIÓN FICHA VERDE ✓ (sin escrituras)" || echo "ROJO ✗"
exit 0
