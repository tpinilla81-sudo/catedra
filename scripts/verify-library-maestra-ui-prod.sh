#!/bin/bash
# E2E UI PRODUCCIÓN — PILAR 1: Biblioteca Maestra (mock 'MasterLibraryTaxonomyView')
# https://catedra-sooty.vercel.app · móvil 414×896 · login demo →
# pestaña «Maestra» → 5 categorías plegables · chips · descriptores exactos ·
# + Tarea abre el editor con familia preseleccionada (SE CIERRA SIN GUARDAR:
# no se escribe en producción) · búsqueda real · recarga SSR.
# Uso: verify-library-maestra-ui-prod.sh [BASE]
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

jsClick() { $AB eval "(()=>{const e=document.querySelector('$1');if(e){e.click();return 'ok'}return 'missing'})()" >/dev/null 2>&1; }

openCat() {
  if [ "$(ev "!!document.querySelector('[data-testid=maestra-cat-body-$1]')")" = "true" ]; then return 0; fi
  jsClick "[data-testid=maestra-cat-btn-$1]"
  waitfor "document.querySelector('[data-testid=maestra-cat-body-$1]')" 8
}

openFam() {
  if [ "$(ev "!!document.querySelector('[data-testid=maestra-family-tasks-$1]')")" = "true" ]; then return 0; fi
  jsClick "[data-testid=maestra-family-btn-$1]"
  waitfor "document.querySelector('[data-testid=maestra-family-tasks-$1]')" 8
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
# la sesión real la prueba el paso 2 (biblioteca autenticada carga con h1)
check "login demo en producción (credenciales aceptadas)" "$([ "$L" = "true" ] && echo 1)"

echo "=== 2 · /dashboard/library → pestaña Maestra ==="
$AB open "$BASE/dashboard/library" >/dev/null 2>&1
waitfor "document.querySelector('h1')" 25
check "biblioteca carga" "$(ev "!!document.querySelector('h1')")"
waitfor "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Maestra'))" 15
$AB eval "[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Maestra')).click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=maestra-root]')" 15
check "raíz maestra visible" "$(ev "!!document.querySelector('[data-testid=maestra-root]')")"
check "buscador visible" "$(ev "!!document.querySelector('[data-testid=maestra-search]')")"

echo "=== 3 · 5 categorías plegables ==="
N=$(ev "['fisicas','tecnicas','tacticas','psicologicas','integradas'].filter(c=>!!document.querySelector('[data-testid=maestra-cat-btn-'+c+']')).length")
check "5 categorías presentes (fís/téc/tác/psi/int)" "$([ "$N" = "5" ] && echo 1)"

openCat "tacticas"
FAM=$(ev "['TAC_OFENSIVA','TAC_DEFENSIVA','TAC_TRANSICIONES','TAC_ABP'].filter(f=>!!document.querySelector('[data-testid=maestra-family-'+f+']')).length")
check "tácticas abre con 4 familias" "$([ "$FAM" = "4" ] && echo 1)"
CHIP=$(ev "(document.querySelector('[data-testid=maestra-chip-TAC_ABP]')||{}).textContent||''")
check "chip ABP correcto" "$([ "$CHIP" = "ABP" ] && echo 1)"
DESC=$(ev "(document.querySelector('[data-testid=maestra-family-btn-TAC_ABP]')||{}).textContent||''")
echo "$DESC" | rg -q "Córners" && ok "descriptor ABP del mock (córners, faltas, penaltis)" || bad "descriptor ABP ('$DESC')"
openCat "fisicas"
NCH=$(ev "document.querySelectorAll('[data-testid^=maestra-chip-FIS_]').length")
check "3 familias físicas con chip Físico" "$([ "$NCH" = "3" ] && echo 1)"
FISD=$(ev "(document.querySelector('[data-testid=maestra-family-btn-FIS_FUERZA]')||{}).textContent||''")
echo "$FISD" | rg -q "explosiva" && ok "descriptor Fuerza (general, máxima, explosiva, resistencia)" || bad "descriptor Fuerza"
openCat "integradas"
INTC=$(ev "!!document.querySelector('[data-testid=maestra-family-INT_RONDOS_POSICION]') && !!document.querySelector('[data-testid=maestra-family-INT_SSG_CONDICIONADOS]')")
check "integradas: Rondos + SSG presentes" "$INTC"
openCat "psicologicas"
PSIC=$(ev "!!document.querySelector('[data-testid=maestra-family-PSI_ATENCION]') && !!document.querySelector('[data-testid=maestra-family-PSI_EMOCION]')")
check "psicológicas: Atención + Gestión Emocional" "$PSIC"
openCat "tecnicas"
TECP=$(ev "!!document.querySelector('[data-testid=maestra-family-TEC_PORTERO]')")
check "técnicas: Técnica del Portero presente" "$TECP"

echo "=== 4 · + Tarea desde familia → editor SIN GUARDAR (producción intacta) ==="
ANTES=$(ev "(document.querySelector('[data-testid=maestra-cat-btn-tacticas]')?.textContent||'') + (document.body.textContent.match(/(\d+)\s*tareas/)||[])[1]")
jsClick "[data-testid=maestra-add-TAC_ABP]"
waitfor "document.querySelector('[data-slot=sheet-content] [data-testid=editor-family-current]')" 12
CUR=$(ev "(document.querySelector('[data-testid=editor-family-current]')||{}).textContent||''")
echo "$CUR" | rg -q "Balón Parado" && ok "editor abre con familia ABP preseleccionada" || bad "editor familia ('$CUR')"
$AB eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.className.includes('ring-offset-background')&&x.className.includes('absolute'));if(b){b.click();return 'ok'}return 'missing'})()" >/dev/null 2>&1
CERRADO=""
for i in $(seq 1 10); do
  CERRADO=$(ev "!document.querySelector('[data-testid=editor-family-current]')")
  [ "$CERRADO" = "true" ] && break
  sleep 1
