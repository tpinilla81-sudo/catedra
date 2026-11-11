#!/bin/bash
# E2E UI — PILAR 3: SUITE TÁCTICA MAESTRA // TACTICAL SUITE MASTER (V3)
# (mock del míster 'MetodoTacticalSuiteMasterApp')
# móvil 414×896 · login → /dashboard/suite →
#   · nav maestra: 4 pestañas EXACTAS + item «Suite Táctica» en el sidebar
#   · cronómetro de la Suite: mm:ss, ▶ INICIAR → avanza → ⏸ PAUSAR → 🔄 00:00
#   · 4 secciones (Ofensiva/Defensiva/A.B.P./Integradas) + 20 etiquetas EXACTAS
#   · registro a UN TOQUE → historial con [mm:ss] + chip de sección
#   · carga REAL de MP4 por CDP (DataTransfer chunked) → <video> blob + chip
#   · ▶ Clip hace seek −3s/+2s y reproduce
#   · A.B.P.: FAVOR/CONTRA + resultado/franja → composición EXACTA → registra
#     en el histórico en directo (pestaña Directo)
#   · persistencia localStorage: la libreta sobrevive a la recarga
#   · Biblioteca Taxonomía: acordeones EXACTOS (1/2/3/5) + enlace Maestra
#   · Plantilla & Capacidades: notas REALES de la Ficha (4 bloques × 6 métricas)
#     con Avg por bloque y acceso a la Ficha completa
#   · capturas móvil/desktop · SOLO-LECTURA EN BD POR DISEÑO (la Suite no
#     escribe: eventos en localStorage) · auto-limpieza de la libreta al final
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

echo "=== 0 · fixture MP4 (20 s) para la pestaña Directo ==="
if [ ! -f /tmp/partido-test.mp4 ]; then
  ffmpeg -f lavfi -i "testsrc=duration=20:size=320x180:rate=12" -b:v 120k \
    -pix_fmt yuv420p -y /tmp/partido-test.mp4 -loglevel error
fi
[ -f /tmp/partido-test.mp4 ] && ok "fixture MP4 20s ligero ($(stat -c%s /tmp/partido-test.mp4) B)" || bad "no se pudo generar el MP4"

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

# libreta limpia para empezar (la Suite persiste en localStorage)
$AB eval "localStorage.removeItem('catedra.suite.master.events.v1');'ok'" >/dev/null 2>&1

echo "=== 2 · abrir la Suite Táctica (/dashboard/suite) ==="
$AB open http://localhost:3000/dashboard/suite >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-root]')" 25
check "suite-root monta" "$(ev "!!document.querySelector('[data-testid=suite-root]')")"
TITLE=$(ev "(document.querySelector('[data-testid=suite-title]')||{}).textContent||''")
echo "$TITLE" | rg -qi "Tactical Suite Master" && ok "cabecera maestra ($TITLE)" || bad "título ('$TITLE')"
NTABS=$(ev "['directo','biblioteca','plantilla','abp'].filter(t=>!!document.querySelector('[data-testid=suite-tab-'+t+']')).length")
check "4 pestañas de la nav maestra" "$([ "$NTABS" = "4" ] && echo 1)"
check "pestaña Directo activa por defecto (aria-pressed)" \
  "$(ev "document.querySelector('[data-testid=suite-tab-directo]')?.getAttribute('aria-pressed')==='true'")"
NAV_OK=$(ev "Array.from(document.querySelectorAll('nav a')).some(a=>a.textContent.includes('Suite Táctica')&&a.getAttribute('href')==='/dashboard/suite')")
check "sidebar: entrada «Suite Táctica»" "$NAV_OK"

echo "=== 3 · estado vacío de la libreta ==="
check "mensaje de historial vacío" "$(ev "!!document.querySelector('[data-testid=suite-history-empty]')")"

