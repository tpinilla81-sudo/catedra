#!/bin/bash
# E2E UI LOCAL — ANÁLISIS CUALITATIVO/CUANTITATIVO + EDITOR DE TAREAS + FICHA DINÁMICA
# (mock del míster: SidebarNav «Análisis Cualitativo» sustituye a Suite Táctica +
# «Análisis Cuantitativo» debajo · EditorTarea con Sección de Trabajo, Etapas del
# Proceso de Formación y Taxonomía Nivel 3 multiselección cruzada ·
# FichaRendimiento con métricas dinámicas «+ Añadir» · posiciones PD/PO)
# · login demo móvil 414 → sidebar nuevo (sin «Suite Táctica»)
# · /dashboard/suite redirige a /dashboard/analisis-cualitativo (Suite intacta)
# · /dashboard/analisis-cuantitativo con radiografía REAL (4 contadores)
# · editor: guardar tarea con comentarios + 2 etapas + 3 chips Nivel 3 →
#   persistencia en BD (Task.workComments/etapasFormacion/nivel3Ids) →
#   detalle completo → edición (quitar etapa) → re-verificación
# · Ficha: añadir métrica dinámica «Cambio de Dirección» (fila 9, score 5→7) →
#   guardar → recargar → persistida (JSON techo 16 por bloque)
# · Suite Plantilla sigue en 4 bloques × 6 métricas (slice intacto)
# · selector de demarcación incluye PO · Pivote ofensivo (alias PD → DM)
# · capturas móvil/desktop verificadas · auto-limpieza (tarea de prueba + snapshot)
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

# ---------- Snapshot BD (para restaurar al final) ----------
UNIQ="E2E$(date +%s)"
echo "=== 0 · snapshot de la Ficha del jugador demo (para restaurar) ==="
PLAYER_ID=$(export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.player.findFirst({where:{isActive:true},orderBy:{shirtNumber:'asc'},select:{id:true,firstName:true}})
.then(r=>{console.log(r?r.id:'NONE');process.exit(0)}).catch(()=>console.log('NONE'))" 2>/dev/null)
check "jugador demo local ($PLAYER_ID)" "$([ "$PLAYER_ID" != "NONE" ] && [ -n "$PLAYER_ID" ] && echo 1)"
export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.playerEvaluation.findUnique({where:{playerId:'$PLAYER_ID'}})
.then(r=>{require('fs').writeFileSync('/tmp/eval-snapshot.json', r?JSON.stringify(r.data):'');console.log('snapshot:', r?'OK':'sin evaluación previa');process.exit(0)})" 2>&1 | tail -1

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

echo "=== 2 · sidebar: «Análisis Cualitativo» + «Análisis Cuantitativo» ==="
OLD=$(ev "Array.from(document.querySelectorAll('nav a')).some(a=>a.textContent.includes('Suite Táctica'))")
check "la etiqueta «Suite Táctica» ya NO existe" "$([ "$OLD" = "false" ] && echo 1)"
CUAL=$(ev "(()=>{const a=Array.from(document.querySelectorAll('nav a')).find(a=>a.textContent.includes('Análisis Cualitativo'));return a?((a.getAttribute('href')==='/dashboard/analisis-cualitativo')+'|'+(!!a.querySelector('svg'))):'no'})()")
echo "$CUAL" | rg -q "^true\|true$" && ok "«Análisis Cualitativo» → /dashboard/analisis-cualitativo (con icono)" || bad "cualitativo ('$CUAL')"
CUANT=$(ev "(()=>{const links=Array.from(document.querySelectorAll('nav a'));const i=links.findIndex(a=>a.textContent.includes('Análisis Cualitativo'));const n=links[i+1];return n?(n.textContent.includes('Análisis Cuantitativo')&&n.getAttribute('href')==='/dashboard/analisis-cuantitativo')+'|'+(!!n.querySelector('svg')):'no'})()")
echo "$CUANT" | rg -q "^true\|true$" && ok "«Análisis Cuantitativo» JUSTO DEBAJO (con icono)" || bad "cuantitativo ('$CUANT')"

echo "=== 3 · /dashboard/suite redirige al Análisis Cualitativo (Suite intacta) ==="
$AB open "$BASE/dashboard/suite" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-root]')" 30
sleep 1.5
URL1=$(ev "location.pathname")
[ "$URL1" = "/dashboard/analisis-cualitativo" ] && ok "redirección a $URL1" || bad "ruta ('$URL1')"
check "suite-root monta" "$(ev "!!document.querySelector('[data-testid=suite-root]')")"
NTABS=$(ev "['directo','biblioteca','plantilla','abp'].filter(t=>!!document.querySelector('[data-testid=suite-tab-'+t+']')).length")
check "4 pestañas de la nav maestra intactas" "$([ "$NTABS" = "4" ] && echo 1)"
$AB eval "document.querySelector('[data-testid=suite-crono-toggle]').click()" >/dev/null 2>&1
sleep 2.2
RUN=$(ev "(document.querySelector('[data-testid=suite-crono]')||{}).textContent||''")
echo "$RUN" | rg -q "^00:0[1-9]$" && ok "crono de la Suite sigue vivo ($RUN)" || bad "crono ('$RUN')"
$AB eval "document.querySelector('[data-testid=suite-crono-toggle]').click()" >/dev/null 2>&1
sleep 0.3
$AB eval "document.querySelector('[data-testid=suite-crono-reset]').click()" >/dev/null 2>&1

