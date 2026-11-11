#!/bin/bash
# E2E UI — PILAR 2: Ficha de Rendimiento Completa del Jugador
# (mock del míster 'PlayerProfileEvaluationView')
# móvil 414×896 · login → /dashboard/players → tarjeta → editor →
# «Evaluación completa» → 6 bloques × 8 métricas · steppers ± (clamp 1-10) ·
# renombrar Libres · guardar (BD) · recarga → persistencia SSR · export ·
# volver a Plantilla.
set -uo pipefail
cd /home/z/my-project

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

PLAYER_ID="$1"
[ -n "$PLAYER_ID" ] || { echo "Uso: $0 <playerId>"; exit 1; }

# ---------- Reset idempotente: ficha sin evaluación previa ----------
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.playerEvaluation.deleteMany({where:{playerId:'$PLAYER_ID'}}).then(r=>{console.log('reset:',r.count,'eliminadas');process.exit(0)}).catch(e=>{console.error(e.message.slice(0,80));process.exit(1)})" 2>&1 | tail -1

echo "=== 1 · login (móvil 414×896) ==="
$AB set viewport 414 896 >/dev/null 2>&1
$AB open http://localhost:3000 >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 1
if [ "$(ev "!!document.querySelector('input[type=email]')")" = "true" ]; then
  $AB find first "input[type=email]" fill "mister@cfmetodo.es" >/dev/null 2>&1
  $AB find first "input[type=password]" fill "metodo2025" >/dev/null 2>&1
  $AB find first "button[type=submit]" click >/dev/null 2>&1
fi
L=""
for i in $(seq 1 25); do
  L=$(ev "!document.querySelector('input[type=email]')")
  [ "$L" = "true" ] && break
  sleep 1
done
check "login completado" "$([ "$L" = "true" ] && echo 1)"

echo "=== 2 · Plantilla → tarjeta → editor → Evaluación completa ==="
$AB open "http://localhost:3000/dashboard/players" >/dev/null 2>&1
waitfor "document.querySelector('h1')" 20
check "plantilla carga" "$(ev "!!document.querySelector('h1')")"
jsClickCard() { $AB eval "(()=>{const c=[...document.querySelectorAll('section[aria-label=\"Listado de jugadores\"] > button')].find(b=>b.textContent.includes('$1'));if(c){c.click();return 'ok'}return 'missing'})()" >/dev/null 2>&1; }
jsClickCard "Iker Sanz"
waitfor "document.querySelector('[data-slot=sheet-content]')" 10
check "editor rápido abre" "$(ev "!!document.querySelector('[data-slot=sheet-content]')")"
$AB eval "(()=>{const b=document.querySelector('[data-testid=open-evaluation]');if(b){b.click();return 'ok'}return 'missing'})()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=eval-root]')" 15
check "página de evaluación abre" "$(ev "!!document.querySelector('[data-testid=eval-root]')")"
TIT=$(ev "(document.querySelector('[data-testid=eval-title]')||{}).textContent||''")
echo "$TIT" | rg -q "Iker Sanz" && ok "cabecera con nombre del jugador ($TIT)" || bad "título ('$TIT')"
POS=$(ev "(document.querySelector('header')||{}).textContent||''")
echo "$POS" | rg -q "Ficha Técnica de Rendimiento" && ok "subtítulo del mock (Ficha Técnica de Rendimiento)" || bad "subtítulo"

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

echo "=== 4 · steppers ± con clamp 1-10 ==="
S0=$(ev "(document.querySelector('[data-testid=eval-score-fisicas-0]')||{}).textContent||''")
check "ficha nueva: nota inicial 5" "$([ "$S0" = "5" ] && echo 1)"
for i in 1 2 3; do $AB eval "document.querySelector('[data-testid=eval-plus-fisicas-0]').click()" >/dev/null 2>&1; done
sleep 0.3
S1=$(ev "(document.querySelector('[data-testid=eval-score-fisicas-0]')||{}).textContent||''")
check "3 × '+' → nota 8" "$([ "$S1" = "8" ] && echo 1)"
SC=$(ev "(document.querySelector('[data-testid=eval-score-fisicas-0]')||{}).className||''")
echo "$SC" | rg -q "brand" && ok "nota 8 en verde (semáforo ≥8)" || bad "color nota 8 ('$SC')"
for i in $(seq 1 12); do $AB eval "document.querySelector('[data-testid=eval-minus-fisicas-0]').click()" >/dev/null 2>&1; done
sleep 0.3
S2=$(ev "(document.querySelector('[data-testid=eval-score-fisicas-0]')||{}).textContent||''")
check "clamp inferior: 12 × '−' → nota 1" "$([ "$S2" = "1" ] && echo 1)"
PMIN=$(ev "(document.querySelector('[data-testid=eval-minus-fisicas-0]')||{}).disabled")
check "botón − deshabilitado en 1" "$([ "$PMIN" = "true" ] && echo 1)"

