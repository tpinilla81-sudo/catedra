#!/bin/bash
# E2E UI LOCAL — BIBLIOTECA: VISTA ÚNICA + BUSCADOR REFORZADO
#   [ TAREAS DE ENTRENAMIENTO EN FÚTBOL ] → 1. CLASIFICACIÓN GENERAL →
#   5 bloques (Físicas/Técnicas/Tácticas/Psicológicas/Integradas) →
#   27 categorías Nivel 3 → tareas (tarjetas)
# · SIN cuadros de estadísticas (Subprincipios/Tareas/Recetas/Fases) — quitados
# · SIN pestañas (Tareas/Taxonomía/Maestra) — el árbol ES la vista única
# · BUSCADOR REFORZADO: multi-palabra Y orden libre, sin acentos, en TODA la
#   ficha (task-search.ts) · barra sticky · contador de resultados · botón ✕
#   · atajo «/» · Esc vacía · resaltado <mark> en título/objetivo
# · 27 hojas presentes · contadores vivos por categoría/bloque/raíz
# · expandir/colapsar (bloques, categorías, Expandir todo/Contraer todo)
# · tareas existentes colgadas de su categoría (backfill Nivel 3)
# · creación desde el editor → la tarea aterriza bajo su categoría (Rondos)
# · Suite (Análisis Cualitativo) intacta · capturas móvil/desktop · auto-limpieza
set -uo pipefail
cd /home/z/my-project

bash scripts/dev-ensure.sh >/dev/null 2>&1

BASE="${1:-http://localhost:3000}"
DBURL="postgresql://postgres:postgres@localhost:5432/metodo"

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

UNIQ="ARB$(date +%s)"

echo "=== 1 · login demo (móvil 414×896) ==="
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
check "login completado" "$([ "$L" = "true" ] && echo 1)"

echo "=== 2 · Biblioteca: el ÁRBOL monta DIRECTO (sin pestañas ni cuadros) ==="
$AB open "$BASE/dashboard/library" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=library-root],main')" 20
sleep 1
check "tasks-tree monta SIN pulsar nada (vista única)" "$(ev "!!document.querySelector('[data-testid=tasks-tree]')")"
check "sin cuadros de estadísticas (Subprincipios/Recetas/Fases)" "$(ev "!Array.from(document.querySelectorAll('p')).some(p=>['Subprincipios','Recetas','Fases cubiertas'].includes(p.textContent.trim()))")"
check "sin barra de pestañas (.grid-cols-3)" "$(ev "!!document.querySelector('.grid-cols-3') === false")"
check "sin pestaña Taxonomía" "$(ev "!Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Taxonomía'||b.textContent.trim().startsWith('Taxonomía '))")"
check "sin pestaña Maestra" "$(ev "!Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Maestra'||b.textContent.trim().startsWith('Maestra '))")"
check "buscador reforzado presente (sticky)" "$(ev "!!document.querySelector('[data-testid=library-search]')")"
ROOT=$(ev "((document.querySelector('[data-testid=tree-root]')||{}).textContent||'').toUpperCase()")
echo "$ROOT" | rg -q "TAREAS DE ENTRENAMIENTO EN FÚTBOL" && ok "raíz «TAREAS DE ENTRENAMIENTO EN FÚTBOL»" || bad "raíz ('$ROOT')"
echo "$ROOT" | rg -q "1\. CLASIFICACIÓN GENERAL" && ok "nodo «1. CLASIFICACIÓN GENERAL»" || bad "clasificación general ausente"
for B in "FÍSICAS" "TÉCNICAS" "TÁCTICAS" "PSICOLÓGICAS" "INTEGRADAS O GLOBALES"; do
  echo "$ROOT" | rg -q "$B" && ok "bloque $B" || bad "bloque $B ausente"
done
# (las hojas se renderizan al expandir su bloque — check de 27 en la sección 4)
check "el grid plano anterior YA NO existe" "$(ev "!document.querySelector('section[aria-label=\"Catálogo de tareas\"]')")"

