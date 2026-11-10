#!/bin/bash
# Verificación local de FICHAS + BALÓN arrastrables en la pizarra libre:
# saca 11 propios (plantilla real) + 11 rivales + balón, y arrastra con
# eventos de ratón REALES (CDP → Pointer Events) el balón hasta un jugador
# (snap "al pie") y una ficha rival al centro. Desktop + móvil.
set -e
cd /home/z/my-project

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

agent-browser open http://localhost:3000/dashboard/pizarra >/dev/null
agent-browser wait 6000

# ---------- 1) Sacar fichas (por ref del snapshot: método fiable) ----------
sacar() {
  local nombre="$1" ref
  for i in 1 2 3 4 5; do
    ref=$(agent-browser snapshot 2>/dev/null | rg -o "button \"$nombre\" \[ref=([a-z0-9]+)\]" -r '$1' | head -1)
    if [ -n "$ref" ] && agent-browser click "@$ref" >/dev/null 2>&1; then return 0; fi
    agent-browser wait 2500
  done
  echo "FALLÓ botón: $nombre"; exit 1
}
sacar "Propios 4-3-3"
sleep 0.5
sacar "Rivales 4-3-3"
sleep 0.5
sacar "Balón"
sleep 1
# La fila "Volcar once" (alineación sincronizada) puede empujar el campo bajo
# el pliegue: lo centramos en pantalla antes de medir coordenadas de ratón.
agent-browser eval 'document.querySelector("[role=\"application\"]")?.scrollIntoView({block: "center"})' >/dev/null
agent-browser wait 1200
agent-browser screenshot /tmp/shots/fichas-iniciales.png
echo "fichas sacadas (captura inicial)"

# ---------- 2) Coordenadas reales (pitch, balón, LW propio 7, rival GK) ----------
GEO=$(agent-browser eval '(() => {
  const pitch = document.querySelector("[role=\"application\"]").getBoundingClientRect();
  const fichas = [...document.querySelectorAll("div.absolute.z-20")];
  const ball = document.querySelector("[aria-label=\"Balón arrastrable\"]")?.getBoundingClientRect();
  const lw = fichas.map(f => f.getBoundingClientRect()).find(r => r.top < pitch.top + pitch.height * 0.35 && r.left < pitch.left + pitch.width * 0.6 && r.left > pitch.left);
  const rivalGK = fichas.map(f => f.getBoundingClientRect()).find(r => r.left > pitch.left + pitch.width * 0.85);
  const c = r => r ? {x: r.left + r.width/2, y: r.top + r.height/2} : null;
  return JSON.stringify({pitch: {l: pitch.left, t: pitch.top, w: pitch.width, h: pitch.height}, ball: c(ball), lw: c(lw), rivalGK: c(rivalGK)});
})()')
echo "GEO=$GEO"
echo "$GEO" > /tmp/geo.txt

python3 - <<'EOF'
import json
geo = json.loads(json.loads(open("/tmp/geo.txt").read()))
p = geo["pitch"]; ball = geo["ball"]; lw = geo["lw"]; rgk = geo["rivalGK"]
assert ball and lw and rgk, f"faltan elementos: {geo}"
# destino del balón: al pie del LW propio (a la derecha de él)
dest = (lw["x"] + 22, lw["y"])
# destino del rival GK: el punto central (75,30 en svg units)
dest_gk = (p["l"] + p["w"] * 75 / 150, p["t"] + p["h"] * 30 / 100)
print(f"BALL_START={ball['x']:.0f},{ball['y']:.0f} LW={lw['x']:.0f},{lw['y']:.0f} RGK={rgk['x']:.0f},{rgk['y']:.0f}")
print(f"DRAG_BALL={ball['x']:.0f} {ball['y']:.0f} {dest[0]:.0f} {dest[1]:.0f}")
print(f"DRAG_GK={rgk['x']:.0f} {rgk['y']:.0f} {dest_gk[0]:.0f} {dest_gk[1]:.0f} EXPECT={dest_gk[0]:.0f},{dest_gk[1]:.0f}")
open("/tmp/drag1.txt","w").write(f"{ball['x']:.0f} {ball['y']:.0f} {dest[0]:.0f} {dest[1]:.0f}\n")
open("/tmp/drag2.txt","w").write(f"{rgk['x']:.0f} {rgk['y']:.0f} {dest_gk[0]:.0f} {dest_gk[1]:.0f}\n")
EOF