echo "=== 4 · Análisis Cuantitativo: radiografía REAL ==="
$AB open "$BASE/dashboard/analisis-cuantitativo" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=cuant-root]')" 20
check "cuant-root monta" "$(ev "!!document.querySelector('[data-testid=cuant-root]')")"
T2=$(ev "(document.querySelector('[data-testid=cuant-title]')||{}).textContent||''")
echo "$T2" | rg -q "Análisis Cuantitativo" && ok "cabecera ($T2)" || bad "título ('$T2')"
check "chip «Módulo en preparación»" "$(ev "((document.querySelector('[data-testid=cuant-chip]')||{}).textContent||'').includes('Módulo en preparación')")"
NSTAT=$(ev "['partidos','telemetria','evaluaciones','tareas'].filter(s=>{const el=document.querySelector('[data-testid=cuant-stat-'+s+']');if(!el)return false;const n=parseInt((el.textContent.match(/(\d+)/)||[])[1]);return Number.isFinite(n)&&n>=0}).length")
check "4 contadores con número válido (≥0)" "$([ "$NSTAT" = "4" ] && echo 1)"
TELEMETRIA=$(ev "(()=>{const el=document.querySelector('[data-testid=cuant-value-telemetria]');if(!el)return 'x';const n=parseInt(el.textContent.trim(),10);return Number.isFinite(n)&&n>=0?String(n):'x'})()")
[ "$TELEMETRIA" != "x" ] 2>/dev/null && ok "telemetría real: $TELEMETRIA eventos" || bad "telemetría ('$TELEMETRIA')"

echo "=== 5 · Editor de Tareas: Sección de Trabajo + Etapas + Nivel 3 ==="
$AB open "$BASE/dashboard/library" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=library-root],main')" 20
sleep 1
# pestaña Tareas (grid-cols-3 de pestañas)
$AB eval "(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.replace(/\d+$/,'').trim()==='Tareas'&&x.closest('.grid-cols-3'));if(b){b.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
sleep 0.8
# botón «Tarea» de la cabecera (crea)
$AB eval "(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='Tarea');if(b){b.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=editor-seccion-trabajo]')" 15
check "sheet del editor abre" "$(ev "!!document.querySelector('[data-testid=editor-seccion-trabajo]')")"
check "«¿Para qué sirve?» visible" "$(ev "!!document.querySelector('[data-testid=editor-para-que-sirve]')")"
check "«Comentarios sobre el Trabajo» visible" "$(ev "!!document.querySelector('[data-testid=editor-comentarios]')")"
NETAPA=$(ev "Array.from({length:5},(_,i)=>!!document.querySelector('[data-testid=editor-etapa-'+i+']')).filter(Boolean).length")
check "5 etapas del Proceso de Formación" "$([ "$NETAPA" = "5" ] && echo 1)"
E0=$(ev "(document.querySelector('[data-testid=editor-etapa-0]')||{}).textContent||''")
echo "$E0" | rg -q "Fase de Iniciación \(Benjamín y Alevín\)" && ok "etapa EXACTA del mock (Iniciación)" || bad "etapa 0 ('$E0')"
NN3=$(ev "Object.keys(TASK_TAXONOMY_LEVEL3||{}).length" )
NCHIPS=$(ev "document.querySelectorAll('[data-testid^=editor-nivel3-]').length")
check "27 chips de Taxonomía Nivel 3" "$([ "$NCHIPS" = "27" ] && echo 1)"

