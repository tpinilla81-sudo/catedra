#!/bin/bash
# Verificación local de la PIZARRA EN DIRECTO táctil (mock del míster):
#   · Consejero de once ⚡ propone la alineación (titulares volcados)
#   · Balón arrastrable con snap "al pie del titular" (drag REAL por CDP)
#   · Ficha rival arrastrable (drag REAL)
#   · Titular arrastrable que NO abre la ficha rápida al arrastrar…
#   · …pero un TAP sin arrastre SÍ la abre (regresión del suppression)
# Desktop + captura móvil.
set -e
cd /home/z/my-project

# ---------- 0) game_id real (login python → primer partido) ----------
python3 - <<'EOF'
import re, urllib.request, urllib.parse, http.cookiejar
BASE = "http://localhost:3000"
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
op.addheaders = [("User-Agent", "Mozilla/5.0 (verify-live-fichas)")]
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
if not gids:
    gids = re.findall(r"dashboard/match\?g=([a-zA-Z0-9:_-]+)", mt)
assert gids, "no hay partidos"
open("/tmp/gid-live.txt", "w").write(gids[0])
print(f"game_id={gids[0]}")
EOF
GID=$(cat /tmp/gid-live.txt)

ss -ltn | rg -q ":3000 " || { npx next dev -p 3000 > /tmp/next-dev.log 2>&1 & }
for i in $(seq 1 30); do curl -sf -o /dev/null --max-time 3 http://localhost:3000/api/auth/csrf && break; sleep 2; done

mkdir -p /tmp/shots
agent-browser close >/dev/null 2>&1 || true
agent-browser set viewport 1440 900
agent-browser open http://localhost:3000 >/dev/null
sleep 2
agent-browser find label "Email del cuerpo técnico" fill "mister@cfmetodo.es" >/dev/null
agent-browser find label "Contraseña" fill "metodo2025" >/dev/null
agent-browser press Enter >/dev/null
sleep 5
echo "tras login: $(agent-browser get url)"

agent-browser open "http://localhost:3000/dashboard/match/live?g=$GID" >/dev/null
agent-browser wait 6000

# ---------- 1) Consejero de once ⚡ → titulares volcados ----------
consejero() {
  local ref
  for i in 1 2 3 4 5; do
    ref=$(agent-browser snapshot 2>/dev/null | rg -o "button \"Consejero de once\" \[ref=([a-z0-9]+)\]" -r '$1' | head -1)
    if [ -n "$ref" ] && agent-browser click "@$ref" >/dev/null 2>&1; then return 0; fi
    agent-browser wait 2500
  done
  echo "FALLÓ el botón Consejero"; exit 1
}
consejero
sleep 3
CNT=$(agent-browser eval 'document.body.innerText.match(/(\d+) titulares volcados/)?.[1] ?? "0"')
echo "titulares tras consejero: $CNT"
[ "$CNT" != "0" ] || { echo "FALLÓ: el consejero no volcó titulares"; exit 1; }

# ---------- 2) Balón + rivales ----------
boton() {
  local nombre="$1" ref
  for i in 1 2 3 4 5; do
    ref=$(agent-browser snapshot 2>/dev/null | rg -o "button \"$nombre\" \[ref=([a-z0-9]+)\]" -r '$1' | head -1)
    if [ -n "$ref" ] && agent-browser click "@$ref" >/dev/null 2>&1; then return 0; fi
    agent-browser wait 2000
  done
  echo "FALLÓ botón: $nombre"; exit 1
}
boton "Balón"
sleep 0.5
boton "Rivales 4-3-3"
sleep 1
N_RIV=$(agent-browser eval 'document.querySelectorAll("[aria-label^=\"Ficha rival \"]").length')
[ "$N_RIV" = "11" ] || { echo "FALLÓ: rivales=$N_RIV (esperaba 11)"; exit 1; }
echo "balón + 11 rivales en campo"
agent-browser screenshot /tmp/shots/live-fichas-iniciales.png