echo "=== 5 · métricas «Libre» con nombre editable ==="
$AB eval "(()=>{const i=document.querySelector('[data-testid=eval-label-input-fisicas-6]');const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(i,'Agilidad específica');i.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
LV=$(ev "(document.querySelector('[data-testid=eval-label-input-fisicas-6]')||{}).value||''")
check "Libre 1 renombrada (Agilidad específica)" "$([ "$LV" = "Agilidad específica" ] && echo 1)"
NP=$(ev "document.querySelectorAll('[data-testid^=eval-label-input-principios-]').length")
check "Principios Tácticos: 8 configurables (mock)" "$([ "$NP" = "8" ] && echo 1)"
$AB eval "(()=>{const i=document.querySelector('[data-testid=eval-label-input-principios-0]');const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(i,'Presión tras pérdida');i.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
sleep 0.3
AVG=$(ev "(document.querySelector('[data-testid=eval-avg-fisicas]')||{}).textContent||''")
echo "$AVG" | rg -q "Avg" && ok "chip Avg recalculado presente ($AVG)" || bad "Avg ('$AVG')"

echo "=== 6 · guardar → BD + recarga → persistencia SSR ==="
$AB eval "(()=>{window.__toast=false;const obs=new MutationObserver(()=>{if(document.body.innerText.includes('Evaluación guardada'))window.__toast=true});obs.observe(document.body,{childList:true,subtree:true,characterData:true});return 'obs-installed'})()" >/dev/null 2>&1
$AB eval "document.querySelector('[data-testid=eval-save]').click()" >/dev/null 2>&1
TOAST=""
for i in $(seq 1 15); do
  TOAST=$(ev "window.__toast===true")
  [ "$TOAST" = "true" ] && break
  sleep 1
done
check "toast «Evaluación guardada»" "$([ "$TOAST" = "true" ] && echo 1)"
CNT=$(export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"; node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.playerEvaluation.count({where:{playerId:'$PLAYER_ID'}}).then(c=>{console.log(c);process.exit(0)})" 2>/dev/null)
check "BD: evaluación guardada para el jugador" "$([ "${CNT:-0}" = "1" ] && echo 1)"
DATA=$(export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"; node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.playerEvaluation.findUnique({where:{playerId:'$PLAYER_ID'},select:{data:true}}).then(r=>{const s=JSON.stringify(r.data);console.log((s.includes('Agilidad específica')?'LABEL_OK':'LABEL_NO')+' '+(s.includes('Presión tras pérdida')?'PRI_OK':'PRI_NO'));process.exit(0)})" 2>/dev/null)
echo "$DATA" | rg -q "LABEL_OK" && ok "BD: label renombrado persistido" || bad "BD label ($DATA)"
echo "$DATA" | rg -q "PRI_OK" && ok "BD: principio táctico renombrado persistido" || bad "BD principios ($DATA)"

$AB open "http://localhost:3000/dashboard/players/$PLAYER_ID" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=eval-root]')" 20
SR=$(ev "(document.querySelector('[data-testid=eval-score-fisicas-0]')||{}).textContent||''")
check "recarga SSR: nota ajustada persiste" "$([ "$SR" = "1" ] && echo 1)"
SRV=$(ev "(document.querySelector('[data-testid=eval-label-input-fisicas-6]')||{}).value||''")
check "recarga SSR: nombre Libre persiste" "$([ "$SRV" = "Agilidad específica" ] && echo 1)"
STATE=$(ev "(document.querySelector('[data-testid=eval-state]')||{}).textContent||''")
echo "$STATE" | rg -q "Guardada" && ok "estado «Guardada» tras recarga" || bad "estado ('$STATE')"

echo "=== 7 · exportar informe + volver a Plantilla ==="
EXP=$(ev "!!document.querySelector('[data-testid=eval-export]')")
check "botón Exportar Informe presente" "$EXP"
$AB eval "(()=>{window.__blob=0;const orig=URL.createObjectURL;URL.createObjectURL=function(b){window.__blob++;window.__blobText=b.type;return orig.call(URL,b)};document.querySelector('[data-testid=eval-export]').click();return 'ok'})()" >/dev/null 2>&1
sleep 1
BLB=$(ev "window.__blob")
check "export genera el informe (blob descarga)" "$([ "${BLB:-0}" -ge 1 ] && echo 1)"
$AB eval "document.querySelector('[data-testid=eval-back]').click()" >/dev/null 2>&1
waitfor "(()=>document.body.innerText.includes('Plantilla'))()" 12
check "volver a Plantilla funciona" "$(ev "!!document.querySelector('h1') && location.pathname.includes('/dashboard/players')")"

echo "=== 8 · capturas ==="
$AB open "http://localhost:3000/dashboard/players/$PLAYER_ID" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=eval-root]')" 20
$AB eval "window.scrollTo(0,0)" >/dev/null 2>&1
$AB screenshot /tmp/eval-mobile-1.png >/dev/null 2>&1 && ok "captura móvil 414"
$AB set viewport 1440 900 >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/eval-desktop.png >/dev/null 2>&1 && ok "captura desktop 1440"

echo ""
echo "=============================="
echo "RESULTADO: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "VERDE ✓" || echo "ROJO ✗"
exit 0