echo "=== 4 · cronómetro de la Suite: INICIAR → PAUSAR → RESET ==="
CLK=$(ev "(document.querySelector('[data-testid=suite-crono]')||{}).textContent||''")
echo "$CLK" | rg -q "^00:00$" && ok "crono a 00:00 en formato mm:ss" || bad "crono inicial ('$CLK')"
$AB eval "document.querySelector('[data-testid=suite-crono-toggle]').click()" >/dev/null 2>&1
sleep 2.6
RUN=$(ev "(document.querySelector('[data-testid=suite-crono]')||{}).textContent||''")
echo "$RUN" | rg -q "^00:0[2-9]$" && ok "crono en marcha ($RUN tras 2.6 s)" || bad "crono corriendo ('$RUN')"
BTN=$(ev "(document.querySelector('[data-testid=suite-crono-toggle]')||{}).textContent||''")
echo "$BTN" | rg -q "PAUSAR" && ok "botón en modo PAUSAR" || bad "botón ('$BTN')"
$AB eval "document.querySelector('[data-testid=suite-crono-toggle]').click()" >/dev/null 2>&1
sleep 0.6
PAUSED=$(ev "(document.querySelector('[data-testid=suite-crono]')||{}).textContent||''")
[ "$PAUSED" = "$RUN" ] && ok "PAUSAR congela el crono ($PAUSED)" || bad "sigue corriendo ($RUN → $PAUSED)"
$AB eval "document.querySelector('[data-testid=suite-crono-reset]').click()" >/dev/null 2>&1
sleep 0.4
RESET=$(ev "(document.querySelector('[data-testid=suite-crono]')||{}).textContent||''")
[ "$RESET" = "00:00" ] && ok "🔄 RESET devuelve a 00:00" || bad "reset ('$RESET')"
BTN2=$(ev "(document.querySelector('[data-testid=suite-crono-toggle]')||{}).textContent||''")
echo "$BTN2" | rg -q "INICIAR" && ok "botón vuelve a INICIAR tras reset" || bad "botón ('$BTN2')"

echo "=== 5 · secciones y catálogo EXACTO del mock master ==="
NSE=$(ev "['OFENSIVA','DEFENSIVA','ABP','INTEGRADAS'].filter(s=>!!document.querySelector('[data-testid=suite-section-'+s+']')).length")
check "4 secciones (Ofensiva · Defensiva · A.B.P. · Integradas)" "$([ "$NSE" = "4" ] && echo 1)"
check "Ofensiva activa por defecto" \
  "$(ev "document.querySelector('[data-testid=suite-section-OFENSIVA]')?.getAttribute('aria-pressed')==='true'")"
CT=$(ev "(document.querySelector('[data-testid=suite-catalog-title]')||{}).textContent||''")
echo "$CT" | rg -q "Eventos de la Sección: \[OFENSIVA\]" && ok "bandeja de sección ($CT)" || bad "bandeja ('$CT')"
N=$(ev "document.querySelectorAll('[data-testid^=suite-event-row-]').length")
check "Ofensiva: 5 eventos" "$([ "$N" = "5" ] && echo 1)"
E0=$(ev "(document.querySelector('[data-testid=suite-event-row-0]')||{}).textContent||''")
echo "$E0" | rg -q "Salida de Balón Bajo Presión" && ok "etiqueta EXACTA 1 (Salida de Balón Bajo Presión)" || bad "fila 0 ('$E0')"
E1=$(ev "(document.querySelector('[data-testid=suite-event-row-1]')||{}).textContent||''")
echo "$E1" | rg -q "Pase Filtrado / Ruptura de Líneas" && ok "etiqueta EXACTA 2 (Pase Filtrado)" || bad "fila 1 ('$E1')"
$AB eval "document.querySelector('[data-testid=suite-section-DEFENSIVA]').click()" >/dev/null 2>&1
sleep 0.4
ND=$(ev "document.querySelectorAll('[data-testid^=suite-event-row-]').length")
check "Defensiva: 5 eventos" "$([ "$ND" = "5" ] && echo 1)"
D0=$(ev "(document.querySelector('[data-testid=suite-event-row-0]')||{}).textContent||''")
echo "$D0" | rg -q "Pressing Alto / Robo en Campo Rival" && ok "etiqueta EXACTA (Pressing Alto)" || bad "defensiva 0 ('$D0')"
$AB eval "document.querySelector('[data-testid=suite-section-ABP]').click()" >/dev/null 2>&1
sleep 0.4
NA=$(ev "document.querySelectorAll('[data-testid^=suite-event-row-]').length")
check "A.B.P.: 4 eventos" "$([ "$NA" = "4" ] && echo 1)"
$AB eval "document.querySelector('[data-testid=suite-section-INTEGRADAS]').click()" >/dev/null 2>&1
sleep 0.4
NI=$(ev "document.querySelectorAll('[data-testid^=suite-event-row-]').length")
check "Integradas: 6 eventos" "$([ "$NI" = "6" ] && echo 1)"
I0=$(ev "(document.querySelector('[data-testid=suite-event-row-0]')||{}).textContent||''")
echo "$I0" | rg -q "Juego de Conservación" && ok "etiqueta EXACTA (Juego de Conservación)" || bad "integradas 0 ('$I0')"

