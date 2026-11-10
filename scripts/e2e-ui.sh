#!/bin/bash
# E2E UI autocontenido (móvil 414×896 — uso real en banda):
# login → biblioteca → nueva tarea → pizarra (drag, +fase, play) → guardar →
# pestaña Tareas → tarjeta → detalle → persistencia vía API.
set -uo pipefail
cd /home/z/my-project

export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"
export DIRECT_URL="$DATABASE_URL"
export NEXTAUTH_SECRET="cambia-esto-en-produccion"
export NEXTAUTH_URL="http://localhost:3000"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ FALLO: $1"; }
check() { if [ "$2" = "1" ]; then ok "$1"; else bad "$1"; fi }

# eval de agent-browser → "true"/"false"/texto limpio
ev() {
  $AB eval "$1" 2>/dev/null | python3 -c '
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
  $AB --json get box "$1" 2>/dev/null | python3 -c '
import sys, json
try:
    d = json.loads(sys.stdin.read())["data"]
    print(int(d["x"]), int(d["y"]), int(d["width"]), int(d["height"]))
except Exception:
    print("")'
}

echo "=== arranque PG + dev ==="
node scripts/dev-postgres.mjs > /tmp/e2e-pg.log 2>&1 &
for i in $(seq 1 90); do (echo > /dev/tcp/localhost/5432) 2>/dev/null && break; sleep 1; done
(echo > /dev/tcp/localhost/5432) 2>/dev/null && echo "PG listo" || { echo "FALLO PG"; tail -5 /tmp/e2e-pg.log; exit 1; }
./node_modules/.bin/prisma migrate deploy 2>&1 | tail -1
pkill -f "next dev" 2>/dev/null; sleep 1; pkill -9 -f "next dev" 2>/dev/null; sleep 1
nohup ./node_modules/.bin/next dev -p 3000 > /tmp/e2e-dev.log 2>&1 &
for i in $(seq 1 120); do curl -sf -o /dev/null http://localhost:3000/api/auth/csrf && break; sleep 1; done
curl -sf -o /dev/null http://localhost:3000/api/auth/csrf && echo "dev listo" || { echo "FALLO dev"; tail -20 /tmp/e2e-dev.log; exit 1; }

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
# la app aterriza en "/" (Hoy) tras login → esperamos a que desaparezca el form
for i in $(seq 1 25); do
  L=$(ev "!document.querySelector('input[type=email]')")
  [ "$L" = "true" ] && break
  sleep 1
done
URL=$($AB get url 2>/dev/null)
check "login completado (sin form) → $URL" "$([ "$L" = "true" ] && echo 1)"

echo "=== 2 · biblioteca → editor de tarea ==="
$AB open http://localhost:3000/dashboard/library >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
$AB find role button click --name "Tarea" >/dev/null 2>&1
sleep 1
TITLE_OK=$(ev "!!document.querySelector(\"input[placeholder^='Título']\")")
check "editor de ficha abierto (sesión válida)" "$([ "$TITLE_OK" = "true" ] && echo 1)"
$AB find first "input[placeholder^='Título']" fill "TEST UI · Presión con pizarra" >/dev/null 2>&1
$AB find first "textarea[placeholder^='Objetivo']" fill "Objetivo E2E UI: presión tras pérdida con pizarra animada" >/dev/null 2>&1
# fase del juego obligatoria: botón "Organización Ofensiva"
$AB eval "[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.includes('Ofensiva'))?.click(); [...document.querySelectorAll('[role=dialog] button')].filter(b=>b.textContent.includes('Ofensiva')).length" >/dev/null 2>&1
PH=$(ev "[(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>x.getAttribute('aria-pressed')==='true');return b?b.textContent.slice(0,30):'NINGUNA'})()]")
echo "  [dbg] fase marcada: $PH"

echo "=== 3 · crear pizarra + drag + fase + play ==="
$AB find role button click --name "Crear pizarra" >/dev/null 2>&1
sleep 1
CANVAS=$(ev "!!document.querySelector('[role=application]')")
check "canvas del builder visible" "$([ "$CANVAS" = "true" ] && echo 1)"
$AB eval "document.querySelector('[role=application]')?.scrollIntoView({block:'center'})" >/dev/null 2>&1
sleep 0.5
BOX=$(bbox "[role=application]")
read -r BX BY BW BH <<< "$BOX"
CX=$((BX + BW * 8 / 105)); CY=$((BY + BH * 34 / 68))
$AB mouse move "$CX" "$CY" >/dev/null 2>&1
$AB mouse down left >/dev/null 2>&1
$AB mouse move "$((CX + 30))" "$((CY + 12))" >/dev/null 2>&1
$AB mouse move "$((CX + 60))" "$((CY + 25))" >/dev/null 2>&1
$AB mouse up left >/dev/null 2>&1
ok "drag del portero ($CX,$CY → $(($CX + 60)),$(($CY + 25)))"
$AB find role button click --name "+ Fase" >/dev/null 2>&1
sleep 0.5
NFR=$(ev "[...document.querySelectorAll('[aria-label^=\"Ir a la fase\"]')].length")
check "2 fases tras + Fase" "$([ "$NFR" = "2" ] && echo 1)"
$AB find first "input[aria-label='Etiqueta de la fase']" fill "Salida con tercer hombre" >/dev/null 2>&1
$AB find role button click --name "Reproducir la pizarra" >/dev/null 2>&1
sleep 1.2
PLAYING=$(ev "!!document.querySelector('[aria-label=\"Pausar previsualización\"]')")
check "play interpolando" "$([ "$PLAYING" = "true" ] && echo 1)"
$AB find role button click --name "Pausar previsualización" >/dev/null 2>&1
$AB screenshot /tmp/ui-editor-pizarra.png >/dev/null 2>&1 && ok "screenshot del editor"

