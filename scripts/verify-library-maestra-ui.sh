#!/bin/bash
# E2E UI — PILAR 1: Biblioteca Maestra (mock del míster 'MasterLibraryTaxonomyView')
# móvil 414×896 · login → /dashboard/library → pestaña «Maestra» →
# 5 categorías plegables · chips · + Tarea desde familia (editor con familia
# preseleccionada, guardado real) · búsqueda real (despliega secciones) ·
# recarga → persistencia SSR de la tarea clasificada.
# Nota: agent-browser NO soporta :has-text() de Playwright → clics por eval JS;
# las interacciones del editor se SCOPEAN a [data-slot=sheet-content] para no
# pulsar elementos de fondo tras el overlay.
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

# espera activa a que un selector JS exista (máx N segundos)
waitfor() { # $1=expr js  $2=segundos
  for i in $(seq 1 "${2:-15}"); do
    [ "$(ev "!!($1)")" = "true" ] && return 0
    sleep 1
  done
  return 1
}

# clic seguro por eval (acepta selector CSS)
jsClick() { $AB eval "(()=>{const e=document.querySelector('$1');if(e){e.click();return 'ok'}return 'missing'})()" >/dev/null 2>&1; }

# asegura que una categoría Maestra está abierta (si no, la abre)
openCat() { # $1=id categoría
  if [ "$(ev "!!document.querySelector('[data-testid=maestra-cat-body-$1]')")" = "true" ]; then return 0; fi
  jsClick "[data-testid=maestra-cat-btn-$1]"
  waitfor "document.querySelector('[data-testid=maestra-cat-body-$1]')" 8
}

# asegura que una familia está abierta
openFam() { # $1=id familia
  if [ "$(ev "!!document.querySelector('[data-testid=maestra-family-tasks-$1]')")" = "true" ]; then return 0; fi
  jsClick "[data-testid=maestra-family-btn-$1]"
  waitfor "document.querySelector('[data-testid=maestra-family-tasks-$1]')" 8
}

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
  L=$(ev "!document.querySelector('input[type=email]') && !!document.querySelector('nav,[class*=AppShell],[data-slot=sidebar]')")
  [ "$L" = "true" ] && break
  sleep 1
done
check "login completado (dashboard visible)" "$([ "$L" = "true" ] && echo 1)"

echo "=== 2 · /dashboard/library → pestaña Maestra ==="
$AB open "http://localhost:3000/dashboard/library" >/dev/null 2>&1
waitfor "document.querySelector('h1')" 20
check "biblioteca carga" "$(ev "!!document.querySelector('h1')")"
waitfor "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Maestra'))" 10
$AB eval "[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Maestra')).click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=maestra-root]')" 10
check "raíz maestra visible" "$(ev "!!document.querySelector('[data-testid=maestra-root]')")"
check "buscador visible" "$(ev "!!document.querySelector('[data-testid=maestra-search]')")"

echo "=== 3 · 5 categorías plegables ==="
N=$(ev "['fisicas','tecnicas','tacticas','psicologicas','integradas'].filter(c=>!!document.querySelector('[data-testid=maestra-cat-btn-'+c+']')).length")
check "5 categorías presentes (fís/téc/tác/psi/int)" "$([ "$N" = "5" ] && echo 1)"

