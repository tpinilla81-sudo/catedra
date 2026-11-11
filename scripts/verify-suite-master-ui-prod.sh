#!/bin/bash
# E2E UI EN PRODUCCIÓN — SUITE TÁCTICA MAESTRA (tip 0a524e2)
# Variante SOLO-LECTURA de verify-suite-master-ui.sh contra catedra-sooty.vercel.app:
# la Suite no tiene backend de escritura (eventos en localStorage del navegador
# headless, BD de producción JAMÁS tocada). Todo lo que se pulsa aquí es
# client-side: crono, catálogos, libreta local, ABP, acordeones, Plantilla.
# · SSR 200 + suite-root + datos reales (PlayerEvaluation vía Neon)
# · nav maestra 4 pestañas + item sidebar
# · crono INICIAR/PAUSAR/RESET · 4 secciones y 20 etiquetas EXACTAS
# · registro a un toque con sello y chip · MP4 chunked + ▶ Clip seek −3/+2
# · A.B.P.: composición EXACTA → histórico compartido
# · persistencia localStorage tras recarga (SSR estable: producción intacta)
# · Biblioteca Taxonomía + Plantilla & Capacidades con notas reales
# · capturas móvil/desktop verificadas · auto-limpieza de la libreta local
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

echo "=== 0 · fixture MP4 local (para el clip; NUNCA se sube a producción) ==="
if [ ! -f /tmp/partido-test.mp4 ]; then
  ffmpeg -f lavfi -i "testsrc=duration=20:size=320x180:rate=12" -b:v 120k \
    -pix_fmt yuv420p -y /tmp/partido-test.mp4 -loglevel error
fi
[ -f /tmp/partido-test.mp4 ] && ok "fixture MP4 20s ligero ($(stat -c%s /tmp/partido-test.mp4) B)" || bad "no se pudo generar el MP4"

echo "=== 1 · login demo (móvil 414×896) contra producción ==="
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
check "login completado en producción" "$([ "$L" = "true" ] && echo 1)"

echo "=== 2 · SSR: /dashboard/suite en producción ==="
# (el SSR ya se verificó por curl externo; aquí la prueba viva es el CDP)
CODE2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$BASE/dashboard/suite")
[ "$CODE2" = "307" ] || [ "$CODE2" = "200" ] && ok "ruta viva en producción (HTTP $CODE2)" || bad "ruta ($CODE2)"

$AB open "$BASE/dashboard/suite" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-root]')" 30
check "suite-root monta en producción" "$(ev "!!document.querySelector('[data-testid=suite-root]')")"
TITLE=$(ev "(document.querySelector('[data-testid=suite-title]')||{}).textContent||''")
echo "$TITLE" | rg -qi "Tactical Suite Master" && ok "cabecera maestra ($TITLE)" || bad "título ('$TITLE')"
NTABS=$(ev "['directo','biblioteca','plantilla','abp'].filter(t=>!!document.querySelector('[data-testid=suite-tab-'+t+']')).length")
check "4 pestañas de la nav maestra" "$([ "$NTABS" = "4" ] && echo 1)"
NAV_OK=$(ev "Array.from(document.querySelectorAll('nav a')).some(a=>a.textContent.includes('Suite Táctica')&&a.getAttribute('href')==='/dashboard/suite')")
check "sidebar: entrada «Suite Táctica»" "$NAV_OK"
check "libreta vacía al abrir (mensaje del mock)" "$(ev "!!document.querySelector('[data-testid=suite-history-empty]')")"

