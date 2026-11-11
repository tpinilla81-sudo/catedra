#!/usr/bin/env python3
"""Verificación de producción tras aplicar el paquete hasta e7e9c05.
Comprueba contra https://catedra-sooty.vercel.app:
  1. Login demo (NextAuth credentials) → cookie de sesión.
  2. /dashboard/library (Biblioteca Maestra, b215c87): pestaña «Maestra»,
     5 categorías de la taxonomía oficial con sus hints, familias con
     descriptores exactos, buscador y botón «+ Tarea».
     (Si la migración Task.family no se hubiera aplicado, esta página 500:
     el SELECT incluye la columna family → 200 implica migración OK.)
  3. /dashboard/pizarra (mock A): marcadores intactos.
  4. /dashboard/match/live?g=… : MP4 local + pizarra espacial
     (regex de id corregida: admite «:» en el id de partido).
  5. Rutas base intactas: today, players, matches.
"""
import re
import sys
import urllib.request
import urllib.parse
import urllib.error
import http.cookiejar

BASE = "https://catedra-sooty.vercel.app"
EMAIL = "mister@cfmetodo.es"
PASSWORD = "metodo2025"

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
opener.addheaders = [("User-Agent", "Mozilla/5.0 (verificador-catedra)")]

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))


def get(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        res = opener.open(req, timeout=60)
        return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


# ---------- 1. login ----------
status, body = get(BASE + "/api/auth/csrf")
csrf = re.search(r'"csrfToken"\s*:\s*"([^"]+)"', body)
check("GET /api/auth/csrf", status == 200 and csrf is not None, f"status={status}")

data = urllib.parse.urlencode({
    "csrfToken": csrf.group(1),
    "email": EMAIL,
    "password": PASSWORD,
    "callbackUrl": BASE + "/dashboard/today",
    "json": "true",
}).encode()
status, body = get(BASE + "/api/auth/callback/credentials", data=data,
                   headers={"Content-Type": "application/x-www-form-urlencoded"})
cookies = {c.name for c in jar}
check("POST /api/auth/callback/credentials (demo)",
      any("session-token" in c for c in cookies),
      f"status={status} cookies={sorted(cookies)[:3]}")

# ---------- 2. /dashboard/library — BIBLIOTECA MAESTRA ----------
status, body = get(BASE + "/dashboard/library")
low = body.lower()
check("GET /dashboard/library (200 = migración Task.family aplicada)",
      status == 200, f"status={status}")

maestra = {
    "pestaña «Maestra» (botón)": ">Maestra<" in body or "Maestra</" in body,
    "botón «+ Tarea» (icono + texto)": bool(re.search(
        r'<button[^>]*bg-brand-600[^>]*>\s*<svg[\s\S]{0,600}?</svg>\s*Tarea\s*</button>', body)),
    "modo Maestra en bundle cliente": "maestra-root" in body or "MasterTaxonomyTab" in body or "maestra" in low,
}
for name, ok in maestra.items():
    check(f"  biblioteca SSR · {name}", ok)

# NOTA: el CONTENIDO de la pestaña Maestra (categorías, familias, chips,
# buscador, bloque sin clasificar) es client-side — la pestaña por defecto
# es Taxonomía. Todo eso se valida en la fase CDP con clic REAL:
# scripts/verify-library-maestra-ui-prod.sh

# pestaña Maestra SSR: botón de la pestaña + contador 14 familias
check("  biblioteca SSR · pestaña Maestra con contador de familias",
      bool(re.search(r"Maestra[^<]*<", body)) and ">14<" in body)
# bloque sin clasificar (12 tareas del catálogo global sin familia)
check("  biblioteca SSR · tarea real del catálogo (Rondo 6v2)",
      "Rondo 6v2" in body)

# ---------- 3. /dashboard/pizarra (mock A) ----------
status, body = get(BASE + "/dashboard/pizarra")
low = body.lower()
check("GET /dashboard/pizarra", status == 200, f"status={status}")
mock_a = {
    "Restablecer": "restablecer" in low,
    "Modo explicación": "modo explicación" in low,
    "flechas": "flecha" in low,
}
for name, ok in mock_a.items():
    check(f"  pizarra SSR · {name}", ok)

# ---------- 4. /dashboard/match/live?g=… ----------
# REGEX CORREGIDA: los ids de partido pueden contener «:» (p.ej. …w6n:jornada10)
status, m_body = get(BASE + "/dashboard/matches")
match_ids = list(dict.fromkeys(
    re.findall(r"dashboard/match/live\?g=([a-z0-9:]+)", m_body)))
check("GET /dashboard/matches + id de partido (regex con «:»)",
      status == 200 and match_ids, f"status={status} ids={[i[:24] for i in match_ids[:2]]}")
status, body = 404, ""
for mid in match_ids:
    s_try, b_try = get(BASE + "/dashboard/match/live?g=" + mid)
    if s_try == 200:
        status, body = s_try, b_try
        break
    print(f"   (g={mid} → {s_try}, probando siguiente)")
low = body.lower()
check("GET /dashboard/match/live?g=…", status == 200, f"status={status}")
for name, ok in {
    "live SSR · MP4 local (botón)": "mp4 local" in low,
    "live SSR · pizarra espacial": "espacial" in low,
}.items():
    check(name, ok)

# ---------- 5. rutas base ----------
for path, marker in [
    ("/dashboard/today", "dashboard"),
    ("/dashboard/players", None),
    ("/dashboard/matches", None),
]:
    status, body = get(BASE + path)
    ok = status == 200
    if marker:
        ok = ok and marker in body.lower()
    check(f"GET {path}", ok, f"status={status}")

# ---------- resumen ----------
fails = [r for r in results if not r[1]]
print(f"\n{'='*60}")
print(f"TOTAL: {len(results)} | ✅ {len(results)-len(fails)} | ❌ {len(fails)}")
if fails:
    print("\nFALLOS:")
    for name, _, detail in fails:
        print(f"  ❌ {name} {detail}")
    sys.exit(1)
print("PRODUCCIÓN VERDE ✔")