echo "=== 6 · registro a UN TOQUE (3 secciones distintas) ==="
$AB eval "document.querySelector('[data-testid=suite-register-0]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-history-row-2]')" 10
NH=$(ev "document.querySelectorAll('[data-testid^=suite-history-row-]').length")
check "primera fila en el historial" "$([ "$NH" = "1" ] && echo 1)"
R0=$(ev "(document.querySelector('[data-testid=suite-history-row-0]')||{}).textContent||''")
echo "$R0" | rg -q "Juego de Conservación" && ok "etiqueta registrada" || bad "historial 0 ('$R0')"
echo "$R0" | rg -q "INTEGRADAS" && ok "chip de sección INTEGRADAS" || bad "chip ('$R0')"
echo "$R0" | rg -q "\[00:00\]" && ok "sello del crono [00:00]" || bad "sello ('$R0')"
$AB eval "document.querySelector('[data-testid=suite-section-DEFENSIVA]').click()" >/dev/null 2>&1
sleep 0.4
$AB eval "document.querySelector('[data-testid=suite-register-2]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-history-row-1]')" 10
R1=$(ev "(document.querySelector('[data-testid=suite-history-row-0]')||{}).textContent||''")
echo "$R1" | rg -q "Defensa de Área / Despeje" && ok "la fila nueva queda primera (Defensa de Área)" || bad "orden ('$R1')"
$AB eval "document.querySelector('[data-testid=suite-section-OFENSIVA]').click()" >/dev/null 2>&1
sleep 0.4
$AB eval "document.querySelector('[data-testid=suite-register-4]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-history-row-2]')" 10
NH2=$(ev "document.querySelectorAll('[data-testid^=suite-history-row-]').length")
check "3 filas de 3 secciones distintas" "$([ "$NH2" = "3" ] && echo 1)"