# ---------- 3) DRAG real 1: balón → al pie del LW (snap) ----------
read BX BY TX TY < /tmp/drag1.txt
agent-browser mouse move $BX $BY >/dev/null
agent-browser mouse down left >/dev/null
agent-browser mouse move $TX $TY --duration 300 --steps 15 >/dev/null
agent-browser mouse up left >/dev/null
sleep 1
echo "drag balón hecho"

# ---------- 4) DRAG real 2: ficha rival GK → centro ----------
read GX GY TX2 TY2 < /tmp/drag2.txt
agent-browser mouse move $GX $GY >/dev/null
agent-browser mouse down left >/dev/null
agent-browser mouse move $TX2 $TY2 --duration 300 --steps 15 >/dev/null
agent-browser mouse up left >/dev/null
sleep 1
echo "drag rival hecho"
agent-browser screenshot /tmp/shots/fichas-drag.png

# ---------- 5) Verificar posiciones finales ----------
agent-browser eval '(() => {
  const pitch = document.querySelector("[role=\"application\"]").getBoundingClientRect();
  const fichas = [...document.querySelectorAll("div.absolute.z-20, div.absolute.z-30")];
  const ball = document.querySelector("[aria-label=\"Balón arrastrable\"]")?.getBoundingClientRect();
  const c = r => r ? {x: r.left + r.width/2, y: r.top + r.height/2} : null;
  const svgU = (pt) => ({x: (pt.x - pitch.left)/pitch.width*150, y: (pt.y - pitch.top)/pitch.height*100});
  const lw = fichas.map(f => f.getBoundingClientRect()).find(r => r.top < pitch.top + pitch.height * 0.35 && r.left < pitch.left + pitch.width * 0.6 && r.left > pitch.left);
  return JSON.stringify({ballSvg: svgU(c(ball)), lwSvg: svgU(c(lw))});
})()' > /tmp/final.txt
cat /tmp/final.txt
python3 - <<'EOF'
import json
raw = open("/tmp/final.txt").read().strip()
data = json.loads(json.loads(raw)) if raw.startswith('"') else json.loads(raw)
b, lw = data["ballSvg"], data["lwSvg"]
dx, dy = abs(b["x"] - lw["x"]), abs(b["y"] - lw["y"])
# al pie: pegado al jugador (<= ~6 svg units) y NO en el centro inicial
centro = abs(b["x"] - 75) < 2 and abs(b["y"] - 50) < 2
pegado = (dx + dy) <= 8
print(f"ball=({b['x']:.1f},{b['y']:.1f}) lw=({lw['x']:.1f},{lw['y']:.1f}) dx+dy={dx+dy:.1f}")
assert pegado and not centro, f"SNAP FALLÓ: dx={dx:.1f} dy={dy:.1f} centro={centro}"
print("✅ BALÓN ARRASTRADO Y SNAP AL PIE DEL JUGADOR OK")
EOF

