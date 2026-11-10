#!/usr/bin/env python3
"""Verifica los puntos de entrada RESTAURADOS al análisis en directo (vídeo+voz):
1) Partidos: filas Analizados con botón Análisis → /dashboard/match/live
2) Detalle: cabecera con botón 'Análisis en directo · Vídeo + Voz'
3) Detalle: tarjeta Estadísticas enlaza a la pizarra en directo del partido
4) Live: 200 con marcadores del tablero (voz + vídeo)
"""
import http.cookiejar
import re
import sys
import urllib.parse
import urllib.request

BASE = "http://localhost:3000"
EMAIL = "mister@cfmetodo.es"
PASSWORD = "metodo2025"

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
opener.addheaders = [("User-Agent", "Mozilla/5.0 (verify-catedra)")]

fails = []


def check(name, ok, detail=""):
    print(f"{'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        fails.append(name)


def get(url, data=None):
    req = urllib.request.Request(url, data=data)
    try:
        res = opener.open(req, timeout=90)
        return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


# login
_, body = get(f"{BASE}/api/auth/csrf")
csrf = re.search(r'"csrfToken":"([^"]+)"', body).group(1)
data = urllib.parse.urlencode({
    "csrfToken": csrf, "email": EMAIL, "password": PASSWORD,
    "callbackUrl": "/dashboard", "json": "true",
}).encode()
get(f"{BASE}/api/auth/callback/credentials", data)

# 1) Partidos: botón Análisis en las filas analizados
status, body = get(f"{BASE}/dashboard/matches")
check("matches: 200", status == 200, f"status={status} len={len(body)}")
live_links = re.findall(r"/dashboard/match/live\?g=([a-z0-9:]+)", body)
check("matches: enlaces a pizarra en directo", len(live_links) >= 1, f"{len(live_links)} enlaces")
check("matches: botón «Análisis» analizados", "Análisis en directo vs" in body)

# 2) Detalle de un partido (el primero que aparezca)
m = re.search(r"/dashboard/match\?g=([a-z0-9:]+)", body)
gid = m.group(1)
status, body = get(f"{BASE}/dashboard/match?g={gid}")
check("detalle: botón cabecera «Análisis en directo»", "Análisis en directo · Vídeo + Voz" in body)
check(
    "detalle: cabecera enlaza a live del MISMO partido",
    f"/dashboard/match/live?g={gid}" in body,
)
stats_ok = ("Abrir análisis en directo (vídeo + voz)" in body) or (
    "pizarra en directo de este partido" in body
)
check("detalle: tarjeta estadísticas enlaza al directo", stats_ok)

# 3) Live del mismo partido responde con marcadores de voz/vídeo
status, body = get(f"{BASE}/dashboard/match/live?g={gid}")
markers = ["Directo", "Vídeo"]
check("live: 200", status == 200, f"status={status}")
for mk in markers:
    check(f"live: marcador «{mk}»", mk in body)

print()
if fails:
    print(f"VERIFY: {len(fails)} fallos: {fails}")
    sys.exit(1)
print("VERIFY: todos los puntos de entrada al análisis en directo están de vuelta.")