# ---------- 3) GEO: pitch, balón, titular más alto (delantero) ----------
agent-browser eval '(() => {
  const pitch = document.querySelector("[aria-label^=\"Terreno de juego táctil\"]").getBoundingClientRect();
  const ball = document.querySelector("[aria-label^=\"Balón arrastrable\"]")?.getBoundingClientRect();
  const starters = [...document.querySelectorAll("button[title=\"Arrastra para explicar · toca para evaluar\"]")]
    .map(b => b.getBoundingClientRect());
  const objetivo = starters.sort((a, b) => a.top - b.top)[0]; // el más arriba (ATT)
  const c = r => r ? {x: r.left + r.width/2, y: r.top + r.height/2} : null;
  return JSON.stringify({pitch: {l: pitch.left, t: pitch.top, w: pitch.width, h: pitch.height},
    ball: c(ball), objetivo: c(objetivo)});
})()' > /tmp/geo-live.txt
cat /tmp/geo-live.txt

python3 - <<'EOF'
import json
geo = json.loads(json.loads(open("/tmp/geo-live.txt").read()))
p, ball, obj = geo["pitch"], geo["ball"], geo["objetivo"]
assert ball and obj, f"faltan elementos: {geo}"
# destino del balón: el CENTRO del titular objetivo (dist 0 → snap al pie)
print(f"DRAG_BALL={ball['x']:.0f} {ball['y']:.0f} {obj['x']:.0f} {obj['y']:.0f}")
open("/tmp/drag-ball.txt","w").write(f"{ball['x']:.0f} {ball['y']:.0f} {obj['x']:.0f} {obj['y']:.0f}\n")
open("/tmp/geo-live2.txt","w").write(json.dumps({"pitch": p, "obj": obj}))
EOF

# ---------- 4) DRAG real: balón → centro del titular → snap al pie ----------
read BX BY TX TY < /tmp/drag-ball.txt
agent-browser mouse move $BX $BY >/dev/null
agent-browser mouse down left >/dev/null
agent-browser mouse move $TX $TY --duration 300 --steps 15 >/dev/null
agent-browser mouse up left >/dev/null
sleep 1
echo "drag balón hecho"

# ---------- 4b) Verificar SNAP del balón al pie del titular (ahora, antes de moverlo) ----------
agent-browser eval "JSON.stringify((() => {
  const pitch = document.querySelector('[aria-label^=\"Terreno de juego táctil\"]').getBoundingClientRect();
  const ball = document.querySelector('[aria-label^=\"Balón arrastrable\"]')?.getBoundingClientRect();
  const st = [...document.querySelectorAll('button[title=\"Arrastra para explicar · toca para evaluar\"]')]
    .map(x => x.getBoundingClientRect());
  const c = r => r ? {x: r.left + r.width/2, y: r.top + r.height/2} : null;
  const pct = (pt) => ({x: (pt.x - pitch.left) / pitch.width * 100, y: (pt.y - pitch.top) / pitch.height * 100});
  const ballP = pct(c(ball));
  let cerca = null, distMin = 999;
  for (const s of st) {
    const p = pct(c(s));
    const d = Math.hypot(p.x - ballP.x, p.y - ballP.y);
    if (d < distMin) { distMin = d; cerca = p; }
  }
  return JSON.stringify({ball: ballP, cerca, dist: distMin});
})())" > /tmp/snap-live.txt
cat /tmp/snap-live.txt
python3 - <<'EOF'
import json
def deep(path):
    d = open(path).read().strip()
    for _ in range(4):
        try:
            v = json.loads(d)
        except Exception:
            break
        d = v
        if not isinstance(d, str):
            return d
    return json.loads(d) if isinstance(d, str) else d
d = deep("/tmp/snap-live.txt")
ball, cerca, dist = d["ball"], d["cerca"], d["dist"]
print(f"ball=({ball['x']:.1f},{ball['y']:.1f}) jugador cercano=({cerca['x']:.1f},{cerca['y']:.1f}) dist={dist:.1f}")
# snap al pie: separación ≈ 9 (% del ancho) tras soltarlo ENCIMA del jugador; nunca en el centro inicial
assert 6.5 <= dist <= 12.5, f"SNAP FALLÓ: dist={dist:.1f}"
assert not (abs(ball["x"] - 50) < 2 and abs(ball["y"] - 46) < 2), "el balón no se movió de su posición inicial"
print("✅ LIVE: balón con SNAP al pie del titular OK")
EOF

