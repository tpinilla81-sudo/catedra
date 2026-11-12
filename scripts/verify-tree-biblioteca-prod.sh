#!/bin/bash
# E2E UI EN PRODUCCIÓN — BIBLIOTECA: ÁRBOL OFICIAL DE TAREAS (variante SOLO-LECTURA)
#   [ TAREAS DE ENTRENAMIENTO EN FÚTBOL ] → 1. CLASIFICACIÓN GENERAL →
#   5 bloques → 27 categorías Nivel 3 → tarjetas de tareas
# Contra https://catedra-sooty.vercel.app con la cuenta demo.
# NADA DE ESCRITURA: solo navegación, expandir/colapsar, búsqueda client-side,
# abrir fichas (lectura) y GET a la API. La BD de producción JAMÁS se toca.
set -uo pipefail
cd /home/z/my-project

PROD="${1:-https://catedra-sooty.vercel.app}"
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
  for i in $(seq 1 "${2:-20}"); do
    [ "$(ev "!!($1)")" = "true" ] && return 0
    sleep 1
  done
  return 1
}

SHOTS=/home/z/my-project/prod-shots
mkdir -p "$SHOTS"

echo "=== 1 · login demo (móvil 414×896) · $PROD ==="
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
check "login demo: aterrizaje con sesión (formulario fuera)" "$(ev "!document.body.innerText.includes('Email del cuerpo técnico')")"

echo "=== 2 · Biblioteca: el ÁRBOL sustituye al grid plano ==="
# La Biblioteca aterriza en la pestaña «Taxonomía»: el árbol vive en «Tareas»
$AB open "$PROD/dashboard/library" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
$AB eval "(()=>{const b=[...document.querySelectorAll('button,[role=tab]')].find(x=>/^Tareas/.test(x.textContent.trim()));if(b)b.click();return !!b})()" >/dev/null 2>&1
waitfor 'document.querySelector("[data-testid=tasks-tree]")' || true
check "data-testid tasks-tree presente" "$(ev "!!document.querySelector('[data-testid=tasks-tree]')")"
check "raíz «TAREAS DE ENTRENAMIENTO EN FÚTBOL» (uppercase del mock)" "$(ev "document.querySelector('[data-testid=tree-root]').innerText.includes('TAREAS DE ENTRENAMIENTO EN FÚTBOL')")"
check "subtítulo «organización oficial por clasificación general»" "$(ev "document.querySelector('[data-testid=tree-root]').innerText.includes('organización oficial por clasificación general')")"

echo "=== 3 · 1. CLASIFICACIÓN GENERAL abierta por defecto + 5 bloques ==="
check "«1. CLASIFICACIÓN GENERAL» visible y ABIERTA" "$(ev "(()=>{const b=[...document.querySelectorAll('[data-testid=tree-root] button')].find(x=>x.textContent.includes('1. CLASIFICACIÓN GENERAL'));return !!b&&b.getAttribute('aria-expanded')==='true'})()")"
check "los 5 bloques como filas (Físicas/Técnicas/Tácticas/Psicológicas/Integradas)" "$(ev "(()=>{const t=document.querySelector('[data-testid=tree-root]').innerText;return ['FÍSICAS','TÉCNICAS','TÁCTICAS','PSICOLÓGICAS','INTEGRADAS O GLOBALES'].every(b=>t.includes(b))})()")"
check "categorías CERRADAS por defecto (árbol en reposo)" "$(ev "document.querySelectorAll('[data-testid=tree-cat]').length===0")"