echo "=== 3 · contadores vivos (raíz = BD) ==="
ROOTCNT=$(ev "(()=>{const el=document.querySelector('[data-testid=tree-root] .bg-white.border-cream-border');const chips=document.querySelectorAll('[data-testid=tree-root] span[aria-label\$=\" tareas\"]');const first=chips[0];return first?(first.textContent.trim()):'x'})()")
DBCNT=$(export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.task.count().then(c=>{console.log(c);process.exit(0)})" 2>/dev/null)
if [ "$ROOTCNT" != "x" ] && [ "$ROOTCNT" = "$DBCNT" ]; then ok "contador de la raíz = tareas en BD ($ROOTCNT)"; else bad "contador raíz ($ROOTCNT) vs BD ($DBCNT)"; fi

echo "=== 4 · expansión: bloques, categorías y controles ==="
$AB eval "(()=>{const b=Array.from(document.querySelectorAll('[data-testid=tasks-tree] button[aria-expanded]')).find(x=>x.textContent.includes('FÍSICAS'));if(b){b.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
sleep 0.5
NFIS=$(ev "Array.from(document.querySelectorAll('[data-testid=tree-cat]')).filter(c=>c.querySelector('button')&&c.textContent.match(/Fuerza|Resistencia|Velocidad|Flexibilidad|Coordinación/)).filter(c=>{const f=c.closest('div.ml-3');return !!f}).length")
[ "$NFIS" -ge 5 ] 2>/dev/null && ok "FÍSICAS expandida muestra sus categorías" || bad "físicas ('$NFIS')"
FUERZA_OPEN=$(ev "(()=>{const cat=Array.from(document.querySelectorAll('[data-testid=tree-cat]')).find(c=>c.textContent.trim().startsWith('Fuerza'));if(!cat)return 'no';const b=cat.querySelector('button[aria-expanded]');if(b){b.click();return b.getAttribute('aria-expanded')}return 'no'})()" )
sleep 0.4
FUERZA_NOW=$(ev "(()=>{const cat=Array.from(document.querySelectorAll('[data-testid=tree-cat]')).find(c=>c.textContent.trim().startsWith('Fuerza'));return cat?cat.querySelector('button[aria-expanded]').getAttribute('aria-expanded'):'no'})()")
[ "$FUERZA_OPEN" = "false" ] && [ "$FUERZA_NOW" = "true" ] && ok "categoría «Fuerza» expande (toggle aria)" || bad "fuerza ($FUERZA_OPEN→$FUERZA_NOW)"

$AB eval "document.querySelector('[data-testid=tree-expand-all]').click()" >/dev/null 2>&1
sleep 0.6
OPENALL=$(ev "(()=>{const bs=Array.from(document.querySelectorAll('[data-testid=tasks-tree] button[aria-expanded]'));const blks=bs.filter(b=>/FÍSICAS|TÉCNICAS|TÁCTICAS|PSICOLÓGICAS|INTEGRADAS/.test(b.textContent));return blks.every(b=>b.getAttribute('aria-expanded')==='true')&&blks.length===5})()")
check "«Expandir todo» abre los 5 bloques" "$OPENALL"
NCAT=$(ev "document.querySelectorAll('[data-testid=tree-cat]').length")
check "27 categorías Nivel 3 en el árbol expandido" "$([ "$NCAT" = "27" ] && echo 1)"
NTARJ=$(ev "document.querySelectorAll('[data-testid=tasks-tree] button[aria-label^=\"Abrir ficha de la tarea\"]').length")
[ "$NTARJ" -ge 1 ] 2>/dev/null && ok "tarjetas del catálogo colgadas del árbol ($NTARJ visibles)" || bad "sin tarjetas en el árbol"
$AB eval "document.querySelector('[data-testid=tree-collapse-all]').click()" >/dev/null 2>&1
sleep 0.4
COLLAPSED=$(ev "(()=>{const bs=Array.from(document.querySelectorAll('[data-testid=tasks-tree] button[aria-expanded]'));const blks=bs.filter(b=>/FÍSICAS|TÉCNICAS|TÁCTICAS|PSICOLÓGICAS|INTEGRADAS/.test(b.textContent));return blks.every(b=>b.getAttribute('aria-expanded')==='false')})()")
check "«Contraer todo» cierra los bloques" "$COLLAPSED"

echo "=== 5 · tareas existentes colgadas de SU categoría (backfill Nivel 3) ==="
ROW=$(export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.task.findFirst({where:{title:{contains:'Rondo'}},orderBy:{createdAt:'asc'},select:{title:true,objective:true,family:true,nivel3Ids:true}})
.then(r=>{console.log(r?JSON.stringify(r):'NONE');process.exit(0)}).catch(()=>console.log('NONE'))" 2>/dev/null)
[ "$ROW" != "NONE" ] && ok "tarea legacy en BD para verificar backfill" || bad "sin tareas legacy en BD"
EXPECTED=$(npx tsx /tmp/derive-one.mts "$ROW" 2>/dev/null)
echo "  · backfill esperado (deriveLevel3Ids): $EXPECTED"
TITLE=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['title'])" "$ROW" 2>/dev/null)
# categorías ESPERADAS: las que el MISMO deriveLevel3Ids de producción asigna
if [ -n "$EXPECTED" ] && [ "$EXPECTED" != "[]" ]; then
  $AB eval "document.querySelector('[data-testid=tree-expand-all]').click()" >/dev/null 2>&1
  sleep 0.6
  for CAT in $(echo "$EXPECTED" | python3 -c "import json,sys;print(' '.join(json.load(sys.stdin)))"); do
    HANGS=$(ev "(()=>{const cat=document.querySelector('[data-cat=$CAT]');if(!cat)return 'nocat';return cat.textContent.includes(${TITLE@Q})})()")
    [ "$HANGS" = "true" ] && ok "«${TITLE:0:34}…» cuelga de $CAT (multiselección)" || bad "tarea NO cuelga de $CAT ('$HANGS')"
  done
  # la primera tarjeta del árbol es clicable → abre la ficha
  CAT0=$(echo "$EXPECTED" | python3 -c "import json,sys;print(json.load(sys.stdin)[0])")
  $AB eval "(()=>{const cat=document.querySelector('[data-cat=$CAT0]');const card=cat&&cat.querySelector('button[aria-label^=\"Abrir ficha de la tarea\"]');if(card){card.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
  DET_OPEN=$(waitfor "document.querySelector('[data-testid=task-detail-comentarios], [data-slot=sheet-content]')" 10; echo $?)
  check "ficha de la tarea abre desde el árbol" "$([ "$DET_OPEN" = "0" ] && echo 1)"
  $AB eval "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))" >/dev/null 2>&1
  sleep 0.8
else
  bad "el backfill no clasificó la tarea (EXPECTED=$EXPECTED)"
fi

echo "=== 6 · BUSCADOR REFORZADO: multi-palabra, sin acentos, resaltado, contador ==="
type_search() {
  $AB eval "(()=>{const inp=document.querySelector('[data-testid=library-search]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,$1);inp.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
}
# 6a · título de la tarea legacy: auto-expande, contador y resaltado <mark>
type_search "${TITLE@Q}"
sleep 1.2
check "contador de resultados visible (search-count)" "$(ev "!!document.querySelector('[data-testid=search-count]')")"
SEARCHHIT=$(ev "(()=>{const cards=Array.from(document.querySelectorAll('[data-testid=tasks-tree] button[aria-label^=\"Abrir ficha de la tarea\"]'));return cards.some(c=>c.getAttribute('aria-label').includes(${TITLE@Q}))})()")
check "búsqueda auto-expande y localiza «${TITLE:0:30}…»" "$SEARCHHIT"
check "coincidencias resaltadas con <mark>" "$(ev "document.querySelectorAll('[data-testid=search-mark]').length > 0")"
# 6b · multi-palabra Y en campos DISTINTOS (título + objetivo), orden libre
T1=$(python3 -c "import json,sys;t=json.loads(sys.argv[1])['title'].split();print(next((w for w in t if len(w)>=4), t[0] if t else ''))" "$ROW" 2>/dev/null)
O1=$(python3 -c "import json,sys;d=json.loads(sys.argv[1]);o=d['objective'];ws=[w.strip('.,;:()«»\"') for w in o.split()];ws=[w for w in ws if len(w)>=5];print(ws[0] if ws else d['title'].split()[0])" "$ROW" 2>/dev/null)
[ -n "$T1" ] && [ -n "$O1" ] && ok "tokens multi-campo extraídos (título: $T1 · objetivo: $O1)" || bad "sin tokens para multi-palabra"
type_search "'$T1 $O1'"
sleep 1.0
MWC=$(ev "(()=>{const c=document.querySelector('[data-testid=search-count]');if(!c)return 'x';const t=c.textContent;return t.includes('Sin resultados')?'0':parseInt(t,10)||'x'})()")
[ "$MWC" != "x" ] && [ "$MWC" != "0" ] 2>/dev/null && ok "multi-palabra Y: «$T1 $O1» encuentra $MWC" || bad "multi-palabra ($MWC)"
type_search "'$O1 $T1'"
sleep 1.0
MWC2=$(ev "(()=>{const c=document.querySelector('[data-testid=search-count]');if(!c)return 'x';const t=c.textContent;return t.includes('Sin resultados')?'0':parseInt(t,10)||'x'})()")
[ "$MWC2" = "$MWC" ] 2>/dev/null && ok "orden libre: «$O1 $T1» = $MWC2 (igual)" || bad "orden libre ($MWC vs $MWC2)"
type_search "'$T1 zzqxvv'"
sleep 1.0
check "token inexistente → «Sin resultados» + CTA limpiar" "$(ev "(()=>{const c=document.querySelector('[data-testid=search-count]');return c?c.textContent.includes('Sin resultados'):false})() && !!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Limpiar búsqueda')")"
# 6c · sin acentos: «organizacion» encuentra la fase «Organización Ofensiva»
type_search "'organizacion'"
sleep 1.0
NOACC=$(ev "(()=>{const c=document.querySelector('[data-testid=search-count]');if(!c)return 'x';const t=c.textContent;return t.includes('Sin resultados')?'0':parseInt(t,10)||'x'})()")
[ "$NOACC" != "x" ] && [ "$NOACC" != "0" ] 2>/dev/null && ok "sin acentos: «organizacion» encuentra $NOACC" || bad "búsqueda sin acentos ($NOACC)"
# 6d · limpiar con el botón ✕
$AB eval "document.querySelector('[data-testid=search-clear]').click()" >/dev/null 2>&1
sleep 0.6
check "botón ✕ vacía la búsqueda (y quita el contador)" "$(ev "document.querySelector('[data-testid=library-search]').value === '' && !document.querySelector('[data-testid=search-count]')")"
# 6e · atajo «/» enfoca · Esc vacía
FOC=$(ev "(()=>{document.activeElement&&document.activeElement.blur();document.dispatchEvent(new KeyboardEvent('keydown',{key:'/',bubbles:true}));return !!document.activeElement&&document.activeElement.getAttribute('data-testid')==='library-search'})()")
check "atajo «/» enfoca el buscador" "$FOC"
type_search "'$T1'"
sleep 0.6
$AB eval "document.querySelector('[data-testid=library-search]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))" >/dev/null 2>&1
sleep 0.5
check "Esc vacía la búsqueda" "$(ev "document.querySelector('[data-testid=library-search]').value === '' && !document.querySelector('[data-testid=search-count]')")"

echo "=== 7 · creación desde el editor → aterriza bajo su categoría ==="
NT0=$(export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.task.count().then(c=>{console.log(c);process.exit(0)})" 2>/dev/null)
$AB eval "(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='Tarea');if(b){b.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=editor-seccion-trabajo]')" 15
$AB eval "(()=>{const inp=document.querySelector('input[placeholder^=\"Título\"]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,'Tarea $UNIQ Árbol');inp.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
$AB eval "(()=>{const ta=document.querySelector('[data-testid=editor-para-que-sirve]');const s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;s.call(ta,'Prueba E2E del árbol $UNIQ: rondo 4v2 con comodines.');ta.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
$AB eval "(()=>{const sc=document.querySelector('[data-slot=sheet-content]');const b=sc&&Array.from(sc.querySelectorAll('button[aria-pressed]')).find(x=>x.textContent.includes('Organización Ofensiva'));if(b){b.click();return 'ok'}return 'nofase'})()" >/dev/null 2>&1
$AB eval "document.querySelector('[data-testid=editor-nivel3-int_rondos]').click()" >/dev/null 2>&1
sleep 0.4
$AB eval "(()=>{const sc=document.querySelector('[data-slot=sheet-content]');const b=sc&&Array.from(sc.querySelectorAll('button')).find(x=>x.textContent.trim()==='Crear tarea');if(b){b.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
waitfor "!document.querySelector('[data-testid=editor-seccion-trabajo]')" 15
sleep 1.5
NT1=$(export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.task.count().then(c=>{console.log(c);process.exit(0)})" 2>/dev/null)
check "fila Task creada en BD ($NT0 → $NT1)" "$([ -n "$NT0" ] && [ -n "$NT1" ] && [ "$NT1" = "$((NT0+1))" ] && echo 1)"
# recargar la biblioteca: el árbol debe tenerla bajo Rondos (int_rondos)
$AB open "$BASE/dashboard/library" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=library-root],main')" 20
sleep 1
# (vista única: no hay pestañas que pulsar)
sleep 1
$AB eval "document.querySelector('[data-testid=tree-expand-all]').click()" >/dev/null 2>&1
sleep 0.6
UNDER_RONDOS=$(ev "(()=>{const cat=document.querySelector('[data-cat=int_rondos]');return cat?cat.textContent.includes('Tarea $UNIQ Árbol'):'nocat'})()")
check "la tarea nueva cuelga de Rondos (int_rondos)" "$UNDER_RONDOS"
ROOTCNT2=$(ev "(()=>{const chips=document.querySelectorAll('[data-testid=tree-root] span[aria-label\$=\" tareas\"]');return chips[0]?chips[0].textContent.trim():'x'})()")
[ -n "$ROOTCNT" ] && [ -n "$ROOTCNT2" ] && [ "$ROOTCNT2" = "$((ROOTCNT+1))" ] 2>/dev/null && ok "contador de la raíz sube a $ROOTCNT2" || bad "contador raíz tras crear ($ROOTCNT2, antes $ROOTCNT)"

echo "=== 8 · Suite (Análisis Cualitativo) intacta ==="
$AB open "$BASE/dashboard/analisis-cualitativo" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-root]')" 25
check "suite-root monta" "$(ev "!!document.querySelector('[data-testid=suite-root]')")"
NTABS=$(ev "['directo','biblioteca','plantilla','abp'].filter(t=>!!document.querySelector('[data-testid=suite-tab-'+t+']')).length")
check "4 pestañas de la nav maestra intactas" "$([ "$NTABS" = "4" ] && echo 1)"

echo "=== 9 · capturas (móvil + desktop, árbol) ==="
$AB open "$BASE/dashboard/library" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=tasks-tree]')" 20
sleep 1
# (vista única: no hay pestañas que pulsar)
sleep 0.5
$AB eval "(()=>{const b=Array.from(document.querySelectorAll('[data-testid=tasks-tree] button[aria-expanded]')).find(x=>x.textContent.includes('FÍSICAS'));if(b){b.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
sleep 0.5
$AB screenshot /tmp/tree-mobile.png >/dev/null 2>&1 && ok "captura móvil (árbol + Físicas)"
$AB set viewport 1440 900 >/dev/null 2>&1
sleep 1
$AB eval "document.querySelector('[data-testid=tree-expand-all]').click()" >/dev/null 2>&1
sleep 0.8
$AB screenshot /tmp/tree-desktop.png >/dev/null 2>&1 && ok "captura desktop (árbol expandido)"
python3 - <<'EOF'
from PIL import Image
bad = []
for p in ["/tmp/tree-mobile.png", "/tmp/tree-desktop.png"]:
    try:
        im = Image.open(p).convert("L")
        px = list(im.getdata())
        ratio = sum(1 for v in px if v < 245) / len(px)
        if ratio < 0.02:
            bad.append(p)
        else:
            print(f"  · {p}: no-blanco {ratio:.1%}")
    except Exception:
        bad.append(p)
if bad:
    print("FALLO capturas: " + ", ".join(bad))
    raise SystemExit(1)
EOF
[ $? = 0 ] && ok "las 2 capturas tienen contenido" || bad "captura en blanco"

echo "=== 10 · auto-limpieza (BD como estaba) ==="
export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  const del=await p.task.deleteMany({where:{title:{contains:'$UNIQ'}}});
  console.log('tareas de prueba eliminadas:', del.count);
  await p.\$disconnect();
})()" 2>&1 | tail -1
NT2=$(export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.task.count().then(c=>{console.log(c);process.exit(0)})" 2>/dev/null)
check "catálogo restaurado ($NT2 tareas)" "$([ "$NT2" = "$NT0" ] && echo 1)"

$AB close >/dev/null 2>&1 || true
echo ""
echo "=============================="
echo "RESULTADO: PASS=$PASS FAIL=$FAIL  ($BASE)"
[ "$FAIL" = "0" ] && echo "ÁRBOL DE LA BIBLIOTECA VERDE ✓" || echo "ÁRBOL DE LA BIBLIOTECA CON FALLOS"
exit "$FAIL"
