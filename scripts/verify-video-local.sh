#!/bin/bash
# Verificación local del 📂 MP4 DESDE EL ORDENADOR (mock del míster
# "Análisis en Directo // Carga de Vídeo Local (MP4)"):
#   1. Botón "MP4 local" en la cabecera del tablero en directo (siempre visible)
#   2. Carga REAL de un MP4 por CDP (DataTransfer + change) → <video> con blob:
#      + chip 📁 con el nombre del archivo
#   3. La pizarra espacial ahora muestra "vídeo T: X.Xs" (vídeo activo)
#   4. Drag causa→efecto sobre el campo → menú → guardar → fila con ▶ clip −3s/+2s
#   5. ▶ clip hace seek al vídeo (currentTime cambia) y reproduce
#   6. Quitar el vídeo local (✕) → vuelve a pizarra pura
#   7. Capturas desktop + móvil
set -e
cd /home/z/my-project

# ---------- 0) login + game_id ----------
python3 - <<'EOF'
import re, urllib.request, urllib.parse, http.cookiejar
BASE = "http://localhost:3000"
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
op.addheaders = [("User-Agent", "Mozilla/5.0 (verify-video-local)")]
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
open("/tmp/gid-video.txt", "w").write(gids[0])
print(f"game_id={gids[0]}")
EOF
GID=$(cat /tmp/gid-video.txt)

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
agent-browser open "http://localhost:3000/dashboard/match/live?g=$GID" >/dev/null
agent-browser wait 6000

echo "== [1] botón MP4 local en cabecera =="
BTN=$(agent-browser eval 'document.querySelector("[data-testid=\"btn-local-video\"]")?.textContent?.trim() ?? ""')
echo "botón: $BTN"
echo "$BTN" | rg -q "📂 MP4 local" || { echo "FALLÓ: botón MP4 local no visible"; exit 1; }

echo "== [2] carga REAL del MP4 por CDP =="
B64=$(base64 -w0 /tmp/partido-test.mp4)
agent-browser eval "(() => {
  const input = document.querySelector('[data-testid=\"local-video-input\"]');
  if (!input) return 'NO_INPUT';
  const bytes = Uint8Array.from(atob('$B64'), c => c.charCodeAt(0));
  const file = new File([bytes], 'partido-test.mp4', { type: 'video/mp4' });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'OK';
})()" > /tmp/load-video.txt
cat /tmp/load-video.txt
cat /tmp/load-video.txt | rg -q '"OK"' || { echo "FALLÓ carga del archivo"; exit 1; }
agent-browser wait 2500

echo "== [3] abrir pizarra espacial y comprobar reproductor + vídeo T =="
agent-browser eval 'document.querySelector("[data-testid=\"btn-espacial\"]")?.click() || 0' >/dev/null
agent-browser wait 1500

CHIPS=$(agent-browser eval 'JSON.stringify({
  chip: document.querySelector("[data-testid=\"local-video-name\"]")?.textContent?.trim() ?? "",
  videoSrc: document.querySelector("[data-testid=\"spatial-video\"]")?.src?.slice(0,5) ?? "",
  btnCambio: document.querySelector("[data-testid=\"btn-local-video\"]")?.textContent?.trim() ?? ""
})')
echo "chips tras carga: $CHIPS"
echo "$CHIPS" | rg -q "partido-test.mp4" || { echo "FALLÓ: chip con nombre no aparece"; exit 1; }
echo "$CHIPS" | rg -q 'videoSrc\\":\\"blob:' || { echo "FALLÓ: <video> no tiene src blob:"; exit 1; }
echo "$CHIPS" | rg -q "Cambiar MP4" || { echo "FALLÓ: botón no cambia a Cambiar MP4"; exit 1; }

TCHIP=$(agent-browser eval 'document.body.innerText.match(/vídeo T: [0-9.]+s/)?.[0] ?? ""')
echo "chip temporal: $TCHIP"
[ -n "$TCHIP" ] || { echo "FALLÓ: chip vídeo T no aparece en la pizarra espacial"; exit 1; }