# rellenar y guardar
$AB eval "(()=>{const inp=document.querySelector('input[placeholder^=\"Título\"]');const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(inp,'Tarea $UNIQ Prueba Rondos');inp.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
$AB eval "(()=>{const ta=document.querySelector('[data-testid=editor-para-que-sirve]');const s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;s.call(ta,'Automatizar el $UNIQ: objetivo de la prueba E2E del editor.');ta.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
$AB eval "(()=>{const ta=document.querySelector('[data-testid=editor-comentarios]');const s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;s.call(ta,'Comentarios del $UNIQ: variación con comodines y 2 toques por jugador.');ta.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
# fase del juego (dentro del sheet, botón aria-pressed «Organización Ofensiva»)
$AB eval "(()=>{const sc=document.querySelector('[data-slot=sheet-content]');const b=sc&&Array.from(sc.querySelectorAll('button[aria-pressed]')).find(x=>x.textContent.includes('Organización Ofensiva'));if(b){b.click();return 'ok'}return 'nofase'})()" >/dev/null 2>&1
# familia Nivel 2 (regresión: sigue ahí)
$AB eval "document.querySelector('[data-testid=editor-family-TEC_PASE_CONTROL]').click()" >/dev/null 2>&1
# 2 etapas (0 y 2) — UNA por eval: los clics síncronos en bloque sufren el
# stale-closure de React (cada onClick lee el draft de SU render) y el último
# tapa a los demás.
$AB eval "document.querySelector('[data-testid=editor-etapa-0]').click()" >/dev/null 2>&1
sleep 0.4
$AB eval "document.querySelector('[data-testid=editor-etapa-2]').click()" >/dev/null 2>&1
sleep 0.4
# 3 chips Nivel 3 de 3 bloques distintos (cruzada) — también uno por eval
$AB eval "document.querySelector('[data-testid=editor-nivel3-int_rondos]').click()" >/dev/null 2>&1
sleep 0.4
$AB eval "document.querySelector('[data-testid=editor-nivel3-psi_confianza]').click()" >/dev/null 2>&1
sleep 0.4
$AB eval "document.querySelector('[data-testid=editor-nivel3-fis_velocidad]').click()" >/dev/null 2>&1
sleep 0.4
CNT=$(ev "((document.querySelector('[data-testid=editor-nivel3-count]')||{}).textContent||'').trim()")
echo "$CNT" | rg -q "^3 categorías Nivel 3 marcadas" && ok "contador Nivel 3 ($CNT)" || bad "contador ('$CNT')"
$AB eval "(()=>{const sc=document.querySelector('[data-slot=sheet-content]');const b=sc&&Array.from(sc.querySelectorAll('button')).find(x=>x.textContent.trim()==='Crear tarea');if(b){b.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
waitfor "!document.querySelector('[data-testid=editor-seccion-trabajo]')" 15
sleep 1.5
TOASTC=$(ev "(document.querySelector('[data-sonner-toast]')||{}).textContent||''")
[ -n "$TOASTC" ] && echo "  · toast: $TOASTC"