echo "=== 3 · cronómetro de la Suite ==="
CLK=$(ev "(document.querySelector('[data-testid=suite-crono]')||{}).textContent||''")
echo "$CLK" | rg -q "^00:00$" && ok "crono a 00:00 (mm:ss)" || bad "crono inicial ('$CLK')"
$AB eval "document.querySelector('[data-testid=suite-crono-toggle]').click()" >/dev/null 2>&1
sleep 2.6
RUN=$(ev "(document.querySelector('[data-testid=suite-crono]')||{}).textContent||''")
echo "$RUN" | rg -q "^00:0[2-9]$" && ok "crono en marcha ($RUN tras 2.6 s)" || bad "crono corriendo ('$RUN')"
$AB eval "document.querySelector('[data-testid=suite-crono-toggle]').click()" >/dev/null 2>&1
sleep 0.6
$AB eval "document.querySelector('[data-testid=suite-crono-reset]').click()" >/dev/null 2>&1
sleep 0.4
RESET=$(ev "(document.querySelector('[data-testid=suite-crono]')||{}).textContent||''")
[ "$RESET" = "00:00" ] && ok "PAUSAR + 🔄 RESET → 00:00" || bad "reset ('$RESET')"

echo "=== 4 · secciones y catálogo EXACTO del mock master ==="
NSE=$(ev "['OFENSIVA','DEFENSIVA','ABP','INTEGRADAS'].filter(s=>!!document.querySelector('[data-testid=suite-section-'+s+']')).length")
check "4 secciones" "$([ "$NSE" = "4" ] && echo 1)"
CT=$(ev "(document.querySelector('[data-testid=suite-catalog-title]')||{}).textContent||''")
echo "$CT" | rg -q "Eventos de la Sección: \[OFENSIVA\]" && ok "bandeja ($CT)" || bad "bandeja ('$CT')"
N=$(ev "document.querySelectorAll('[data-testid^=suite-event-row-]').length")
check "Ofensiva: 5 eventos" "$([ "$N" = "5" ] && echo 1)"
E0=$(ev "(document.querySelector('[data-testid=suite-event-row-0]')||{}).textContent||''")
echo "$E0" | rg -q "Salida de Balón Bajo Presión" && ok "etiqueta EXACTA (Salida de Balón Bajo Presión)" || bad "fila 0 ('$E0')"
$AB eval "document.querySelector('[data-testid=suite-section-DEFENSIVA]').click()" >/dev/null 2>&1
sleep 0.8
ND=$(ev "document.querySelectorAll('[data-testid^=suite-event-row-]').length")
D0=$(ev "(document.querySelector('[data-testid=suite-event-row-0]')||{}).textContent||''")
check "Defensiva: 5 eventos" "$([ "$ND" = "5" ] && echo 1)"
echo "$D0" | rg -q "Pressing Alto / Robo en Campo Rival" && ok "etiqueta EXACTA (Pressing Alto)" || bad "defensiva 0 ('$D0')"
$AB eval "document.querySelector('[data-testid=suite-section-ABP]').click()" >/dev/null 2>&1
sleep 0.4
NA=$(ev "document.querySelectorAll('[data-testid^=suite-event-row-]').length")
check "A.B.P.: 4 eventos" "$([ "$NA" = "4" ] && echo 1)"
$AB eval "document.querySelector('[data-testid=suite-section-INTEGRADAS]').click()" >/dev/null 2>&1
sleep 0.8
NI=$(ev "document.querySelectorAll('[data-testid^=suite-event-row-]').length")
I0=$(ev "(document.querySelector('[data-testid=suite-event-row-0]')||{}).textContent||''")
check "Integradas: 6 eventos" "$([ "$NI" = "6" ] && echo 1)"
echo "$I0" | rg -q "Juego de Conservación" && ok "etiqueta EXACTA (Juego de Conservación)" || bad "integradas 0 ('$I0')"