echo "=== 4 · Expandir todo → 27 categorías EXACTAS ==="
$AB find first '[data-testid="tree-expand-all"]' click >/dev/null 2>&1
sleep 1.5
check "27 hojas tree-cat en el DOM" "$(ev "document.querySelectorAll('[data-testid=tree-cat]').length===27")"
IDSesperados="fis_coordinacion,fis_flexibilidad,fis_fuerza,fis_resistencia,fis_velocidad,int_condicionados,int_conservacion,int_posicion,int_reales,int_reducidos,int_rondos,psi_cohesion,psi_concentracion,psi_confianza,psi_emocional,psi_motivacion,tac_defensiva,tac_estrategia,tac_ofensiva,tac_transiciones,tec_conduccion,tec_control,tec_entrada,tec_juego_aereo,tec_pase,tec_regate,tec_tiro"
IDSgot="$(ev "[...document.querySelectorAll('[data-testid=tree-cat]')].map(n=>n.dataset.cat).sort().join(',')")"
check "los 27 data-cat EXACTOS del catálogo" "$([ "$IDSgot" = "$IDSesperados" ] && echo 1 || echo 0)"
check "nombres de hoja literales (Fuerza · Juego aéreo · Entrada · Gestión emocional · Situaciones reales de juego)" "$(ev "(()=>{const t=document.querySelector('[data-testid=tree-root]').innerText;return ['Fuerza','Juego aéreo','Entrada','Gestión emocional','Situaciones reales de juego'].every(n=>t.includes(n))})()")"

echo "=== 5 · Tareas existentes colgadas de su categoría (backfill) ==="
ROOTN="$(ev "(document.querySelector('[data-testid=tree-root]').innerText.match(/(\\d+) tareas? en el catálogo/)||[])[1]")"
[ -z "$ROOTN" ] && ROOTN="-1"
CARDS="$(ev "document.querySelectorAll('[data-testid=tree-root] button[aria-label^=\"Abrir ficha de la tarea\"]').length")"
UNIQ="$(ev "new Set([...document.querySelectorAll('[data-testid=tree-root] button[aria-label^=\"Abrir ficha de la tarea\"]')].map(b=>b.getAttribute('aria-label'))).size")"
APIJSON="$(ev "fetch('/api/pilar2/tasks').then(r=>r.json()).then(d=>{const ts=d.tasks||[];return JSON.stringify([d.count,ts.filter(t=>(t.nivel3Ids||[]).length>1).length,ts.filter(t=>!(t.nivel3Ids||[]).length).length,new Set(ts.map(t=>t.title)).size])})")"
APIN="$(echo "$APIJSON" | sed 's/^\[//;s/\]$//' | cut -d, -f1)"
MULTI="$(echo "$APIJSON" | sed 's/^\[//;s/\]$//' | cut -d, -f2)"
SINN="$(echo "$APIJSON" | sed 's/^\[//;s/\]$//' | cut -d, -f3)"
APITITLES="$(echo "$APIJSON" | sed 's/^\[//;s/\]$//' | cut -d, -f4)"
check "contador raíz ($ROOTN) == count de la API ($APIN)" "$([ "$ROOTN" = "$APIN" ] && echo 1 || echo 0)"
check "títulos únicos en el árbol ($UNIQ) == títulos únicos en la API ($APITITLES)" "$([ "$UNIQ" = "$APITITLES" ] && echo 1 || echo 0)"
check "tarjetas totales ($CARDS) ≥ únicas ($UNIQ): multiselección cruzada repite tarjetas" "$([ "$CARDS" -ge "$UNIQ" ] && echo 1 || echo 0)"
OUTSIDE="$(ev "[...document.querySelectorAll('button[aria-label^=\"Abrir ficha de la tarea\"]')].filter(b=>!b.closest('[data-testid=tree-root]')).length")"
check "0 tarjetas fuera del árbol (grid plano ya no existe)" "$([ "$OUTSIDE" = "0" ] && echo 1 || echo 0)"
check "multiselección cruzada REAL: $MULTI tareas con ≥2 categorías Nivel 3" "$([ "${MULTI:-0}" -ge 1 ] && echo 1 || echo 0)"
check "sin huérfanas en BD: $SINN tareas sin clasificar (backfill familia+palabras)" "$([ "${SINN:-9}" = "0" ] && echo 1 || echo 0)"
check "nodo «SIN CLASIFICAR» ausente (todo clasificado)" "$(ev "!document.querySelector('[data-testid=tree-root]').innerText.includes('SIN CLASIFICAR')")"
check "hojas vacías con aviso «Sin tareas todavía» (cortesía del árbol)" "$(ev "document.querySelector('[data-testid=tree-root]').innerText.includes('Sin tareas todavía')")"

