#!/bin/bash
# SONDA LOCAL — Demarcaciones de jugadores: «PD · pivote defensivo» presente
#   · selector principal: opción «PD · Pivote defensivo», y «DM» fuera
#   · chips de polivalencia: PD visible (y MCD fuera)
#   · fichas: el pivote (Jorge Palencia, seed) muestra PD
#   · alias: normalizePosition('dm') sigue → PD (via import CSV, sin UI)
# Solo lectura: se abre el diálogo y se cierra sin guardar.
set -uo pipefail
cd /home/z/my-project

AB="agent-browser"
BASE="http://localhost:3000"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ FALLO: $1"; }
check() { if [ "$2" = "1" ] || [ "$2" = "true" ]; then ok "$1"; else bad "$1"; fi }

ev() {
  "$AB" eval "$1" 2>/dev/null | python3 -c '
import sys, json
try:
    v = json.loads(sys.stdin.read().strip())
    if isinstance(v, bool): print("true" if v else "false")
    else: print(v)
except Exception: print("error")'
}

echo "=== 1 · login demo ==="
"$AB" set viewport 414 896 >/dev/null 2>&1
"$AB" open "$BASE" >/dev/null 2>&1
"$AB" wait --load networkidle >/dev/null 2>&1
sleep 2
if [ "$(ev "!!document.querySelector('input[type=email]')")" = "true" ]; then
  "$AB" find first "input[type=email]" fill "mister@cfmetodo.es" >/dev/null 2>&1
  "$AB" find first "input[type=password]" fill "metodo2025" >/dev/null 2>&1
  "$AB" find first "button[type=submit]" click >/dev/null 2>&1
  "$AB" wait --load networkidle >/dev/null 2>&1
  sleep 3
fi

echo "=== 2 · Plantilla → abrir alta manual (sin guardar) ==="
"$AB" open "$BASE/dashboard/players" >/dev/null 2>&1
"$AB" wait --load networkidle >/dev/null 2>&1
sleep 2
check "página Plantilla carga" "$(ev "document.body.innerText.length>100")"

# abrir el diálogo de nuevo jugador (botón compacto «Nuevo» de la cabecera)
ev "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Nuevo')||[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Añadir jugador nuevo'));if(b){b.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
sleep 1.5
SEL=$(ev "(()=>{const s=document.querySelector('#primary-position');return s?'ok':'no'})()")
check "selector de demarcación principal visible" "$([ "$SEL" = "ok" ] && echo 1 || echo 0)"

echo "=== 3 · «PD · Pivote defensivo» en el selector; DM fuera ==="
OPT_PD=$(ev "(()=>{const s=document.querySelector('#primary-position');if(!s)return 'nosel';return [...s.options].some(o=>o.textContent.includes('PD · Pivote defensivo'))?'si':'no'})()")
check "opción «PD · Pivote defensivo» presente" "$([ "$OPT_PD" = "si" ] && echo 1 || echo 0)"
OPT_DM=$(ev "(()=>{const s=document.querySelector('#primary-position');if(!s)return 'nosel';return [...s.options].some(o=>o.textContent.startsWith('DM')||o.textContent.includes('DM ·'))?'si':'no'})()")
check "ninguna opción empieza por DM" "$([ "$OPT_DM" = "no" ] && echo 1 || echo 0)"
CNT=$(ev "(()=>{const s=document.querySelector('#primary-position');return s?s.options.length:0})()")
check "el catálogo completo sigue (16 demarcaciones)" "$([ "$CNT" = "16" ] && echo 1 || echo 0)"

echo "=== 4 · Chips de polivalencia: PD visible, MCD fuera ==="
CHP_PD=$(ev "(()=>{const chips=[...document.querySelectorAll('[role=dialog] button, [data-slot=sheet-content] button')].map(b=>b.textContent.trim());return chips.includes('PD')?'si':'no'})()")
check "chip «PD» presente en polivalencia" "$([ "$CHP_PD" = "si" ] && echo 1 || echo 0)"
CHP_MCD=$(ev "(()=>{const chips=[...document.querySelectorAll('[role=dialog] button, [data-slot=sheet-content] button')].map(b=>b.textContent.trim());return chips.includes('MCD')?'si':'no'})()")
check "chip «MCD» (código viejo) fuera" "$([ "$CHP_MCD" = "no" ] && echo 1 || echo 0)"

echo "=== 5 · Cerrar sin guardar y ficha del pivote (seed) ==="
"$AB" key Escape >/dev/null 2>&1
sleep 1
check "pivote seed (Palencia) en la plantilla con PD" "$(ev "(()=>{const t=document.body.innerText;return t.includes('Palencia')&&t.includes('PD')})()")"

echo
echo "════════ SONDA DEMARCACIONES: PASS=$PASS FAIL=$FAIL ════════"
if [ "$FAIL" = "0" ]; then echo "VERDE"; else echo "HAY FALLOS"; fi