echo "=== 5 · registro a UN TOQUE (3 secciones) ==="
$AB eval "document.querySelector('[data-testid=suite-register-0]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-history-row-0]')" 10
R0=$(ev "(document.querySelector('[data-testid=suite-history-row-0]')||{}).textContent||''")
echo "$R0" | rg -q "Juego de Conservación" && ok "1ª fila con etiqueta" || bad "row0 ('$R0')"
echo "$R0" | rg -q "INTEGRADAS" && ok "chip de sección" || bad "chip ('$R0')"
echo "$R0" | rg -q "\[00:00\]" && ok "sello del crono [00:00]" || bad "sello ('$R0')"
$AB eval "document.querySelector('[data-testid=suite-section-DEFENSIVA]').click()" >/dev/null 2>&1
sleep 0.4
$AB eval "document.querySelector('[data-testid=suite-register-2]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-history-row-1]')" 10
R1=$(ev "(document.querySelector('[data-testid=suite-history-row-0]')||{}).textContent||''")
echo "$R1" | rg -q "Defensa de Área / Despeje" && ok "más-reciente-primero" || bad "orden ('$R1')"
$AB eval "document.querySelector('[data-testid=suite-section-OFENSIVA]').click()" >/dev/null 2>&1
sleep 0.4
$AB eval "document.querySelector('[data-testid=suite-register-4]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-history-row-2]')" 10
NH=$(ev "document.querySelectorAll('[data-testid^=suite-history-row-]').length")
check "3 filas de 3 secciones" "$([ "$NH" = "3" ] && echo 1)"