echo "=== 6 · Persistencia en BD + detalle + edición ==="
TASK_JSON=$(export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.task.findFirst({where:{title:{contains:'$UNIQ'}},select:{title:true,objective:true,workComments:true,etapasFormacion:true,nivel3Ids:true,family:true}})
.then(r=>{console.log(r?JSON.stringify(r):'NONE');process.exit(0)})" 2>/dev/null)
[ "$TASK_JSON" != "NONE" ] && ok "fila Task creada en BD" || bad "task no encontrada"
python3 - "$TASK_JSON" <<'EOF'
import json, sys
try:
    t = json.loads(sys.argv[1])
    assert t["objective"].startswith("Automatizar el"), f"objective: {t['objective'][:60]}"
    assert "$UNIQ: variación" in t["workComments"] or "variación con comodines" in t["workComments"], f"workComments: {t['workComments'][:60]}"
    assert t["etapasFormacion"] == [
        "Fase de Iniciación (Benjamín y Alevín)",
        "Fase de Perfeccionamiento (Cadete y Juvenil 1º año)",
    ], f"etapas: {t['etapasFormacion']}"
    assert t["nivel3Ids"] == ["fis_velocidad", "psi_confianza", "int_rondos"], f"nivel3 (orden del mock): {t['nivel3Ids']}"
    assert t["family"] == "TEC_PASE_CONTROL", f"family: {t['family']}"
    print("campos OK: objective + workComments + 2 etapas + 3 nivel3 (orden mock) + familia")
except Exception as e:
    print(f"FALLO BD: {e}")
    sys.exit(1)
EOF
[ $? = 0 ] && ok "BD: Sección de Trabajo + Etapas + Nivel 3 exactos (orden del catálogo)" || bad "validación BD"
# abrir el detalle — la tarjeta vive DENTRO del árbol Nivel 3 (render perezoso):
# la búsqueda la auto-expande (experiencia real del míster) y luego se clica
$AB eval "(()=>{const inp=document.querySelector('input[placeholder^=\"Buscar tarea\"]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,'Tarea $UNIQ');inp.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
sleep 1.2
$AB eval "(()=>{const c=document.querySelector('[aria-label^=\"Abrir ficha de la tarea Tarea $UNIQ\"]');if(c){c.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=task-detail-comentarios]')" 12
check "detalle: comentarios visibles" "$(ev "((document.querySelector('[data-testid=task-detail-comentarios]')||{}).textContent||'').includes('variación con comodines')")"
NET=$(ev "document.querySelectorAll('[data-testid=task-detail-etapas] span').length")
check "detalle: 2 chips de etapa" "$([ "$NET" = "2" ] && echo 1)"
NN3D=$(ev "document.querySelectorAll('[data-testid=task-detail-nivel3] span.rounded-lg').length")
check "detalle: 3 chips Nivel 3" "$([ "$NN3D" = "3" ] && echo 1)"
D3=$(ev "(document.querySelector('[data-testid=task-detail-nivel3]')||{}).textContent||''")
echo "$D3" | rg -q "Confianza" && echo "$D3" | rg -q "Psicológicas" && echo "$D3" | rg -q "Rondos" && ok "chips con nombre + bloque (Confianza · Psicológicas · Rondos)" || bad "chips nivel3 ('$D3' | head)"
# EDITAR: quitar etapa 0 y guardar
$AB eval "(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.includes('Editar ficha'));if(b){b.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=editor-seccion-trabajo]')" 12
sleep 0.5
PRE=$(ev "((document.querySelector('[data-testid=editor-comentarios]')||{}).value||'')")
echo "$PRE" | rg -q "variación con comodines" && ok "editor abre CON los datos guardados" || bad "comentarios no cargados ('$PRE')"
ET0=$(ev "document.querySelector('[data-testid=editor-etapa-0]')?.getAttribute('aria-pressed')")
[ "$ET0" = "true" ] && ok "etapa 0 marcada al reabrir" || bad "etapa 0 ('$ET0')"
$AB eval "document.querySelector('[data-testid=editor-etapa-0]').click()" >/dev/null 2>&1
$AB eval "(()=>{const sc=document.querySelector('[data-slot=sheet-content]');const b=sc&&Array.from(sc.querySelectorAll('button')).find(x=>x.textContent.trim()==='Guardar cambios');if(b){b.click();return 'ok'}return 'no'})()" >/dev/null 2>&1
waitfor "!document.querySelector('[data-testid=editor-seccion-trabajo]')" 15
sleep 1.5
ET_POST=$(export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.task.findFirst({where:{title:{contains:'$UNIQ'}},select:{etapasFormacion:true}})
.then(r=>{console.log(JSON.stringify(r.etapasFormacion));process.exit(0)})" 2>/dev/null)
echo "$ET_POST" | rg -q "Fase de Perfeccionamiento" && ! echo "$ET_POST" | rg -q "Iniciación" && ok "edición persistida: queda 1 etapa (Perfeccionamiento)" || bad "etapas tras editar ('$ET_POST')"

echo "=== 7 · Ficha de Rendimiento: métrica DINÁMICA «+ Añadir» ==="
$AB open "$BASE/dashboard/players/$PLAYER_ID" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=eval-root]')" 25
NBASE=$(ev "document.querySelectorAll('[data-testid^=eval-metric-fisicas-]').length")
check "bloque Físicas arranca con 8 métricas" "$([ "$NBASE" = "8" ] && echo 1)"
check "input «Añadir nueva métrica...» en el bloque" "$(ev "!!document.querySelector('[data-testid=eval-addinput-fisicas]')")"
$AB eval "(()=>{const i=document.querySelector('[data-testid=eval-addinput-fisicas]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'Cambio de Dirección');i.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
$AB eval "document.querySelector('[data-testid=eval-addbtn-fisicas]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=eval-metric-fisicas-8]')" 10
NEWT=$(ev "(()=>{const r=document.querySelector('[data-testid=eval-metric-fisicas-8]');if(!r)return 'no';const s=document.querySelector('[data-testid=eval-score-fisicas-8]');const i=document.querySelector('[data-testid=eval-label-input-fisicas-8]');return (i?i.value.includes('Cambio de Dirección'):(r.textContent.includes('Cambio de Dirección')))+'|'+(s?s.textContent.trim():'?')})()")
echo "$NEWT" | rg -q "^true\|5$" && ok "fila 9 añadida con label y nota 5" || bad "métrica nueva ('$NEWT')"
$AB eval "document.querySelector('[data-testid=eval-plus-fisicas-8]').click();document.querySelector('[data-testid=eval-plus-fisicas-8]').click();'ok'" >/dev/null 2>&1
sleep 0.4
S7=$(ev "(document.querySelector('[data-testid=eval-score-fisicas-8]')||{}).textContent||''")
[ "$S7" = "7" ] && ok "stepper sube la nueva métrica a 7" || bad "score ('$S7')"
G0=$(ev "(document.querySelector('[data-testid=eval-global-score]')||{}).textContent||''")
$AB eval "document.querySelector('[data-testid=eval-save]').click()" >/dev/null 2>&1
waitfor "!!document.querySelector('[data-sonner-toast],.sonner-toast,[data-testid=eval-state]')" 10
sleep 1.5
# recarga → persistida
$AB open "$BASE/dashboard/players/$PLAYER_ID" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=eval-root]')" 25
sleep 1
PERS=$(ev "(()=>{const r=document.querySelector('[data-testid=eval-metric-fisicas-8]');const s=document.querySelector('[data-testid=eval-score-fisicas-8]');const i=document.querySelector('[data-testid=eval-label-input-fisicas-8]');return r?((i?i.value.includes('Cambio de Dirección'):(r.textContent.includes('Cambio de Dirección')))+'|'+(s?s.textContent.trim():'?')):'no'})()")
echo "$PERS" | rg -q "^true\|7$" && ok "tras recargar sigue (score 7) — persistida en el JSON" || bad "persistencia ('$PERS')"
NBLK=$(ev "['fisicas','tecnica','inteligencia','psicologicos','principios','actitud'].filter(b=>!!document.querySelector('[data-testid=eval-block-'+b+']')).length")
check "6 bloques intactos" "$([ "$NBLK" = "6" ] && echo 1)"