echo "=== 6 · Expansión/colapso granular ==="
$AB find first '[data-testid="tree-collapse-all"]' click >/dev/null 2>&1
sleep 1
check "«Contraer todo» → 0 hojas visibles" "$(ev "document.querySelectorAll('[data-testid=tree-cat]').length===0")"
check "tras colapsar siguen las 5 filas de bloque (solo cabeceras, sin categorías)" "$(ev "document.querySelector('[data-testid=tree-root]').innerText.includes('FÍSICAS')")"
# Las categorías son renderizado perezoso: abrimos el bloque INTEGRADAS para probar su hoja
$AB eval "(()=>{const b=[...document.querySelectorAll('[data-testid=tree-root] button')].find(x=>x.textContent.includes('INTEGRADAS O GLOBALES'));if(b)b.click();return !!b})()" >/dev/null 2>&1
sleep 1
ANTES="$(ev "(()=>{const b=[...document.querySelectorAll('[data-cat=int_rondos] button')][0];return b?b.getAttribute('aria-expanded'):'?'})()")"
$AB eval "document.querySelector('[data-cat=int_rondos] button').click()" >/dev/null 2>&1
sleep 1
DESPUES="$(ev "(()=>{const b=[...document.querySelectorAll('[data-cat=int_rondos] button')][0];return b?b.getAttribute('aria-expanded'):'?'})()")"
check "categoría Rondos aria-expanded $ANTES → $DESPUES" "$([ "$ANTES" = "false" ] && [ "$DESPUES" = "true" ] && echo 1 || echo 0)"
check "con Rondos abierta hay tarjetas dentro" "$(ev "document.querySelectorAll('[data-cat=int_rondos] button[aria-label^=\"Abrir ficha de la tarea\"]').length>=1")"
$AB eval "document.querySelector('[data-cat=int_rondos] button').click()" >/dev/null 2>&1
sleep 1
check "segundo clic vuelve a colapsar Rondos" "$(ev "document.querySelector('[data-cat=int_rondos] button').getAttribute('aria-expanded')==='false'")"
$AB eval "(()=>{const b=[...document.querySelectorAll('[data-testid=tree-root] button')].find(x=>x.textContent.includes('INTEGRADAS O GLOBALES'));if(b)b.click();return !!b})()" >/dev/null 2>&1
sleep 1
check "cerrar el bloque esconde sus categorías (0 hojas en DOM)" "$(ev "document.querySelectorAll('[data-testid=tree-cat]').length===0")"

echo "=== 7 · Búsqueda auto-expande el árbol ==="
$AB find first 'input[placeholder^="Buscar tarea"]' fill "rondo" >/dev/null 2>&1
sleep 2
check "con árbol colapsado, la búsqueda auto-expande (≥1 hoja visible)" "$(ev "document.querySelectorAll('[data-testid=tree-cat]').length>=1")"
check "la tarjeta coincidente es visible en su hoja" "$(ev "[...document.querySelectorAll('[data-testid=tree-root] button[aria-label^=\"Abrir ficha de la tarea\"]')].some(b=>b.offsetParent!==null)")"
$AB eval "(()=>{const i=document.querySelector('input[placeholder^=\"Buscar tarea\"]');if(!i)return false;const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));return true})()" >/dev/null 2>&1
sleep 1.5
check "al limpiar la búsqueda el árbol vuelve a su reposo (0 hojas)" "$(ev "document.querySelectorAll('[data-testid=tree-cat]').length===0")"
$AB find first '[data-testid="tree-expand-all"]' click >/dev/null 2>&1
sleep 1.5
check "expandir todo tras la búsqueda → 27 hojas otra vez" "$(ev "document.querySelectorAll('[data-testid=tree-cat]').length===27")"