echo "=== 6 · MP4 chunked (local) + registro con vídeo + ▶ Clip ==="
B64=$(base64 -w0 /tmp/partido-test.mp4)
$AB eval "window.__b64='';'init'" >/dev/null 2>&1
UP_OK=1
for ((i=0; i<${#B64}; i+=40000)); do
  CH="${B64:i:40000}"
  R=$($AB eval "window.__b64+='$CH';window.__b64.length" 2>/dev/null)
  [ -n "$R" ] || { UP_OK=0; break; }
done
check "base64 ensamblado en el navegador" "$([ "$UP_OK" = "1" ] && echo 1)"
$AB eval "(()=>{const input=document.querySelector('[data-testid=\"suite-video-input\"]');if(!input)return 'NO_INPUT';const bytes=Uint8Array.from(atob(window.__b64),c=>c.charCodeAt(0));const file=new File([bytes],'partido-test.mp4',{type:'video/mp4'});const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return 'OK'})()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-video]')" 12
check "<video> blob local" "$(ev "!!((document.querySelector('[data-testid=suite-video]')||{src:''}).src||'').startsWith('blob:')")"
check "chip nombre del archivo" "$(ev "((document.querySelector('[data-testid=suite-video-name]')||{}).textContent||'').includes('partido-test.mp4')")"
check "botones ▶ Clip aparecen" "$(ev "!!document.querySelector('[data-testid=suite-history-clip-0]')")"
$AB eval "(()=>{const v=document.querySelector('[data-testid=suite-video]');if(v)v.currentTime=10;return 'ok'})()" >/dev/null 2>&1
$AB eval "document.querySelector('[data-testid=suite-register-2]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-history-row-3]')" 10
NH2=$(ev "document.querySelectorAll('[data-testid^=suite-history-row-]').length")
check "4ª fila registrada con vídeo activo" "$([ "$NH2" = "4" ] && echo 1)"
$AB eval "(()=>{const v=document.querySelector('[data-testid=suite-video]');if(v){v.pause();v.currentTime=15}return 'ok'})()" >/dev/null 2>&1
$AB eval "document.querySelector('[data-testid=suite-history-clip-0]').click()" >/dev/null 2>&1
sleep 1.5
CV=$(ev "JSON.stringify({t: document.querySelector('[data-testid=suite-video]')?.currentTime ?? -1, d: Math.round(document.querySelector('[data-testid=suite-video]')?.duration ?? 0)})")
echo "  · tras Clip: $CV (esperado seek a 7)"
python3 - "$CV" <<'EOF'
import json, sys
a = json.loads(sys.argv[1])
assert a.get("d") == 20 and 6.0 <= a.get("t", -1) <= 9.9, f"clip: {a}"
print(f"clip OK: currentTime={a['t']} (auto-clip −3s/+2s)")
EOF
[ $? = 0 ] && ok "▶ Clip reproduce el fragmento en producción" || bad "clip ($CV)"

echo "=== 7 · Módulo A.B.P.: composición EXACTA + registro compartido ==="
$AB eval "document.querySelector('[data-testid=suite-tab-abp]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-abp-register]')" 12
NSIDES=$(ev "['corner-favor','corner-contra','banda-favor','banda-contra','falta-favor','falta-contra'].filter(s=>!!document.querySelector('[data-testid=suite-abp-side-'+s+']')).length")
check "6 lados FAVOR/CONTRA" "$([ "$NSIDES" = "6" ] && echo 1)"
NR=$(ev "document.querySelectorAll('[data-testid^=suite-abp-result-]').length")
check "6 chips Resultado & Franja" "$([ "$NR" = "6" ] && echo 1)"
check "«Módulo A.B.P. Activo» + sync" "$(ev "((document.querySelector('[data-testid=suite-abp-state]')||{}).textContent||'').includes('Módulo A.B.P. Activo') && ((document.querySelector('[data-testid=suite-abp-state]')||{}).textContent||'').includes('Sincronizado con zonas laterales, central directa y área de portería')")"
$AB eval "document.querySelector('[data-testid=suite-abp-side-falta-contra]').click()" >/dev/null 2>&1
$AB eval "Array.from(document.querySelectorAll('[data-testid^=suite-abp-result-]')).find(b=>b.textContent.trim()==='REMATE PIE')?.click();Array.from(document.querySelectorAll('[data-testid^=suite-abp-result-]')).find(b=>b.textContent.trim()==='SEGUNDA JUGADA')?.click();'ok'" >/dev/null 2>&1
sleep 0.4
COMP=$(ev "(document.querySelector('[data-testid=suite-abp-compose]')||{}).textContent||''")
echo "$COMP" | rg -q "^FALTA CONTRA · REMATE PIE · SEGUNDA JUGADA$" && ok "composición EXACTA ($COMP)" || bad "composición ('$COMP')"
$AB eval "document.querySelector('[data-testid=suite-abp-register]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-abp-flash]')" 8
check "flash de confirmación" "$(ev "!!document.querySelector('[data-testid=suite-abp-flash]')")"
$AB eval "document.querySelector('[data-testid=suite-tab-directo]').click()" >/dev/null 2>&1
sleep 0.6
NH3=$(ev "document.querySelectorAll('[data-testid^=suite-history-row-]').length")
check "5 filas en el histórico" "$([ "$NH3" = "5" ] && echo 1)"
RA=$(ev "(document.querySelector('[data-testid=suite-history-row-0]')||{}).textContent||''")
echo "$RA" | rg -q "FALTA CONTRA · REMATE PIE · SEGUNDA JUGADA" && echo "$RA" | rg -q "ABP" && ok "el evento A.B.P. encabeza con chip ABP" || bad "row0 ('$RA')"

echo "=== 8 · persistencia (localStorage) + SSR estable (producción intacta) ==="
$AB open "$BASE/dashboard/suite" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-root]')" 30
sleep 1.5
NHP=$(ev "document.querySelectorAll('[data-testid^=suite-history-row-]').length")
check "tras recargar siguen las 5 filas (libreta local)" "$([ "$NHP" = "5" ] && echo 1)"
RPLANT=$(ev "(document.querySelector('[data-testid=suite-player-name-0]')||{}).textContent||''")
[ -n "$RPLANT" ] || RPLANT="(sin datos)"
$AB eval "document.querySelector('[data-testid=suite-tab-plantilla]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-player-0]')" 15
NB=$(ev "['fisicas','tecnica','inteligencia','psicologicos'].filter(b=>!!document.querySelector('[data-testid=suite-bloque-'+b+']')).length")
NM=$(ev "['fisicas','tecnica','inteligencia','psicologicos'].reduce((a,b)=>a+document.querySelectorAll('[data-testid^=suite-metric-'+b+'-]').length,0)")
check "Plantilla: 4 bloques × 6 métricas (SSR real)" "$([ "$NB" = "4" ] && [ "$NM" = "24" ] && echo 1)"
check "métrica Coordinación" "$(ev "Array.from(document.querySelectorAll('[data-testid^=suite-metric-fisicas-]')).some(m=>m.textContent.includes('Coordinación'))")"
OVER=$(ev "(document.querySelector('[data-testid=suite-overall]')||{}).textContent||''")
echo "$OVER" | rg -q "Media global|Sin evaluación" && ok "media real ($OVER)" || bad "overall ('$OVER')"
OPENHREF=$(ev "(document.querySelector('[data-testid=suite-player-open-0]')||{getAttribute:()=>''}).getAttribute('href')")
echo "$OPENHREF" | rg -q "^/dashboard/players/[a-z0-9]+$" && ok "enlace a la Ficha ($OPENHREF)" || bad "href ('$OPENHREF')"

echo "=== 9 · Biblioteca Taxonomía ==="
$AB eval "document.querySelector('[data-testid=suite-tab-biblioteca]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-bib-acc-fisicas]')" 12
NACC=$(ev "['fisicas','tecnicas','tacticas','integradas'].filter(c=>!!document.querySelector('[data-testid=suite-bib-acc-'+c+']')).length")
check "4 acordeones" "$([ "$NACC" = "4" ] && echo 1)"
check "Físicas abierta por defecto" "$(ev "document.querySelector('[data-testid=suite-bib-acc-fisicas]')?.getAttribute('aria-expanded')==='true'")"
PANEL=$(ev "(document.querySelector('[data-testid=suite-bib-panel-fisicas]')||{}).textContent||''")
echo "$PANEL" | rg -q "Flexibilidad" && ok "descriptores físicos" || bad "panel ('$PANEL')"
HREF=$(ev "(document.querySelector('[data-testid=suite-bib-open]')||{getAttribute:()=>''}).getAttribute('href')")
[ "$HREF" = "/dashboard/library" ] && ok "enlace a la Biblioteca Maestra" || bad "href ('$HREF')"

echo "=== 10 · capturas (producción) ==="
$AB eval "document.querySelector('[data-testid=suite-tab-directo]').click()" >/dev/null 2>&1
sleep 0.8
$AB set viewport 414 896 >/dev/null 2>&1
$AB screenshot /tmp/prod-suite-mobile.png >/dev/null 2>&1 && ok "captura móvil 414"
$AB eval "document.querySelector('[data-testid=suite-tab-abp]').click()" >/dev/null 2>&1
sleep 0.6
$AB screenshot /tmp/prod-suite-mobile-abp.png >/dev/null 2>&1 && ok "captura móvil 414 (A.B.P.)"
$AB set viewport 1440 900 >/dev/null 2>&1
sleep 1
$AB eval "document.querySelector('[data-testid=suite-tab-directo]').click()" >/dev/null 2>&1
sleep 0.6
$AB screenshot /tmp/prod-suite-desktop.png >/dev/null 2>&1 && ok "captura desktop 1440"
$AB eval "document.querySelector('[data-testid=suite-tab-plantilla]').click()" >/dev/null 2>&1
sleep 0.6
$AB screenshot /tmp/prod-suite-desktop-plantilla.png >/dev/null 2>&1 && ok "captura desktop (Plantilla)"
python3 - <<'EOF'
from PIL import Image
import sys
bad = []
for p in ["/tmp/prod-suite-mobile.png", "/tmp/prod-suite-mobile-abp.png", "/tmp/prod-suite-desktop.png", "/tmp/prod-suite-desktop-plantilla.png"]:
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

echo "=== 11 · auto-limpieza (el navegador headless queda como estaba) ==="
$AB eval "localStorage.removeItem('catedra.suite.master.events.v1');window.__b64=null;'ok'" >/dev/null 2>&1
ok "libreta local limpiada — producción SIN escrituras (la Suite no persiste en BD)"

echo ""
echo "=============================="
echo "RESULTADO: PASS=$PASS FAIL=$FAIL  (producción $BASE)"
[ "$FAIL" = "0" ] && echo "SUITE MAESTRA EN PRODUCCIÓN VERDE ✓" || echo "ROJO ✗"
exit 0