echo "=== 8 · Suite Plantilla: sigue 4 bloques × 6 métricas (slice) ==="
$AB open "$BASE/dashboard/analisis-cualitativo" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-root]')" 25
$AB eval "document.querySelector('[data-testid=suite-tab-plantilla]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-player-0]')" 15
NB=$(ev "['fisicas','tecnica','inteligencia','psicologicos'].filter(b=>!!document.querySelector('[data-testid=suite-bloque-'+b+']')).length")
NM=$(ev "['fisicas','tecnica','inteligencia','psicologicos'].reduce((a,b)=>a+document.querySelectorAll('[data-testid^=suite-metric-'+b+'-]').length,0)")
check "4 bloques × 6 métricas (las dinámicas NO invaden la Suite)" "$([ "$NB" = "4" ] && [ "$NM" = "24" ] && echo 1)"

echo "=== 9 · Demarcación PO · Pivote ofensivo (alias PD→DM) ==="
CNT_PRE=$(export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.player.count({where:{teamId:{not:null}}}).then(c=>{console.log(c);process.exit(0)})" 2>/dev/null)
$AB open "$BASE/dashboard/players" >/dev/null 2>&1
waitfor "document.querySelector('[aria-label=\"Añadir jugador nuevo\"]')" 20
$AB eval "document.querySelector('[aria-label=\"Añadir jugador nuevo\"]').click()" >/dev/null 2>&1
waitfor "document.querySelector('#primary-position')" 12
POOPT=$(ev "(()=>{const sel=document.querySelector('#primary-position');const o=sel&&Array.from(sel.options).find(x=>x.value==='PO');return o?o.textContent.trim():'no'})()")
[ "$POOPT" = "PO · Pivote ofensivo" ] && ok "opción PO en el selector ($POOPT)" || bad "PO ('$POOPT')"
PDOPT=$(ev "(()=>{const sel=document.querySelector('#primary-position');const o=sel&&Array.from(sel.options).find(x=>x.value==='DM');return o?o.textContent.trim():'no'})()")
[ "$PDOPT" = "DM · Pivote defensivo" ] && ok "PD resuelve como DM (Pivote defensivo)" || bad "DM ('$PDOPT')"
$AB press Escape >/dev/null 2>&1
sleep 0.8
CNT_POST=$(export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.player.count({where:{teamId:{not:null}}}).then(c=>{console.log(c);process.exit(0)})" 2>/dev/null)
[ "$CNT_PRE" = "$CNT_POST" ] && ok "diálogo cerrado SIN crear jugador (BD intacta: $CNT_POST)" || bad "jugador creado por accidente ($CNT_PRE→$CNT_POST)"

echo "=== 10 · capturas (móvil + desktop) ==="
$AB set viewport 414 896 >/dev/null 2>&1
sleep 0.8
$AB open "$BASE/dashboard/analisis-cualitativo" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-root]')" 25
$AB screenshot /tmp/ana-mobile-cualitativo.png >/dev/null 2>&1 && ok "captura móvil (Cualitativo/Suite)"
$AB open "$BASE/dashboard/analisis-cuantitativo" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=cuant-root]')" 20
$AB screenshot /tmp/ana-mobile-cuantitativo.png >/dev/null 2>&1 && ok "captura móvil (Cuantitativo)"
$AB set viewport 1440 900 >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/ana-desktop-cuantitativo.png >/dev/null 2>&1 && ok "captura desktop (Cuantitativo)"
$AB open "$BASE/dashboard/players/$PLAYER_ID" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=eval-root]')" 25
sleep 1
$AB screenshot /tmp/ana-desktop-ficha.png >/dev/null 2>&1 && ok "captura desktop (Ficha dinámica)"
python3 - <<'EOF'
from PIL import Image
import sys
bad = []
for p in ["/tmp/ana-mobile-cualitativo.png", "/tmp/ana-mobile-cuantitativo.png", "/tmp/ana-desktop-cuantitativo.png", "/tmp/ana-desktop-ficha.png"]:
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
sys.exit(1 if bad else 0)
EOF
[ $? = 0 ] && ok "las 4 capturas tienen contenido" || bad "captura en blanco"

