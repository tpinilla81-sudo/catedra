#!/bin/bash
# E2E UI — PILAR 3: ANÁLISIS DINÁMICO EN DIRECTO // CRONÓMETRO & SECCIONES
# (mock del míster 'LiveChronometerAnalysisView')
# móvil 414×896 · login → match/live?g= → «Dinámico» →
#   · reloj del panel (quick-clock) con formato mm:ss y EN MARCHA tras el registro
#   · 4 secciones (Ofensiva/Defensiva/A.B.P./Transición) con activa por defecto
#   · catálogo filtrado por sección con etiquetas EXACTAS del mock (5/5/4/3)
#   · carga REAL de MP4 por CDP (DataTransfer) → <video> blob + chip
#   · registro a un toque en A.B.P. y Ofensiva → filas con [mm:ss] + chip sección
#   · BD: MatchTelemetryEvent ACTION creados + VideoBookmark en el segundo 10
#   · línea temporal del tablón muestra los eventos
#   · ▶ Clip hace seek al vídeo (max(0, s-3)) y reproduce
#   · auto-limpieza de los eventos creados + capturas móvil/desktop
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

# ---------- 0) fixture MP4 (30 s) + game_id ----------
if [ ! -f /tmp/partido-test.mp4 ]; then
  ffmpeg -f lavfi -i "testsrc=duration=20:size=320x180:rate=12" -b:v 120k \
    -pix_fmt yuv420p -y /tmp/partido-test.mp4 -loglevel error
fi
[ -f /tmp/partido-test.mp4 ] && ok "fixture MP4 20s ligero ($(stat -c%s /tmp/partido-test.mp4) B)" || bad "no se pudo generar el MP4"

python3 - <<'EOF'
import re, urllib.request, urllib.parse, http.cookiejar
BASE = "http://localhost:3000"
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
op.addheaders = [("User-Agent", "Mozilla/5.0 (verify-quick-chrono)")]
def get(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        r = op.open(req, timeout=60); return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
s, b = get(f"{BASE}/api/auth/csrf")
csrf = re.search(r'"csrfToken":"([^"]+)"', b).group(1)
d = urllib.parse.urlencode({"csrfToken": csrf, "email": "mister@cfmetodo.es",
    "password": "metodo2025", "callbackUrl": BASE, "json": "true"}).encode()
req = urllib.request.Request(f"{BASE}/api/auth/callback/credentials", data=d, method="POST",
    headers={"Content-Type": "application/x-www-form-urlencoded"})
op.open(req, timeout=60)
s, mt = get(f"{BASE}/dashboard/matches")
gids = re.findall(r"dashboard/match/live\?g=([a-zA-Z0-9:_-]+)", mt)
assert gids, "no hay partidos"
open("/tmp/gid-quick.txt", "w").write(gids[0])
print(f"game_id={gids[0]}")
EOF
GID="$(cat /tmp/gid-quick.txt)"
[ -n "$GID" ] && ok "partido en directo localizado ($GID)" || bad "sin partido"

# ---------- 0b) reset determinista: sin sesión ni eventos previos ----------
GID="$GID" DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo" node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  await p.videoBookmark.deleteMany({where:{telemetryEvent:{matchId:process.env.GID}}});
  await p.matchTelemetryEvent.deleteMany({where:{matchId:process.env.GID}});
  await p.matchSession.deleteMany({where:{matchId:process.env.GID}});
  console.log('  · sesión y eventos limpios (reloj a 00:00)');
  process.exit(0)})()"

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

echo "=== 2 · abrir Dinámico en el tablón en directo ==="
$AB open "http://localhost:3000/dashboard/match/live?g=$GID" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=btn-dinamico]')" 25
check "botón «Dinámico» en la cabecera del tablón" "$(ev "!!document.querySelector('[data-testid=btn-dinamico]')")"
$AB eval "document.querySelector('[data-testid=btn-dinamico]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=quick-board]')" 12
check "panel de análisis dinámico abre" "$(ev "!!document.querySelector('[data-testid=quick-board]')")"
CLK="$(ev "(document.querySelector('[data-testid=quick-clock]')||{}).textContent||''")"
echo "$CLK" | rg -q "^[0-9]{2}:[0-9]{2}$" && ok "reloj del panel en formato mm:ss ($CLK)" || bad "reloj ('$CLK')"