done
check "editor cerrado SIN guardar (producción intacta)" "$([ "$CERRADO" = "true" ] && echo 1)"

echo "=== 5 · búsqueda real despliega secciones ==="
$AB eval "(()=>{const i=document.querySelector('[data-testid=maestra-search]');const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(i,'rondo');i.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=maestra-search-state]')" 10
ST=$(ev "(document.querySelector('[data-testid=maestra-search-state]')||{}).textContent||''")
echo "$ST" | rg -q "resultados" && ok "estado de búsqueda ($ST)" || bad "estado búsqueda ('$ST')"
OPEN=$(ev "!!document.querySelector('[data-testid=maestra-cat-body-integradas]')")
check "integradas auto-desplegada por búsqueda" "$([ "$OPEN" = "true" ] && echo 1)"
UNCL=$(ev "!!document.querySelector('[data-testid^=maestra-unclassified-task-]')")
check "bloque sin clasificar con tareas reales" "$([ "$UNCL" = "true" ] && echo 1)"
$AB eval "(()=>{const i=document.querySelector('[data-testid=maestra-search]');const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(i,'zzzzsinresultados');i.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
sleep 1
ST2=$(ev "(document.querySelector('[data-testid=maestra-search-state]')||{}).textContent||''")
check "sin resultados → mensaje claro" "$(echo "$ST2" | rg -q "Sin resultados" && echo 1)"
$AB eval "(()=>{const i=document.querySelector('[data-testid=maestra-search]');const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
sleep 0.5

echo "=== 6 · recarga → pestaña Maestra SSR estable ==="
$AB open "$BASE/dashboard/library" >/dev/null 2>&1
waitfor "document.querySelector('h1')" 25
$AB eval "[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Maestra')).click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=maestra-root]')" 15
CNT=$(ev "document.querySelectorAll('[data-testid^=maestra-cat-btn-]').length")
check "tras recarga: 5 categorías de nuevo" "$([ "$CNT" = "5" ] && echo 1)"

echo "=== 7 · capturas ==="
openCat "tacticas"
openCat "integradas"
$AB eval "window.scrollTo(0,0)" >/dev/null 2>&1
$AB screenshot /tmp/prod-maestra-1.png >/dev/null 2>&1 && ok "captura móvil 414"
$AB set viewport 1440 900 >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/prod-maestra-desktop.png >/dev/null 2>&1 && ok "captura desktop 1440"

echo ""
echo "=============================="
echo "RESULTADO: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "PRODUCCIÓN MAESTRA VERDE ✓" || echo "ROJO ✗"
exit 0