openCat "tacticas"
FAM=$(ev "['TAC_OFENSIVA','TAC_DEFENSIVA','TAC_TRANSICIONES','TAC_ABP'].filter(f=>!!document.querySelector('[data-testid=maestra-family-'+f+']')).length")
check "categoría tácticas abre con 4 familias" "$([ "$FAM" = "4" ] && echo 1)"
CHIP=$(ev "(document.querySelector('[data-testid=maestra-chip-TAC_ABP]')||{}).textContent||''")
check "chip ABP correcto" "$([ "$CHIP" = "ABP" ] && echo 1)"
DESC=$(ev "(document.querySelector('[data-testid=maestra-family-btn-TAC_ABP]')||{}).textContent||''")
echo "$DESC" | rg -q "Córners" && ok "descriptor ABP del mock (córners, faltas, penaltis)" || bad "descriptor ABP"
openCat "fisicas"
NCH=$(ev "document.querySelectorAll('[data-testid^=maestra-chip-FIS_]').length")
check "3 familias físicas con chip Físico" "$([ "$NCH" = "3" ] && echo 1)"
openCat "integradas"
INTC=$(ev "!!document.querySelector('[data-testid=maestra-family-INT_RONDOS_POSICION]') && !!document.querySelector('[data-testid=maestra-family-INT_SSG_CONDICIONADOS]')")
check "integradas: Rondos + SSG presentes" "$INTC"

echo "=== 4 · + Tarea desde familia ABP → editor con familia preseleccionada ==="
T1=$(export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"; node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.task.count().then(c=>{console.log(c);process.exit(0)})" 2>/dev/null)
jsClick "[data-testid=maestra-add-TAC_ABP]"
waitfor "document.querySelector('[data-slot=sheet-content] [data-testid=editor-family-current]')" 10
CUR=$(ev "(document.querySelector('[data-testid=editor-family-current]')||{}).textContent||''")
echo "$CUR" | rg -q "Balón Parado" && ok "editor abre con familia ABP preseleccionada" || bad "editor familia (cur='$CUR')"
# identidad (scopeada al sheet)
$AB eval "(()=>{const s=document.querySelector('[data-slot=sheet-content]');const i=s.querySelector('input[placeholder*=Título]');const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(i,'Córner corto: doble pared al primer palo');i.dispatchEvent(new Event('input',{bubbles:true}));const t=s.querySelector('textarea');const st2=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;st2.call(t,'Generar confusión en el área con doble pared al primer palo y remate cruzado al segundo.');t.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
# fase Organización Ofensiva (botones con aria-pressed dentro del sheet)
$AB eval "(()=>{const b=[...document.querySelectorAll('[data-slot=sheet-content] button[aria-pressed]')].find(x=>x.textContent.includes('Organización Ofensiva'));if(!b)return 'nofase';b.click();return 'ok'})()" >/dev/null 2>&1
sleep 0.3
PRESSED=$(ev "(()=>{const b=[...document.querySelectorAll('[data-slot=sheet-content] button[aria-pressed]')].find(x=>x.textContent.includes('Organización Ofensiva'));return b?b.getAttribute('aria-pressed'):'nofase'})()")
check "fase Organización Ofensiva marcada" "$([ "$PRESSED" = "true" ] && echo 1)"
$AB eval "[...document.querySelectorAll('[data-slot=sheet-content] button')].find(b=>b.textContent.includes('Crear tarea')).click()" >/dev/null 2>&1
GONE=""
for i in $(seq 1 15); do
  GONE=$(ev "!document.querySelector('[data-testid=editor-family-current]')")
  [ "$GONE" = "true" ] && break
  sleep 1
done
check "editor cerrado tras guardar" "$([ "$GONE" = "true" ] && echo 1)"
T2=$(export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"; node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.task.count().then(c=>{console.log(c);process.exit(0)})" 2>/dev/null)
check "BD: tareas $T1 → $T2 (+1 creada)" "$([ "${T2:-0}" -gt "${T1:-0}" ] && echo 1)"

echo "=== 5 · la familia muestra su tarea (contador) ==="
waitfor "document.querySelector('[data-testid=maestra-root]')" 10
openCat "tacticas"
openFam "TAC_ABP"
CNT=$(ev "(document.querySelector('[data-testid=maestra-count-TAC_ABP]')||{}).textContent||''")
check "familia ABP con 1 tarea clasificada" "$(echo "$CNT" | rg -q '^1' && echo 1)"
TASK=$(ev "[...document.querySelectorAll('[data-testid^=maestra-task-]')].map(e=>e.textContent).join('|')")
echo "$TASK" | rg -q "Córner corto" && ok "tarea creada aparece en su familia" || bad "tarea en familia ('$TASK')"