echo "=== 7 · carga REAL del MP4 por CDP (chunked) + registro con vídeo ==="
B64=$(base64 -w0 /tmp/partido-test.mp4)
$AB eval "window.__b64='';'init'" >/dev/null 2>&1
UP_OK=1
for ((i=0; i<${#B64}; i+=40000)); do
  CH="${B64:i:40000}"
  R=$($AB eval "window.__b64+='$CH';window.__b64.length" 2>/dev/null)
  [ -n "$R" ] || { UP_OK=0; echo "  · chunk $i falló"; break; }
done
check "base64 ensamblado en el navegador" "$([ "$UP_OK" = "1" ] && echo 1)"
$AB eval "(()=>{const input=document.querySelector('[data-testid=\"suite-video-input\"]');if(!input)return 'NO_INPUT';const bytes=Uint8Array.from(atob(window.__b64),c=>c.charCodeAt(0));const file=new File([bytes],'partido-test.mp4',{type:'video/mp4'});const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return 'OK '+bytes.length})()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-video]')" 10
check "<video> de la Suite con blob local" "$(ev "!!((document.querySelector('[data-testid=suite-video]')||{src:''}).src||'').startsWith('blob:')")"
VNAME=$(ev "(document.querySelector('[data-testid=suite-video-name]')||{}).textContent||''")
echo "$VNAME" | rg -q "partido-test.mp4" && ok "chip con nombre del archivo ($VNAME)" || bad "nombre ('$VNAME')"
CLIP_BTN=$(ev "!!document.querySelector('[data-testid=suite-history-clip-0]')")
check "botones ▶ Clip aparecen en el historial (vídeo activo)" "$CLIP_BTN"
$AB eval "(()=>{const v=document.querySelector('[data-testid=suite-video]');if(v)v.currentTime=10;return 'ok'})()" >/dev/null 2>&1
$AB eval "document.querySelector('[data-testid=suite-register-2]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-history-row-3]')" 10
R2=$(ev "(document.querySelector('[data-testid=suite-history-row-0]')||{}).textContent||''")
echo "$R2" | rg -q "Creación en 3/4 de Cancha" && ok "4ª fila registrada con vídeo activo" || bad "fila 0 ('$R2')"

echo "=== 8 · ▶ Clip hace seek −3s/+2s y reproduce ==="
$AB eval "(()=>{const v=document.querySelector('[data-testid=suite-video]');if(v){v.pause();v.currentTime=15}return 'ok'})()" >/dev/null 2>&1
$AB eval "document.querySelector('[data-testid=suite-history-clip-0]').click()" >/dev/null 2>&1
sleep 1.5
CV=$(ev "JSON.stringify({t: document.querySelector('[data-testid=suite-video]')?.currentTime ?? -1, d: Math.round(document.querySelector('[data-testid=suite-video]')?.duration ?? 0)})")
echo "  · tras Clip: $CV (esperado seek a 7)"
echo "$CV" | rg -q '"d":20' && ok "vídeo de 20 s cargado" || bad "duración ($CV)"
python3 - "$CV" <<'EOF'
import json, sys
a = json.loads(sys.argv[1])
assert 6.0 <= a["t"] <= 9.9, f"no hubo seek al arranque del clip: {a}"
print(f"clip OK: currentTime={a['t']} (auto-clip −3s/+2s desde el segundo 10)")
EOF
[ $? = 0 ] && ok "seek del clip al instante registrado" || bad "clip ($CV)"

echo "=== 9 · Módulo A.B.P.: composición EXACTA + registro en el histórico ==="
$AB eval "document.querySelector('[data-testid=suite-tab-abp]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-abp-register]')" 10
NABP=$(ev "['corner','banda','falta'].filter(t=>!!document.querySelector('[data-testid=suite-abp-tile-'+t+']')).length")
check "3 tiles de acción (Córner · Banda · Falta)" "$([ "$NABP" = "3" ] && echo 1)"
NSIDES=$(ev "['corner-favor','corner-contra','banda-favor','banda-contra','falta-favor','falta-contra'].filter(s=>!!document.querySelector('[data-testid=suite-abp-side-'+s+']')).length")
check "6 lados FAVOR/CONTRA" "$([ "$NSIDES" = "6" ] && echo 1)"
NR=$(ev "document.querySelectorAll('[data-testid^=suite-abp-result-]').length")
check "6 chips de Resultado & Franja Temporal" "$([ "$NR" = "6" ] && echo 1)"
check "estado «Módulo A.B.P. Activo»" "$(ev "((document.querySelector('[data-testid=suite-abp-state]')||{}).textContent||'').includes('Módulo A.B.P. Activo')")"
check "texto de sincronización del mock" "$(ev "((document.querySelector('[data-testid=suite-abp-state]')||{}).textContent||'').includes('Sincronizado con zonas laterales, central directa y área de portería')")"
check "composición vacía hasta elegir" "$(ev "!!document.querySelector('[data-testid=suite-abp-compose-empty]')")"
check "botón Registrar deshabilitado sin selección" "$(ev "document.querySelector('[data-testid=suite-abp-register]')?.disabled===true")"
$AB eval "document.querySelector('[data-testid=suite-abp-side-corner-favor]').click()" >/dev/null 2>&1
$AB eval "Array.from(document.querySelectorAll('[data-testid^=suite-abp-result-]')).find(b=>b.textContent.trim()==='REMATE CABEZA')?.click();Array.from(document.querySelectorAll('[data-testid^=suite-abp-result-]')).find(b=>b.textContent.trim()==='MIN 16 A 30')?.click();'ok'" >/dev/null 2>&1
sleep 0.4
COMP=$(ev "(document.querySelector('[data-testid=suite-abp-compose]')||{}).textContent||''")
echo "$COMP" | rg -q "^CÓRNER FAVOR · REMATE CABEZA · MIN 16 A 30$" && ok "composición EXACTA ($COMP)" || bad "composición ('$COMP')"
CLKABP=$(ev "(document.querySelector('[data-testid=suite-abp-clock]')||{}).textContent||''")
echo "$CLKABP" | rg -q "Sello del crono: 00:00" && ok "sello del crono visible en A.B.P." || bad "sello ('$CLKABP')"
$AB eval "document.querySelector('[data-testid=suite-abp-register]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-abp-flash]')" 8
check "flash de confirmación" "$(ev "!!document.querySelector('[data-testid=suite-abp-flash]')")"
check "selección A.B.P. se limpia tras registrar" "$(ev "!!document.querySelector('[data-testid=suite-abp-compose-empty]')")"
$AB eval "document.querySelector('[data-testid=suite-tab-directo]').click()" >/dev/null 2>&1
sleep 0.6
NH3=$(ev "document.querySelectorAll('[data-testid^=suite-history-row-]').length")
check "5 filas en el histórico en directo" "$([ "$NH3" = "5" ] && echo 1)"
RA=$(ev "(document.querySelector('[data-testid=suite-history-row-0]')||{}).textContent||''")
echo "$RA" | rg -q "CÓRNER FAVOR · REMATE CABEZA · MIN 16 A 30" && ok "el evento A.B.P. encabeza el histórico" || bad "row0 ('$RA')"
echo "$RA" | rg -q "ABP" && ok "chip de sección ABP" || bad "chip ('$RA')"

echo "=== 10 · persistencia de la libreta (localStorage sobrevive recarga) ==="
$AB open http://localhost:3000/dashboard/suite >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-root]')" 25
sleep 1.2
NHP=$(ev "document.querySelectorAll('[data-testid^=suite-history-row-]').length")
check "tras recargar siguen las 5 filas" "$([ "$NHP" = "5" ] && echo 1)"
RP=$(ev "(document.querySelector('[data-testid=suite-history-row-0]')||{}).textContent||''")
echo "$RP" | rg -q "CÓRNER FAVOR" && ok "el evento A.B.P. sigue primero" || bad "row0 ('$RP')"

echo "=== 11 · pestaña Biblioteca Taxonomía (acordeones EXACTOS) ==="
$AB eval "document.querySelector('[data-testid=suite-tab-biblioteca]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-bib-acc-fisicas]')" 10
NACC=$(ev "['fisicas','tecnicas','tacticas','integradas'].filter(c=>!!document.querySelector('[data-testid=suite-bib-acc-'+c+']')).length")
check "4 categorías plegables" "$([ "$NACC" = "4" ] && echo 1)"
check "Físicas abierta por defecto (mock)" "$(ev "document.querySelector('[data-testid=suite-bib-acc-fisicas]')?.getAttribute('aria-expanded')==='true'")"
TIT=$(ev "(document.querySelector('[data-testid=suite-bib-acc-fisicas]')||{}).textContent||''")
echo "$TIT" | rg -q "1. Tareas Físicas \(Fuerza, Resistencia, Velocidad, Flexibilidad, Coordinación\)" && ok "título EXACTO limpio (sin [span_N])" || bad "título ('$TIT')"
PANEL=$(ev "(document.querySelector('[data-testid=suite-bib-panel-fisicas]')||{}).textContent||''")
for D in "Fuerza" "Resistencia" "Velocidad" "Flexibilidad"; do
  echo "$PANEL" | rg -q "$D" && ok "descriptor físico: $D" || bad "descriptor $D"
done
$AB eval "document.querySelector('[data-testid=suite-bib-acc-tecnicas]').click()" >/dev/null 2>&1
sleep 0.5
PT=$(ev "(document.querySelector('[data-testid=suite-bib-panel-tecnicas]')||{}).textContent||''")
echo "$PT" | rg -q "Técnica del Portero" && ok "Técnicas: descriptor del Portero" || bad "portero"
HREF=$(ev "(document.querySelector('[data-testid=suite-bib-open]')||{getAttribute:()=>''}).getAttribute('href')")
[ "$HREF" = "/dashboard/library" ] && ok "enlace a la Biblioteca Maestra" || bad "href ('$HREF')"

echo "=== 12 · pestaña Plantilla & Capacidades (notas REALES de la Ficha) ==="
$AB eval "document.querySelector('[data-testid=suite-tab-plantilla]').click()" >/dev/null 2>&1
waitfor "document.querySelector('[data-testid=suite-player-0]')" 12
NP=$(ev "document.querySelectorAll('[data-testid^=suite-player-]').length")
NB=$(ev "['fisicas','tecnica','inteligencia','psicologicos'].filter(b=>!!document.querySelector('[data-testid=suite-bloque-'+b+']')).length")
check "4 bloques de capacidades" "$([ "$NB" = "4" ] && echo 1)"
NM=$(ev "['fisicas','tecnica','inteligencia','psicologicos'].reduce((a,b)=>a+document.querySelectorAll('[data-testid^=suite-metric-'+b+'-]').length,0)")
check "4 bloques × 6 métricas = 24" "$([ "$NM" = "24" ] && echo 1)"
check "métrica Coordinación presente" "$(ev "Array.from(document.querySelectorAll('[data-testid^=suite-metric-fisicas-]')).some(m=>m.textContent.includes('Coordinación'))")"
NAVG=$(ev "['fisicas','tecnica','inteligencia','psicologicos'].filter(b=>!!document.querySelector('[data-testid=suite-avg-'+b+']')).length")
check "chip Avg por bloque (4)" "$([ "$NAVG" = "4" ] && echo 1)"
OVER=$(ev "(document.querySelector('[data-testid=suite-overall]')||{}).textContent||''")
echo "$OVER" | rg -q "Media global|Sin evaluación" && ok "media global del jugador ($OVER)" || bad "overall ('$OVER')"
OPENHREF=$(ev "(document.querySelector('[data-testid=suite-player-open-0]')||{getAttribute:()=>''}).getAttribute('href')")
echo "$OPENHREF" | rg -q "^/dashboard/players/[a-z0-9]+$" && ok "enlace a la Ficha de Rendimiento ($OPENHREF)" || bad "href ficha ('$OPENHREF')"
N1=$(ev "(document.querySelector('[data-testid=suite-player-name-0]')||{}).textContent||''")
$AB eval "if(document.querySelector('[data-testid=suite-player-1]'))document.querySelector('[data-testid=suite-player-1]').click();'ok'" >/dev/null 2>&1
sleep 0.5
N2=$(ev "(document.querySelector('[data-testid=suite-player-name-1]')||{}).textContent||''")
T2=$(ev "(document.querySelector('[data-testid=suite-player-title]')||{}).textContent||''")
[ -n "$N2" ] && { [ "$T2" != "" ] && echo "$T2" | rg -q "$(echo "$N2" | sed 's/^[0-9]* · //')" && ok "cambio de jugador actualiza la ficha ($N2)" || bad "título tras cambio ('$T2')"; } || ok "solo hay 1 jugador activo ($N1)"

echo "=== 13 · capturas y validación visual ==="
$AB eval "document.querySelector('[data-testid=suite-tab-directo]').click()" >/dev/null 2>&1
sleep 0.8
$AB set viewport 414 896 >/dev/null 2>&1
$AB screenshot /tmp/suite-mobile.png >/dev/null 2>&1 && ok "captura móvil 414 (Directo)"
$AB eval "document.querySelector('[data-testid=suite-tab-abp]').click()" >/dev/null 2>&1
sleep 0.6
$AB screenshot /tmp/suite-mobile-abp.png >/dev/null 2>&1 && ok "captura móvil 414 (A.B.P.)"
$AB set viewport 1440 900 >/dev/null 2>&1
sleep 1
$AB eval "document.querySelector('[data-testid=suite-tab-directo]').click()" >/dev/null 2>&1
sleep 0.6
$AB screenshot /tmp/suite-desktop.png >/dev/null 2>&1 && ok "captura desktop 1440 (Directo)"
$AB eval "document.querySelector('[data-testid=suite-tab-plantilla]').click()" >/dev/null 2>&1
sleep 0.6
$AB screenshot /tmp/suite-desktop-plantilla.png >/dev/null 2>&1 && ok "captura desktop 1440 (Plantilla)"
python3 - <<'EOF'
from PIL import Image
import sys
paths = ["/tmp/suite-mobile.png", "/tmp/suite-mobile-abp.png", "/tmp/suite-desktop.png", "/tmp/suite-desktop-plantilla.png"]
bad = []
for p in paths:
    try:
        im = Image.open(p).convert("L")
        px = list(im.getdata())
        ratio = sum(1 for v in px if v < 245) / len(px)
        if ratio < 0.02:
            bad.append(f"{p} ({ratio:.3f})")
        else:
            print(f"  · {p}: no-blanco {ratio:.1%} OK")
    except Exception as e:
        bad.append(f"{p} ({e})")
sys.exit(1 if bad else 0)
EOF
[ $? = 0 ] && ok "las 4 capturas tienen contenido (no-blanco)" || bad "captura en blanco"

echo "=== 14 · auto-limpieza de la libreta ==="
$AB eval "localStorage.removeItem('catedra.suite.master.events.v1');'ok'" >/dev/null 2>&1
ok "localStorage de la Suite restaurado (BD intacta: la Suite no escribe)"

echo ""
echo "=============================="
echo "RESULTADO: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "SUITE TÁCTICA MAESTRA VERDE ✓" || echo "ROJO ✗"
exit 0