echo "=== 4 · guardar tarea (la pizarra viaja con la ficha) ==="
$AB eval "document.querySelector(\"input[placeholder^='Título']\")?.scrollIntoView({block:'center'})" >/dev/null 2>&1
$AB find role button click --name "Crear tarea" >/dev/null 2>&1
CLOSED=""
for i in $(seq 1 20); do
  CLOSED=$(ev "!document.querySelector(\"input[placeholder^='Título']\")")
  [ "$CLOSED" = "true" ] && break
  sleep 1
done
check "sheet cerrado tras guardar" "$([ "$CLOSED" = "true" ] && echo 1)"
$AB screenshot /tmp/dbg-save.png >/dev/null 2>&1
echo "  [dbg] toast/estado: $(ev "document.body.innerText.slice(0,300).replace(/\\n/g,'|')")"
# la biblioteca cae en la pestaña Taxonomía → cambiar a "Tareas"
$AB eval "[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Tareas'))?.click()" >/dev/null 2>&1
sleep 1.5
$AB find first "input[placeholder^='Buscar tarea u objetivo']" fill "TEST UI" >/dev/null 2>&1
sleep 2
CARD=$(ev "document.body.innerText.includes('TEST UI · Presión con pizarra')")
check "tarjeta en el catálogo (pestaña Tareas)" "$([ "$CARD" = "true" ] && echo 1)"
$AB screenshot /tmp/ui-tarjeta.png >/dev/null 2>&1
$AB find text "TEST UI · Presión con pizarra" click >/dev/null 2>&1
sleep 1.5
DET=$(ev "document.body.innerText.includes('diseñada por el míster')")
check "detalle: pizarra marcada como propia del míster" "$([ "$DET" = "true" ] && echo 1)"
$AB screenshot /tmp/ui-detalle.png >/dev/null 2>&1

echo "=== 5 · persistencia vía API (guardado por el FORM) ==="
API=$(ev "fetch('/api/pilar2/tasks?limit=50').then(r=>r.json()).then(j=>{const t=j.tasks.find(x=>x.title.startsWith('TEST UI'));return JSON.stringify({frames:t?.animationData?.fotogramas?.length??0,gk:t?.animationData?.fotogramas?.[0]?.fichas?.find(f=>f.num===1)??null})})")
echo "  API → $API"
echo "$API" | grep -q '"frames":2' && ok "pizarra con 2 fotogramas en BD" || bad "fotogramas en BD: $API"
GKX=$(echo "$API" | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    print(d['gk']['x'] if d.get('gk') else -1)
except Exception:
    print(-1)")
python3 -c "exit(0 if 20 <= $GKX <= 105 else 1)" && ok "portero arrastrado quedó persistido (x=$GKX ≥ 20)" || bad "portero sin mover: x=$GKX"

echo "=== dump TEST UI ==="
cat > /tmp/e2e-dump.sql <<'SQL'
SELECT title, (animationData IS NULL) AS sin_pizarra, created_at FROM "Task" WHERE title LIKE 'TEST UI%';
SQL
./node_modules/.bin/prisma db execute --file /tmp/e2e-dump.sql --schema prisma/schema.prisma --stdout 2>/dev/null || echo "(dump vía prisma no soporta --stdout)"
node -e "const{Client}=require('/home/z/my-project/node_modules/pg');" 2>/dev/null || true

echo "=== limpieza ==="
cat > /tmp/e2e-cleanup.sql <<'SQL'
DELETE FROM "TaskSubPrinciple" WHERE "taskId" IN (SELECT id FROM "Task" WHERE title LIKE 'TEST UI%');
DELETE FROM "Task" WHERE title LIKE 'TEST UI%';
SQL
./node_modules/.bin/prisma db execute --file /tmp/e2e-cleanup.sql --schema prisma/schema.prisma >/dev/null 2>&1 && echo "limpieza OK"
$AB close >/dev/null 2>&1

echo ""
echo "RESULTADO UI E2E: $PASS OK · $FAIL FALLOS"
pkill -f "next dev" 2>/dev/null
exit $([ "$FAIL" = "0" ] && echo 0 || echo 1)