# ---------- 5) DRAG real: ficha rival R1 → centro del campo ----------
agent-browser eval "JSON.stringify((() => {
  const r = document.querySelector('[aria-label=\"Ficha rival 1, arrastrable\"]').getBoundingClientRect();
  const pitch = document.querySelector('[aria-label^=\"Terreno de juego táctil\"]').getBoundingClientRect();
  const from = {x: r.left + r.width/2, y: r.top + r.height/2};
  const to = {x: pitch.left + pitch.width * 0.5, y: pitch.top + pitch.height * 0.5};
  return JSON.stringify({fx: Math.round(from.x), fy: Math.round(from.y), tx: Math.round(to.x), ty: Math.round(to.y)});
})())" > /tmp/r1-drag.txt
python3 - <<'EOF'
import json
def deep(path):
    d = open(path).read().strip()
    for _ in range(4):
        try:
            v = json.loads(d)
        except Exception:
            break
        d = v
        if not isinstance(d, str):
            return d
    return json.loads(d) if isinstance(d, str) else d
d = deep("/tmp/r1-drag.txt")
open("/tmp/r1-drag2.txt","w").write(f"{d['fx']} {d['fy']} {d['tx']} {d['ty']}\n")
EOF
read FX FY TX2 TY2 < /tmp/r1-drag2.txt
agent-browser mouse move $FX $FY >/dev/null
agent-browser mouse down left >/dev/null
agent-browser mouse move $TX2 $TY2 --duration 300 --steps 15 >/dev/null
agent-browser mouse up left >/dev/null
sleep 1
echo "drag rival hecho"

# ---------- 6) DRAG real: titular → medio campo derecho (NO debe abrir ficha) ----------
agent-browser eval "JSON.stringify((() => {
  const b = [...document.querySelectorAll('button[title=\"Arrastra para explicar · toca para evaluar\"]')]
    .map(x => x.getBoundingClientRect()).sort((a, b) => a.top - b.top)[0];
  const pitch = document.querySelector('[aria-label^=\"Terreno de juego táctil\"]').getBoundingClientRect();
  const from = {x: b.left + b.width/2, y: b.top + b.height/2};
  const to = {x: pitch.left + pitch.width * 0.78, y: pitch.top + pitch.height * 0.5};
  return JSON.stringify({fx: Math.round(from.x), fy: Math.round(from.y), tx: Math.round(to.x), ty: Math.round(to.y)});
})())" > /tmp/st-drag.txt
python3 - <<'EOF'
import json
def deep(path):
    d = open(path).read().strip()
    for _ in range(4):
        try:
            v = json.loads(d)
        except Exception:
            break
        d = v
        if not isinstance(d, str):
            return d
    return json.loads(d) if isinstance(d, str) else d
d = deep("/tmp/st-drag.txt")
open("/tmp/st-drag2.txt","w").write(f"{d['fx']} {d['fy']} {d['tx']} {d['ty']}\n")
EOF
read SX SY TX3 TY3 < /tmp/st-drag2.txt
agent-browser mouse move $SX $SY >/dev/null
agent-browser mouse down left >/dev/null
agent-browser mouse move $TX3 $TY3 --duration 300 --steps 15 >/dev/null
agent-browser mouse up left >/dev/null
sleep 1
DIALOG=$(agent-browser eval 'document.querySelector("[role=\"dialog\"]") ? "si" : "no"' | tr -d '"')
[ "$DIALOG" = "no" ] || { echo "FALLÓ: el arrastre del titular abrió la ficha rápida"; exit 1; }
echo "drag titular hecho SIN abrir la ficha rápida ✓"
agent-browser screenshot /tmp/shots/live-fichas-drag.png