echo "=== 11 · auto-limpieza (BD como estaba) ==="
export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  const del=await p.task.deleteMany({where:{title:{contains:'$UNIQ'}}});
  console.log('tareas de prueba eliminadas:',del.count);
  const snap=require('fs').readFileSync('/tmp/eval-snapshot.json','utf8');
  if(snap){
    const pl=await p.player.findUnique({where:{id:'$PLAYER_ID'},select:{clubId:true,teamId:true}});
    await p.playerEvaluation.upsert({where:{playerId:'$PLAYER_ID'},create:{clubId:pl.clubId,teamId:pl.teamId,playerId:'$PLAYER_ID',data:JSON.parse(snap)},update:{data:JSON.parse(snap)}});
    console.log('ficha del jugador restaurada al snapshot');
  }else{
    const d=await p.playerEvaluation.deleteMany({where:{playerId:'$PLAYER_ID'}});
    console.log('ficha de prueba eliminada:',d.count,'(el jugador no tenía evaluación previa)');
  }
  await p.\$disconnect();
})().catch(e=>{console.error('LIMPIEZA FALLO:',e.message.slice(0,120));process.exit(1)})" 2>&1 | tail -2
LEFT=$(export DATABASE_URL="$DBURL"; node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.task.count({where:{title:{contains:'$UNIQ'}}}).then(c=>{console.log(c);process.exit(0)})" 2>/dev/null)
[ "$LEFT" = "0" ] && ok "catálogo de tareas sin residuos" || bad "tarea residual ($LEFT)"

echo ""
echo "=============================="
echo "RESULTADO: PASS=$PASS FAIL=$FAIL  ($BASE)"
[ "$FAIL" = "0" ] && echo "ANÁLISIS CUALITATIVO+CUANTITATIVO / EDITOR / FICHA DINÁMICA VERDE ✓" || echo "ROJO ✗"
exit 0