echo "=== 3 · 4 secciones y catálogos EXACTOS del mock ==="
NS=$(ev "['ofensiva','defensiva','abp','transicion'].filter(s=>!!document.querySelector('[data-testid=quick-cat-'+s+']')).length")
check "4 secciones presentes" "$([ "$NS" = "4" ] && echo 1)"
ACT=$(ev "document.querySelector('[data-testid=quick-cat-ofensiva]')?.getAttribute('aria-pressed')")
check "Ofensiva activa por defecto" "$([ "$ACT" = "true" ] && echo 1)"
TIT="$(ev "(document.querySelector('[data-testid=quick-catalog-title]')||{}).textContent||''")"
echo "$TIT" | rg -q "\[OFENSIVA\]" && ok "título del catálogo ([OFENSIVA])" || bad "título ('$TIT')"
NE=$(ev "document.querySelectorAll('[data-testid^=quick-event-]').length")
check "5 eventos en Ofensiva" "$([ "$NE" = "5" ] && echo 1)"
LBL=$(ev "(document.querySelector('[data-testid=quick-event-0]')||{}).textContent||''")
echo "$LBL" | rg -q "Salida de Balón Bajo Presión" && ok "etiqueta exacta Ofensiva/1 (Salida de Balón Bajo Presión)" || bad "etiqueta ('$LBL')"
$AB eval "document.querySelector('[data-testid=quick-cat-abp]').click()" >/dev/null 2>&1
sleep 0.4
NE2=$(ev "document.querySelectorAll('[data-testid^=quick-event-]').length")
TIT2="$(ev "(document.querySelector('[data-testid=quick-catalog-title]')||{}).textContent||''")"
check "A.B.P.: 4 eventos y título [ABP] del mock" "$([ "$NE2" = "4" ] && echo "$TIT2" | rg -q '\[ABP\]' && echo 1)"
LBL2=$(ev "(document.querySelector('[data-testid=quick-event-0]')||{}).textContent||''")
echo "$LBL2" | rg -q "Córner a Favor \(Primer/Segundo Palo\)" && ok "etiqueta exacta ABP/1 (Córner a Favor…)" || bad "etiqueta ('$LBL2')"
$AB eval "document.querySelector('[data-testid=quick-cat-transicion]').click()" >/dev/null 2>&1
sleep 0.4
NE3=$(ev "document.querySelectorAll('[data-testid^=quick-event-]').length")
check "Transición: 3 eventos" "$([ "$NE3" = "3" ] && echo 1)"
$AB eval "document.querySelector('[data-testid=quick-cat-defensiva]').click()" >/dev/null 2>&1
sleep 0.4
NE4=$(ev "document.querySelectorAll('[data-testid^=quick-event-]').length")
check "Defensiva: 5 eventos" "$([ "$NE4" = "5" ] && echo 1)"
$AB eval "document.querySelector('[data-testid=quick-cat-ofensiva]').click()" >/dev/null 2>&1
sleep 0.4