echo "=== 6 · búsqueda real despliega secciones ==="
$AB eval "(()=>{const i=document.querySelector('[data-testid=maestra-search]');const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(i,'rondo');i.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=maestra-search-state]')" 8
ST=$(ev "(document.querySelector('[data-testid=maestra-search-state]')||{}).textContent||''")
echo "$ST" | rg -q "resultados" && ok "estado de búsqueda ($ST)" || bad "estado búsqueda ('$ST')"
OPEN=$(ev "!!document.querySelector('[data-testid=maestra-cat-body-integradas]')")
check "categoría integradas auto-desplegada por búsqueda" "$([ "$OPEN" = "true" ] && echo 1)"
UNCL=$(ev "!!document.querySelector('[data-testid^=maestra-unclassified-task-]')")
check "bloque sin clasificar muestra el Rondo 6v2" "$([ "$UNCL" = "true" ] && echo 1)"
$AB eval "(()=>{const i=document.querySelector('[data-testid=maestra-search]');const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(i,'zzzzsinresultados');i.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
sleep 0.8
ST2=$(ev "(document.querySelector('[data-testid=maestra-search-state]')||{}).textContent||''")
check "sin resultados → mensaje claro" "$(echo "$ST2" | rg -q "Sin resultados" && echo 1)"
$AB eval "(()=>{const i=document.querySelector('[data-testid=maestra-search]');const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
sleep 0.5

echo "=== 7 · recarga → persistencia SSR de la clasificación ==="
$AB open "http://localhost:3000/dashboard/library" >/dev/null 2>&1
waitfor "document.querySelector('h1')" 20
$AB eval "[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Maestra')).click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=maestra-root]')" 10
openCat "tacticas"
openFam "TAC_ABP"
TSSR=$(ev "[...document.querySelectorAll('[data-testid^=maestra-task-]')].map(e=>e.textContent).join('|')")
echo "$TSSR" | rg -q "Córner corto" && ok "tarea clasificada persiste tras recarga (SSR)" || bad "persistencia SSR ('$TSSR')"

echo "=== 8 · clic en la tarea → ficha; capturas ==="
jsClick "[data-testid^=maestra-task-]"
DETAIL=$(ev "(()=>{const s=document.querySelector('[data-slot=sheet-content]');return s?(s.textContent.includes('Córner corto')?'ok':'sin-titulo'):'nosheet'})()")
check "ficha completa abre desde la Maestra" "$([ "$DETAIL" = "ok" ] && echo 1)"
$AB eval "(()=>{const b=[...document.querySelectorAll('[data-slot=sheet-content] button, [data-slot=sheet-close] button')].find(x=>x.getAttribute('aria-label')?.match(/cerrar|close/i)||x.textContent.trim()==='×'||x.closest('[data-slot=sheet-close]'));if(b){b.click();return 'ok'}return 'nofound'})()" >/dev/null 2>&1
sleep 0.6
$AB eval "document.querySelector('[data-testid=maestra-cat-btn-fisicas]')?.click();document.querySelector('[data-testid=maestra-cat-btn-tecnicas]')?.click();'ok'" >/dev/null 2>&1
sleep 0.6
$AB eval "window.scrollTo(0,0)" >/dev/null 2>&1
$AB screenshot /tmp/maestra-mobile-1.png >/dev/null 2>&1 && ok "captura móvil 414"
$AB set viewport 1440 900 >/dev/null 2>&1
sleep 0.8
$AB screenshot /tmp/maestra-desktop.png >/dev/null 2>&1 && ok "captura desktop 1440"

echo ""
echo "=============================="
echo "RESULTADO: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "VERDE ✓" || echo "ROJO ✗"
exit 0