# ---------- 7) Verificar snap del balón + posición del rival + titular ----------
agent-browser eval "JSON.stringify((() => {
  const pitch = document.querySelector('[aria-label^=\"Terreno de juego táctil\"]').getBoundingClientRect();
  const ball = document.querySelector('[aria-label^=\"Balón arrastrable\"]')?.getBoundingClientRect();
  const r1 = document.querySelector('[aria-label=\"Ficha rival 1, arrastrable\"]')?.getBoundingClientRect();
  const st = [...document.querySelectorAll('button[title=\"Arrastra para explicar · toca para evaluar\"]')]
    .map(x => x.getBoundingClientRect());
  const c = r => r ? {x: r.left + r.width/2, y: r.top + r.height/2} : null;
  const pct = (pt) => ({x: (pt.x - pitch.left) / pitch.width * 100, y: (pt.y - pitch.top) / pitch.height * 100});
  return JSON.stringify({ball: pct(c(ball)), r1: pct(c(r1)), st: st.map(s => pct(c(s)))});
})())" > /tmp/final-live.txt
cat /tmp/final-live.txt
python3 - <<'EOF'
import json
def deep(path):
    d = open(path).read().strip()
    for _ in range(4):
        try:
            v = json.loads(d)
        except Exception:
            break
        d = v
        if not isinstance(d, str):
            return d
    return json.loads(d) if isinstance(d, str) else d
d = deep("/tmp/final-live.txt")
ball, r1 = d["ball"], d["r1"]
st = d["st"]
print(f"ball=({ball['x']:.1f},{ball['y']:.1f}) rival1=({r1['x']:.1f},{r1['y']:.1f})")
# rival 1 movido al centro (≈ 50,50)
assert abs(r1["x"] - 50) < 4 and abs(r1["y"] - 50) < 4, f"RIVAL NO LLEGÓ AL CENTRO: {r1}"
# el titular arrastrado acabó cerca de (78, 50) — el arrastre de fichas funciona
alguno = any(abs(p["x"] - 78) < 4 and abs(p["y"] - 50) < 5 for p in st)
assert alguno, f"NINGÚN TITULAR llegó a (78,50): {st}"
print("✅ LIVE: rival al centro + titular arrastrado a su destino OK")
EOF

# ---------- 8) TAP en titular (sin arrastre) → ficha rápida SÍ se abre ----------
agent-browser eval "JSON.stringify((() => {
  const b = [...document.querySelectorAll('button[title=\"Arrastra para explicar · toca para evaluar\"]')]
    .map(x => x.getBoundingClientRect()).sort((a, b) => a.top - b.top)[0];
  return JSON.stringify({x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2)});
})())" > /tmp/st-tap.txt
python3 - <<'EOF'
import json
def deep(path):
    d = open(path).read().strip()
    for _ in range(4):
        try:
            v = json.loads(d)
        except Exception:
            break
        d = v
        if not isinstance(d, str):
            return d
    return json.loads(d) if isinstance(d, str) else d
d = deep("/tmp/st-tap.txt")
open("/tmp/st-tap2.txt","w").write(f"{d['x']} {d['y']}\n")
EOF
read KX KY < /tmp/st-tap2.txt
agent-browser mouse move $KX $KY >/dev/null
agent-browser mouse down left >/dev/null
agent-browser mouse up left >/dev/null
sleep 1
DIALOG2=$(agent-browser eval 'document.querySelector("[role=\"dialog\"]") ? "si" : "no"' | tr -d '"')
[ "$DIALOG2" = "si" ] || { echo "FALLÓ: el tap en el titular ya no abre la ficha rápida (regresión)"; exit 1; }
echo "tap en titular abre la ficha rápida ✓"
agent-browser screenshot /tmp/shots/live-ficha-rapida.png
agent-browser press Escape >/dev/null
sleep 0.5

# ---------- 9) Móvil: material visible ----------
agent-browser set device "iPhone 14" >/dev/null 2>&1 || agent-browser set viewport 390 844 >/dev/null
agent-browser open "http://localhost:3000/dashboard/match/live?g=$GID" >/dev/null
agent-browser wait 5000
agent-browser screenshot /tmp/shots/live-fichas-movil.png
echo "móvil OK"

agent-browser close >/dev/null
ls -la /tmp/shots/live-fichas-*