echo "=== 8 · Ficha de tarea (SOLO-LECTURA) ==="
$AB eval "[...document.querySelectorAll('[data-testid=tree-root] button[aria-label^=\"Abrir ficha de la tarea\"]')][0].click()" >/dev/null 2>&1
sleep 2
check "abre el diálogo de detalle de la tarea" "$(ev "!!document.querySelector('[role=dialog]')")"
check "el detalle muestra contenido real (Objetivo/Duración/Nivel 3/Etapas)" "$(ev "(()=>{const d=document.querySelector('[role=dialog]');return !!d&&/OBJETIVO|Duración|NIVEL 3|ETAPAS|Comentarios/i.test(d.innerText)})()")"
$AB press Escape >/dev/null 2>&1
sleep 1
check "Escape cierra el detalle" "$(ev "!document.querySelector('[role=dialog]')")"

echo "=== 9 · Regresión: Suite y Cuantitativo intactos ==="
$AB open "$PROD/dashboard/analisis-cualitativo" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
check "suite-root presente en Análisis Cualitativo" "$(ev "!!document.querySelector('[data-testid=suite-root]')")"
$AB open "$PROD/dashboard/analisis-cuantitativo" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
check "cuant-root con los 4 contadores numéricos" "$(ev "(()=>{const r=document.querySelector('[data-testid=cuant-root]');return !!r&&(r.innerText.match(/\\d+/g)||[]).length>=4})()")"

echo "=== 10 · Capturas (crema/verde, sin página en blanco) ==="
$AB open "$PROD/dashboard/library" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
$AB eval "(()=>{const b=[...document.querySelectorAll('button,[role=tab]')].find(x=>/^Tareas/.test(x.textContent.trim()));if(b)b.click();return !!b})()" >/dev/null 2>&1
waitfor 'document.querySelector("[data-testid=tasks-tree]")' || true
$AB find first '[data-testid="tree-expand-all"]' click >/dev/null 2>&1
sleep 2
$AB screenshot "$SHOTS/tree-prod-movil.png" >/dev/null 2>&1
check "captura móvil del árbol generada" "$([ -s "$SHOTS/tree-prod-movil.png" ] && echo 1 || echo 0)"
$AB set viewport 1440 900 >/dev/null 2>&1
$AB reload >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
$AB eval "(()=>{const b=[...document.querySelectorAll('button,[role=tab]')].find(x=>/^Tareas/.test(x.textContent.trim()));if(b)b.click();return !!b})()" >/dev/null 2>&1
waitfor 'document.querySelector("[data-testid=tasks-tree]")' || true
$AB find first '[data-testid="tree-expand-all"]' click >/dev/null 2>&1
sleep 2
$AB screenshot "$SHOTS/tree-prod-desktop.png" >/dev/null 2>&1
check "captura desktop del árbol generada" "$([ -s "$SHOTS/tree-prod-desktop.png" ] && echo 1 || echo 0)"
for V in movil desktop; do
  NB="$(python3 - "$SHOTS/tree-prod-$V.png" <<'PYEOF'
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('L')
px = list(im.getdata())
no_blancos = sum(1 for p in px if p < 245)
print(1 if no_blancos > len(px)*0.02 else 0)
PYEOF
)"
  check "captura $V con contenido (no en blanco)" "$NB"
done

echo "=== 11 · Sello SOLO-LECTURA ==="
FIN="$(ev "fetch('/api/pilar2/tasks').then(r=>r.json()).then(d=>String(d.count))")"
check "la BD no cambió durante la batería ($ROOTN → $FIN tareas)" "$([ "$FIN" = "$ROOTN" ] && echo 1 || echo 0)"

echo ""
echo "════════ RESULTADO PRODUCCIÓN (solo-lectura): $PASS PASS · $FAIL FAIL ════════"
[ "$FAIL" = "0" ] && echo "VERDE" || echo "HAY FALLOS — revisar arriba"
$AB close >/dev/null 2>&1 || true
exit 0