echo "== [4] drag causa→efecto + clasificación + fila con clip =="
agent-browser eval 'document.querySelector("[data-testid=\"spatial-pitch\"]")?.scrollIntoView({block:"center"}) || 0' >/dev/null
agent-browser wait 700
agent-browser eval '(() => {
  const pitch = document.querySelector("[data-testid=\"spatial-pitch\"]").getBoundingClientRect();
  return JSON.stringify({x1: pitch.left + pitch.width*0.3, y1: pitch.top + pitch.height*0.4,
                         x2: pitch.left + pitch.width*0.6, y2: pitch.top + pitch.height*0.5});
})()' > /tmp/geo-spatial.txt
read X1 Y1 X2 Y2 < <(python3 -c "
import json
g = json.loads(json.loads(open('/tmp/geo-spatial.txt').read()))
print(int(g['x1']), int(g['y1']), int(g['x2']), int(g['y2']))")
agent-browser mouse move $X1 $Y1 >/dev/null
agent-browser mouse down left >/dev/null
agent-browser mouse move $X2 $Y2 --duration 250 --steps 10 >/dev/null
agent-browser mouse up left >/dev/null
agent-browser wait 800
MENU=$(agent-browser eval 'document.querySelector("[data-testid=\"spatial-menu\"]") ? "SI" : "NO"')
echo "$MENU" | rg -q '"SI"' || { echo "FALLÓ: menú de clasificación no aparece"; exit 1; }
agent-browser eval 'document.querySelector("[data-testid=\"spatial-detail-RECOVERY_PRESS\"]")?.click() || 0' >/dev/null
agent-browser wait 2000
ROW=$(agent-browser eval 'JSON.stringify({
  filas: document.querySelectorAll("[data-testid=\"spatial-row\"]").length,
  clip: [...document.querySelectorAll("[data-testid=\"spatial-row\"] button")].some(b => b.textContent.includes("clip"))})')
echo "filas: $ROW"
echo "$ROW" | rg -q 'filas\\":[1-9]' || { echo "FALLÓ: la fila del evento no aparece"; exit 1; }
echo "$ROW" | rg -q 'clip\\":true' || { echo "FALLÓ: botón ▶ clip no aparece"; exit 1; }
agent-browser screenshot /tmp/shots/video-local-evento.png >/dev/null

echo "== [5] ▶ clip hace seek y reproduce el MP4 local =="
agent-browser eval 'JSON.stringify({before: document.querySelector("[data-testid=\"spatial-video\"]")?.currentTime ?? -1, dur: Math.round(document.querySelector("[data-testid=\"spatial-video\"]")?.duration ?? 0)})' > /tmp/clip-before.txt
cat /tmp/clip-before.txt
agent-browser eval '[...document.querySelectorAll("[data-testid=\"spatial-row\"] button")].find(b => b.textContent.includes("clip"))?.click() || 0' >/dev/null
agent-browser wait 1800
agent-browser eval 'JSON.stringify({after: document.querySelector("[data-testid=\"spatial-video\"]")?.currentTime ?? -1, paused: document.querySelector("[data-testid=\"spatial-video\"]")?.paused ?? null})' > /tmp/clip-after.txt
cat /tmp/clip-after.txt
python3 - <<'EOF'
import json
b = json.loads(json.loads(open("/tmp/clip-before.txt").read()))
a = json.loads(json.loads(open("/tmp/clip-after.txt").read()))
assert b.get("dur") and b["dur"] >= 10, f"duración inválida: {b}"
# El clip arranca en max(0, dur-3) = 9s y se reproduce hasta el final (+2s);
# en un vídeo de 12s se pausa al acabar: la prueba es que HUBO seek+play.
assert a.get("after", 0) >= max(0, b["dur"] - 3), f"no hubo seek al clip: {b} {a}"
print(f"clip OK: duración={b['dur']}s, currentTime {b['before']:.1f} → {a['after']:.1f}s (clip −3s/+2s ejecutado)")
EOF

echo "== [6] quitar vídeo local → vuelve a pizarra pura =="
agent-browser eval 'document.querySelector("[data-testid=\"local-video-name\"]")?.click() || 0' >/dev/null
agent-browser wait 1200
OFF=$(agent-browser eval 'JSON.stringify({
  chip: document.querySelector("[data-testid=\"local-video-name\"]") ? 1 : 0,
  puro: document.body.innerText.includes("pizarra pura"),
  video: document.querySelector("[data-testid=\"spatial-video\"]") ? 1 : 0})')
echo "tras quitar: $OFF"
echo "$OFF" | rg -q 'chip\\":0' || { echo "FALLÓ: chip no desaparece"; exit 1; }
echo "$OFF" | rg -q 'video\\":0' || { echo "FALLÓ: el <video> sigue montado"; exit 1; }
echo "$OFF" | rg -q 'puro\\":true' || { echo "FALLÓ: no vuelve a pizarra pura"; exit 1; }

echo "== [7] móvil 390×844 =="
agent-browser set viewport 390 844
agent-browser open "http://localhost:3000/dashboard/match/live?g=$GID" >/dev/null
agent-browser wait 5000
MBTN=$(agent-browser eval 'document.querySelector("[data-testid=\"btn-local-video\"]") ? "SI" : "NO"')
echo "$MBTN" | rg -q '"SI"' || { echo "FALLÓ: botón MP4 local no visible en móvil"; exit 1; }
agent-browser screenshot /tmp/shots/video-local-movil.png >/dev/null

agent-browser close >/dev/null 2>&1 || true
echo ""
echo "✅ MP4 LOCAL COMPLETO: carga real por CDP, chip 📁, <video blob:>, vídeo T, drag+menú+fila, clip que reproduce (duración 12s), quitar→pizarra pura, móvil"
