#!/usr/bin/env python3
"""Inspecciona PRODUCCIÓN (Vercel): qué ve el míster ahora mismo."""
import http.cookiejar
import re
import sys
import urllib.parse
import urllib.request

BASE = "https://catedra-sooty.vercel.app"
EMAIL = "mister@cfmetodo.es"
PASSWORD = "metodo2025"

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
opener.addheaders = [("User-Agent", "Mozilla/5.0 (prod-inspect)")]


def get(url, data=None):
    req = urllib.request.Request(url, data=data)
    try:
        res = opener.open(req, timeout=90)
        return res.status, res.geturl(), res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.geturl(), e.read().decode("utf-8", "replace")


_, _, b = get(f"{BASE}/api/auth/csrf")
csrf = re.search(r'"csrfToken":"([^"]+)"', b).group(1)
d = urllib.parse.urlencode({
    "csrfToken": csrf, "email": EMAIL, "password": PASSWORD,
    "callbackUrl": "/dashboard", "json": "true",
}).encode()
s, url, _ = get(f"{BASE}/api/auth/callback/credentials", d)
print(f"login: {s}")

s, _, b = get(f"{BASE}/dashboard/matches")
print(f"\n--- /dashboard/matches ({s}) ---")
print("menu items:", re.findall(r'>(Hoy|Biblioteca|Plantilla|Partidos|Pizarra Táctica)</', b))
print("aria-current secciones:", sorted(set(re.findall(r'aria-current="true"[^>]*>([^<]+)<', b))))
print("botones «Pizarra en directo»:", b.count("Pizarra en directo"))
print("botones «Directo»:", b.count(">Directo<"))
print("enlaces a match/live:", len(re.findall(r"/dashboard/match/live\?g=", b)))
print("sub-pestañas mock (Resumen & Semáforo):", "Resumen &amp; Semáforo" in b or "Resumen & Semáforo" in b)

gids = re.findall(r"/dashboard/match(?:/live)?\?g=([^\"&]+)", b)
gids = list(dict.fromkeys(gids))
print("gids:", len(gids), "primero:", gids[0] if gids else "—")

if gids:
    g = gids[0]
    s, _, b2 = get(f"{BASE}/dashboard/match?g={g}")
    print(f"\n--- /dashboard/match?g={g} ({s}) ---")
    print("wizard pasos:", re.findall(r'>(Semáforo|Pizarra|Vestuario)</span>', b2)[:4])
    print("marcadores wizard:", "Paso 1" in b2, "Siguiente: pizarra" in b2)
    print("sub-pestañas mock:", ["Resumen & Semáforo" in b2 or "Resumen &amp; Semáforo" in b2,
                                 "Vestuario (Notas)" in b2, "Guardar Datos" in b2])
    print("botón «Análisis en directo»:", "Análisis en directo" in b2)
    s, _, b3 = get(f"{BASE}/dashboard/match/live?g={g}")
    print(f"--- /dashboard/match/live?g={g} ({s}) ---")
    print("tablero directo (Vídeo):", "Vídeo" in b3, "· (Directo):", "Directo" in b3)
    print("pizarra global route:", get(f"{BASE}/dashboard/pizarra")[0])