# ---------- 6) DIBUJO DE FLECHAS (mock: pizarra pura "Dibujo, Fichas y Balón") ----------
# Modo dibujo: trazo arrastrado desde el césped al balón → flecha blanca
# enganchada; trazo desde una ficha rival → flecha ROJA que nace en el rival.
sacar "Dibujar flechas"
sleep 0.5
read BX BY TX TY < /tmp/drag1.txt
# flecha 1: desde el punto donde estaba el balón al inicio (césped) hasta el balón actual
agent-browser mouse move $BX $BY >/dev/null
agent-browser mouse down left >/dev/null
agent-browser mouse move $TX $TY --duration 250 --steps 12 >/dev/null
agent-browser mouse up left >/dev/null
sleep 0.8
# flecha 2: nace SOBRE el rival GK (ahora en el centro) y muere cerca del balón
GEO2=$(agent-browser eval '(() => {
  const rival = document.querySelector("[aria-label^=\"Ficha rival 1\"]")?.getBoundingClientRect();
  const ball = document.querySelector("[aria-label=\"Balón arrastrable\"]")?.getBoundingClientRect();
  const c = r => r ? {x: r.left + r.width/2, y: r.top + r.height/2} : null;
  return JSON.stringify({rival: c(rival), ball: c(ball)});
})()')
echo "$GEO2" > /tmp/geo-flecha.txt
python3 - <<'EOF'
import json
geo = json.loads(json.loads(open("/tmp/geo-flecha.txt").read()))
r, b = geo["rival"], geo["ball"]
assert r and b, f"faltan elementos: {geo}"
open("/tmp/drag3.txt","w").write(f"{r['x']:.0f} {r['y']:.0f} {b['x']+18:.0f} {b['y']-14:.0f}\n")
EOF
read FX FY TX3 TY3 < /tmp/drag3.txt
agent-browser mouse move $FX $FY >/dev/null
agent-browser mouse down left >/dev/null
agent-browser mouse move $TX3 $TY3 --duration 250 --steps 12 >/dev/null
agent-browser mouse up left >/dev/null
sleep 0.8
agent-browser eval '(() => {
  const flechas = [...document.querySelectorAll("svg line[marker-end]")].filter(l => l.getAttribute("stroke") !== "transparent");
  const colores = flechas.map(l => l.getAttribute("marker-end"));
  const rojas = colores.filter(c => c?.includes("rojo")).length;
  return JSON.stringify({total: flechas.length, rojas});
})()' > /tmp/flechas.txt
cat /tmp/flechas.txt
python3 - <<'EOF'
import json
raw = open("/tmp/flechas.txt").read().strip()
data = json.loads(json.loads(raw)) if raw.startswith('"') else json.loads(raw)
assert data["total"] >= 2, f"esperaba >=2 flechas, hay {data['total']}"
assert data["rojas"] >= 1, f"esperaba >=1 flecha roja (desde ficha rival), hay {data['rojas']}"
print(f"✅ FLECHAS DIBUJADAS OK: {data['total']} trazos, {data['rojas']} roja(s) enganchada(s) al rival")
EOF
agent-browser screenshot /tmp/shots/flechas-dibujadas.png

# ---------- 7) Restablecer Posiciones (mock: formación estándar) ----------
sacar "Restablecer Posiciones"
sleep 1.2
agent-browser eval '(() => {
  const pitch = document.querySelector("[role=\"application\"]").getBoundingClientRect();
  const fichas = [...document.querySelectorAll("div.absolute.z-20, div.absolute.z-30")];
  const c = r => ({x: (r.left + r.width/2 - pitch.left)/pitch.width*150, y: (r.top + r.height/2 - pitch.top)/pitch.height*100});
  const ball = document.querySelector("[aria-label=\"Balón arrastrable\"]")?.getBoundingClientRect();
  const b = ball ? c(ball) : null;
  const gk = fichas.map(f => f.getBoundingClientRect()).map(c).find(p => p.x < 14 && p.y > 40 && p.y < 60);
  const balonCentro = b && Math.abs(b.x - 75) < 3 && Math.abs(b.y - 50) < 3;
  return JSON.stringify({gk: gk ?? null, balonCentro});
})()' > /tmp/reset.txt
cat /tmp/reset.txt
python3 - <<'EOF'
import json
raw = open("/tmp/reset.txt").read().strip()
data = json.loads(json.loads(raw)) if raw.startswith('"') else json.loads(raw)
assert data["gk"], "no hay ficha propia en la zona del portero tras Restablecer"
assert data["balonCentro"], f"balón no está en el centro: {data}"
print(f"✅ RESTABLECER OK: portero en su área, balón al centro")
EOF

# ---------- 8) Móvil: fichas visibles ----------
agent-browser set device "iPhone 14" >/dev/null 2>&1 || agent-browser set viewport 390 844 >/dev/null
agent-browser open http://localhost:3000/dashboard/pizarra >/dev/null
agent-browser wait 5000
sacar "Propios 4-3-3"
sleep 0.5
sacar "Rivales 4-3-3"
sleep 0.5
sacar "Balón"
sleep 1
agent-browser screenshot /tmp/shots/fichas-movil.png
echo "móvil OK"

agent-browser close >/dev/null
ls -la /tmp/shots/fichas-* /tmp/shots/flechas-*