echo "=== 4 · carga REAL del MP4 por CDP (chunked: el eval tiene límite de tamaño) ==="
B64=$(base64 -w0 /tmp/partido-test.mp4)
$AB eval "window.__b64='';'init'" >/dev/null 2>&1
UP_OK=1
for ((i=0; i<${#B64}; i+=40000)); do
  CH="${B64:i:40000}"
  R=$($AB eval "window.__b64+='$CH';window.__b64.length" 2>/dev/null)
  [ -n "$R" ] || { UP_OK=0; echo "  · chunk $i falló"; break; }
done
check "base64 ensamblado en el navegador" "$([ "$UP_OK" = "1" ] && echo 1)"
$AB eval "(()=>{const input=document.querySelector('[data-testid=\"local-video-input\"]');if(!input)return 'NO_INPUT';const bytes=Uint8Array.from(atob(window.__b64),c=>c.charCodeAt(0));const file=new File([bytes],'partido-test.mp4',{type:'video/mp4'});const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return 'OK '+bytes.length})()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=quick-video]')" 10
check "<video> del panel con blob local" "$(ev "!!(document.querySelector('[data-testid=quick-video]')||{src:''}).src.startsWith('blob:')")"
check "chip del archivo en el panel" "$(ev "(document.querySelector('[data-testid=quick-video-name]')||{}).textContent.includes('partido-test.mp4')")"
# sincronizar el instante de registro en el segundo 10 del vídeo
$AB eval "(()=>{const v=document.querySelector('[data-testid=quick-video]');v.currentTime=10;return 'ok'})()" >/dev/null 2>&1
sleep 0.5

echo "=== 5 · registro a un toque en A.B.P. (segundo 10 del vídeo) ==="
CNT_A=$(GID="$GID" DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo" node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.matchTelemetryEvent.count({where:{matchId:process.env.GID}}).then(c=>{console.log(c);process.exit(0)})")
echo "  · eventos en BD antes: $CNT_A"
$AB eval "document.querySelector('[data-testid=quick-cat-abp]').click()" >/dev/null 2>&1
sleep 0.4
$AB eval "document.querySelector('[data-testid=quick-event-0]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid^=quick-row-]')" 15
ROWS=$(ev "document.querySelectorAll('[data-testid^=quick-row-]').length")
check "fila en el historial en directo" "$([ "${ROWS:-0}" = "1" ] && echo 1)"
ROWID=$(ev "(document.querySelector('[data-testid^=quick-row-]')||{}).dataset.testid||''")
ROWID="${ROWID#quick-row-}"
R1="$(ev "JSON.stringify({
  ts: (document.querySelector('[data-testid=quick-row-$ROWID] span')||{}).textContent||'',
  label: (document.querySelector('[data-testid=quick-row-$ROWID]')||{}).textContent||'',
  clip: !!document.querySelector('[data-testid=quick-clip-$ROWID]')})")"
echo "  · fila: $R1"
echo "$R1" | rg -q "Córner a Favor" && ok "etiqueta del evento en la fila" || bad "fila sin etiqueta"
echo "$R1" | rg -q "ABP" && ok "chip de sección ABP (id crudo del mock)" || bad "fila sin chip sección"
echo "$R1" | rg -q "\[[0-9]{2}:[0-9]{2}\]" && ok "sello temporal [mm:ss] del crono" || bad "sin [mm:ss]"
echo "$R1" | rg -q '"clip":true' && ok "botón ▶ Clip presente (vídeo activo)" || bad "sin Clip"

echo "=== 6 · BD: evento ACTION + bookmark en el segundo 10 ==="
CNT_B=$(GID="$GID" DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo" node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.matchTelemetryEvent.count({where:{matchId:process.env.GID}}).then(c=>{console.log(c);process.exit(0)})")
check "BD: +1 evento de telemetría ($CNT_A → $CNT_B)" "$([ "$((CNT_B-CNT_A))" = "1" ] && echo 1)"
DB1=$(GID="$GID" DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo" node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  const ev=await p.matchTelemetryEvent.findFirst({where:{matchId:process.env.GID,value:{contains:'Córner a Favor'}},orderBy:{timestamp:'desc'}});
  if(!ev){console.log('EV_NO');process.exit(0)}
  const bm=await p.videoBookmark.findUnique({where:{telemetryEventId:ev.id}});
  const okE=ev.type==='ACTION' && ev.playerId===null;
  console.log(JSON.stringify({ev:okE?'OK':'NO',bm:bm?Math.round(bm.videoTimestampSeconds):null}));
  process.exit(0)})()")
echo "  · BD: $DB1"
echo "$DB1" | rg -q '"ev":"OK"' && ok "BD: ACTION sin responsable" || bad "BD evento ($DB1)"
echo "$DB1" | rg -q '"bm":10' && ok "BD: VideoBookmark en el segundo 10 (auto-clip −3/+2)" || bad "BD bookmark ($DB1)"

echo "=== 7 · registro en Ofensiva + orden más-reciente-primero ==="
$AB eval "(()=>{const v=document.querySelector('[data-testid=quick-video]');if(v)v.currentTime=20;return 'ok'})()" >/dev/null 2>&1
$AB eval "document.querySelector('[data-testid=quick-cat-ofensiva]').click()" >/dev/null 2>&1
sleep 0.4
$AB eval "document.querySelector('[data-testid=quick-event-2]').click()" >/dev/null 2>&1
waitfor "(document.querySelectorAll('[data-testid^=quick-row-]').length)===2" 15
check "segunda fila registrada" "$(ev "document.querySelectorAll('[data-testid^=quick-row-]').length===2")"
FIRST=$(ev "(document.querySelector('[data-testid^=quick-row-]')||{}).textContent||''")
echo "$FIRST" | rg -q "Creación en 3/4 de Cancha" && ok "la fila nueva queda primera" || bad "orden ($FIRST)"
TL=$(ev "document.body.textContent.includes('Creación en 3/4 de Cancha') && document.body.textContent.includes('Córner a Favor')")
check "la línea temporal del tablón muestra los eventos" "$TL"

echo "=== 8 · reloj en directo: quick-clock avanza con la sesión LIVE ==="
C1=$(ev "(document.querySelector('[data-testid=quick-clock]')||{}).textContent||''")
sleep 2.5
C2=$(ev "(document.querySelector('[data-testid=quick-clock]')||{}).textContent||''")
echo "  · reloj: $C1 → $C2"
[ "$C1" != "$C2" ] && ok "el crono corre (sesión arrancada automáticamente)" || bad "reloj congelado ($C1)"

echo "=== 9 · ▶ Clip hace seek y reproduce ==="
$AB eval "(()=>{const v=document.querySelector('[data-testid=quick-video]');if(v){v.pause();v.currentTime=25}return 'ok'})()" >/dev/null 2>&1
$AB eval "document.querySelector('[data-testid=quick-clip-$ROWID]').click()" >/dev/null 2>&1
sleep 1.5
CV=$(ev "JSON.stringify({t: document.querySelector('[data-testid=quick-video]')?.currentTime ?? -1, d: Math.round(document.querySelector('[data-testid=quick-video]')?.duration ?? 0)})")
echo "  · tras Clip: $CV (esperado seek a 7)"
echo "$CV" | rg -q '"d":20' && ok "vídeo de 20 s cargado" || bad "duración ($CV)"
python3 - "$CV" <<'EOF'
import json, sys
a = json.loads(sys.argv[1])
assert 6.0 <= a["t"] <= 9.9, f"no hubo seek al arranque del clip: {a}"
print(f"clip OK: currentTime={a['t']} (auto-clip −3s/+2s desde el segundo 10)")
EOF
[ $? = 0 ] && ok "seek del clip al instante registrado" || bad "clip ($CV)"

echo "=== 10 · auto-limpieza de los eventos creados ==="
GID="$GID" DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo" node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  const evs=await p.matchTelemetryEvent.findMany({where:{matchId:process.env.GID,value:{in:['Córner a Favor (Primer/Segundo Palo)','Creación en 3/4 de Cancha']}},select:{id:true}});
  const delBm=await p.videoBookmark.deleteMany({where:{telemetryEventId:{in:evs.map(e=>e.id)}}});
  const del=await p.matchTelemetryEvent.deleteMany({where:{id:{in:evs.map(e=>e.id)}}});
  console.log('limpiados', del.count, 'eventos y', delBm.count, 'bookmarks');
  process.exit(0)})()" | tail -1
CNT_C=$(GID="$GID" DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo" node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.matchTelemetryEvent.count({where:{matchId:process.env.GID}}).then(c=>{console.log(c);process.exit(0)})")
check "BD restaurada ($CNT_C = $CNT_A)" "$([ "$CNT_C" = "$CNT_A" ] && echo 1)"

echo "=== 11 · capturas ==="
$AB eval "document.querySelector('[data-testid=quick-board]').scrollIntoView({block:'start'})" >/dev/null 2>&1
sleep 0.5
$AB set viewport 414 896 >/dev/null 2>&1
$AB screenshot /tmp/quick-mobile.png >/dev/null 2>&1 && ok "captura móvil 414"
$AB set viewport 1440 900 >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/quick-desktop.png >/dev/null 2>&1 && ok "captura desktop 1440"

echo ""
echo "=============================="
echo "RESULTADO: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "ANÁLISIS DINÁMICO VERDE ✓" || echo "ROJO ✗"
exit 0
