#!/bin/bash
# Verificación visual en PRODUCCIÓN: pizarra global + detalle (3 pestañas) desktop/móvil
set -e
cd /home/z/my-project

# game_id real de producción (sesión python ya probada)
python3 - <<'EOF'
import re, urllib.request, urllib.parse, http.cookiejar
BASE="https://catedra-sooty.vercel.app"
jar=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
op.addheaders=[("User-Agent","Mozilla/5.0 (visual-catedra)")]
b=op.open(f"{BASE}/api/auth/csrf",timeout=60).read().decode()
csrf=re.search(r'"csrfToken":"([^"]+)"',b).group(1)
d=urllib.parse.urlencode({"csrfToken":csrf,"email":"mister@cfmetodo.es","password":"metodo2025","callbackUrl":BASE,"json":"true"}).encode()
op.open(urllib.request.Request(f"{BASE}/api/auth/callback/credentials",data=d,method="POST",headers={"Content-Type":"application/x-www-form-urlencoded"}),timeout=60)
mt=op.open(f"{BASE}/dashboard/matches",timeout=90).read().decode()
gm=re.findall(r"dashboard/match\?g=([a-zA-Z0-9:_-]+)",mt)
open("/tmp/gid.txt","w").write(gm[0] if gm else "")
print("game_id:", gm[0] if gm else "(ninguno)")
EOF

G=$(cat /tmp/gid.txt)
[ -n "$G" ] || { echo "SIN PARTIDOS"; exit 1; }

mkdir -p /tmp/shots
agent-browser close >/dev/null 2>&1 || true

agent-browser set viewport 1440 900
agent-browser open https://catedra-sooty.vercel.app >/dev/null
sleep 3
agent-browser find label "Email del cuerpo técnico" fill "mister@cfmetodo.es" >/dev/null
agent-browser find label "Contraseña" fill "metodo2025" >/dev/null
agent-browser press Enter >/dev/null
sleep 6
echo "tras login: $(agent-browser get url)"

# ---------- NAV DE 5 + PIZARRA GLOBAL (desktop) ----------
agent-browser open https://catedra-sooty.vercel.app/dashboard/pizarra >/dev/null
sleep 4
agent-browser screenshot /tmp/shots/prod-pizarra-desktop.png >/dev/null
echo "pizarra desktop OK"

# ---------- DETALLE DE PARTIDO (desktop, 3 pestañas) ----------
agent-browser open "https://catedra-sooty.vercel.app/dashboard/match?g=$G" >/dev/null
sleep 5
agent-browser screenshot /tmp/shots/prod-detalle-resumen.png >/dev/null
agent-browser find text "Vestuario (Notas)" click >/dev/null
sleep 2
agent-browser screenshot /tmp/shots/prod-detalle-vestuario.png >/dev/null
agent-browser find text "Guardar Datos" click >/dev/null
sleep 2
agent-browser screenshot /tmp/shots/prod-detalle-datos.png >/dev/null
echo "detalle desktop OK"

# ---------- MÓVIL ----------
agent-browser set device "iPhone 14" >/dev/null 2>&1 || agent-browser set viewport 390 844 >/dev/null
agent-browser open https://catedra-sooty.vercel.app/dashboard/pizarra >/dev/null
sleep 4
agent-browser screenshot /tmp/shots/prod-pizarra-movil.png >/dev/null
agent-browser open "https://catedra-sooty.vercel.app/dashboard/match?g=$G" >/dev/null
sleep 5
agent-browser screenshot /tmp/shots/prod-detalle-movil.png >/dev/null
echo "móvil OK"

agent-browser close >/dev/null
ls -la /tmp/shots/prod-*
