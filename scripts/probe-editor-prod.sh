#!/bin/bash
# SONDA SOLO-LECTURA EN PRODUCCIÓN — editor «+ Tarea»:
#   · los 2 campos nuevos pintan: «Definición del Trabajo» (textarea libre) y
#     «Etapa» (5 chips multiselección del proceso de formación)
#   · posición: el bloque nuevo queda DEBAJO de Intensidad (misma zona de ingeniería)
#   · NO se escribe nada: se abre el diálogo, se comprueba y se cierra sin guardar
#   · sello final: el recuento de tareas de la BD no cambia (14)
set -uo pipefail
cd /home/z/my-project

AB="agent-browser"
PROD="https://catedra-sooty.vercel.app"
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

echo "=== 1 · login demo (solo lectura) · $PROD ==="
$AB set viewport 414 896 >/dev/null 2>&1
$AB open "$PROD" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
if [ "$(ev "!!document.querySelector('input[type=email]')")" = "true" ]; then
  $AB find first "input[type=email]" fill "mister@cfmetodo.es" >/dev/null 2>&1
  $AB find first "input[type=password]" fill "metodo2025" >/dev/null 2>&1
  $AB find first "button[type=submit]" click >/dev/null 2>&1
  $AB wait --load networkidle >/dev/null 2>&1
  sleep 3
fi
check "login demo con sesión" "$(ev "!document.body.innerText.includes('Email del cuerpo técnico')")"

echo "=== 2 · Biblioteca → abrir editor «+ Tarea» (sin guardar) ==="
$AB open "$PROD/dashboard/library" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
$AB waitfor 'document.querySelector("[data-testid=tasks-tree]")' >/dev/null 2>&1 || true
S_ANTES=$(ev "fetch('/api/pilar2/tasks').then(r=>r.json()).then(d=>d.tasks.length)")
ANTES=$(echo "$S_ANTES" | tr -d '[:space:]')
check "árbol presente (vista única)" "$(ev "!!document.querySelector('[data-testid=tasks-tree]')")"

# abrir el editor con el botón de cabecera (icono + «Tarea»)
ev "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.querySelector('svg')&&x.textContent.includes('Tarea'));if(b){b.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
sleep 2
check "editor abierto («Definición del Trabajo» visible en el diálogo)" "$(ev "document.body.innerText.toLowerCase().includes('definición del trabajo')")"

echo "=== 3 · Los 2 campos nuevos dentro del editor ==="
check "«Definición del Trabajo» = TEXTAREA de escritura libre" "$(ev "(()=>{const t=document.querySelector('[data-testid=editor-definicion-trabajo]');return !!t&&t.tagName==='TEXTAREA'})()")"
check "placeholder de ejemplo en la definición (escritura libre)" "$(ev "(()=>{const t=document.querySelector('[data-testid=editor-definicion-trabajo]');return !!t&&(t.placeholder||'').includes('Rondo')})()")"
check "«Etapa» presente con testid editor-etapas" "$(ev "!!document.querySelector('[data-testid=editor-etapas]')")"
check "«Etapa» = 5 chips del proceso de formación" "$(ev "document.querySelectorAll('[data-testid=editor-etapas] > button').length===5")"
check "los 5 chips son marcar/desmarcar (aria-pressed)" "$(ev "[...document.querySelectorAll('[data-testid=editor-etapas] > button')].every(b=>b.getAttribute('aria-pressed')==='false')")"
check "título del selector dice multiselección" "$(ev "document.body.innerText.toLowerCase().includes('multiselección')")"

echo "=== 4 · Posición: el bloque nuevo justo debajo de Intensidad ==="
check "Definición vive DEBAJO de Intensidad en el DOM" "$(ev "(()=>{const i=[...document.querySelectorAll('h1,h2,h3,div,p,span')].find(e=>e.children.length===0&&e.textContent.trim().startsWith('Intensidad'));const d=document.querySelector('[data-testid=editor-definicion-trabajo]');return !!i&&!!d&&!!(i.compareDocumentPosition(d)&Node.DOCUMENT_POSITION_FOLLOWING)})()")"
check "«Etapa» queda entre la definición y «Reglas de provocación»" "$(ev "(()=>{const d=document.querySelector('[data-testid=editor-definicion-trabajo]');const e=document.querySelector('[data-testid=editor-etapas]');const r=[...document.querySelectorAll('h1,h2,h3,div,p,span')].find(x=>x.children.length===0&&x.textContent.includes('Reglas de provocación'));return !!d&&!!e&&!!r&&!!(d.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(e.compareDocumentPosition(r)&Node.DOCUMENT_POSITION_FOLLOWING)})()")"

echo "=== 5 · Cerrar SIN guardar ==="
$AB key Escape >/dev/null 2>&1
sleep 1
if [ "$(ev "!!document.querySelector('[data-testid=editor-definicion-trabajo]')")" = "true" ]; then
  ev "(()=>{const b=[...document.querySelectorAll('button')].find(x=>['Cancelar','Cerrar','×','✕'].includes(x.textContent.trim()));if(b){b.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
  sleep 1
fi
check "editor cerrado sin escribir nada" "$(ev "!document.querySelector('[data-testid=editor-definicion-trabajo]')")"

echo "=== 6 · Sello SOLO-LECTURA (la BD no cambia) ==="
S_DESPUES=$(ev "fetch('/api/pilar2/tasks').then(r=>r.json()).then(d=>d.tasks.length)")
DESPUES=$(echo "$S_DESPUES" | tr -d '[:space:]')
echo "  · tareas antes=$ANTES después=$DESPUES"
check "recuento intacto ($ANTES → $DESPUES)" "$([ "$ANTES" = "$DESPUES" ] && echo 1 || echo 0)"

echo
echo "════════ SONDA EDITOR PRODUCCIÓN: PASS=$PASS FAIL=$FAIL ════════"
if [ "$FAIL" = "0" ]; then echo "VERDE"; else echo "HAY FALLOS"; fi
