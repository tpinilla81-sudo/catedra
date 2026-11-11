#!/usr/bin/env python3
"""Verificación de producción tras aplicar el paquete qBv2M (c422bb5).
Comprueba contra https://catedra-sooty.vercel.app:
  1. Login demo (NextAuth credentials) → cookie de sesión.
  2. /dashboard/compacto — tab HOY (c422bb5): marcadores únicos.
  3. /dashboard/today — motor Pilar 4 intacto.
  4. Chunks de la Biblioteca — editabilidad de la Cátedra (9b8ec6d).
Sin migraciones en este paquete: no toca Neon.
"""
import re
import sys
import urllib.request
import urllib.parse
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


# ---------- 1) Login demo ----------
status, body = get(f"{BASE}/api/auth/csrf")
csrf = ""
m = re.search(r'"csrfToken":"([^"]+)"', body)
if m:
    csrf = m.group(1)
check("CSRF disponible", status == 200 and bool(csrf), f"status={status}")

data = urllib.parse.urlencode({
    "csrfToken": csrf,
    "email": EMAIL,
    "password": PASSWORD,
    "callbackUrl": BASE,
    "json": "true",
}).encode()
req = urllib.request.Request(
    f"{BASE}/api/auth/callback/credentials", data=data, method="POST",
    headers={"Content-Type": "application/x-www-form-urlencoded"},
)
try:
    res = opener.open(req, timeout=60)
    status_login = res.status
except urllib.error.HTTPError as e:
    status_login = e.code
session_cookie = any("next-auth.session-token" in c.name for c in jar)
check("Login COACH_ADMIN (míster)", session_cookie, f"status={status_login}")

# ---------- 2) /dashboard/compacto — tab HOY ----------
status, html = get(f"{BASE}/dashboard/compacto")
check("GET /dashboard/compacto 200", status == 200, f"status={status}")
check("compacto: shell MÉTODO // TACTICAL SUITE", "TACTICAL SUITE" in html)
check("compacto: tab HOY presente (Inercia anímica, title-case único del tab)", "Inercia anímica" in html)
check("compacto: Fatiga grupal (title-case)", "Fatiga grupal" in html)
check("compacto: Próximo partido", "Próximo partido" in html)
hoy_tab = re.search(r'>\s*Hoy\s*<', html)
check("compacto: botón de pestaña «Hoy»", bool(hoy_tab))
if hoy_tab and "Biblioteca" in html:
    check("compacto: «Hoy» es la PRIMERA pestaña", html.find(">Hoy<") < html.find("Biblioteca"))
hoy_state = (
    ("Cocinar propuesta" in html and "sin propuesta")
    or ("Microciclo" in html and "plan de la semana")
)
check("compacto: estado HOY (Microciclo/Cocinar/Plan aceptado)",
      ("Microciclo" in html) or ("Cocinar propuesta" in html) or ("Plan aceptado" in html),
      "microciclo" if "Microciclo" in html else ("cocinar" if "Cocinar propuesta" in html else "banner"))
check("compacto: Biblioteca y Plantilla siguen ahí", "Taxonomía" in html and "Plantilla por posiciones" in html)

# ---------- 3) /dashboard/today — motor intacto ----------
status, today_html = get(f"{BASE}/dashboard/today")
check("GET /dashboard/today 200", status == 200, f"status={status}")
check("today: propuesta del motor", ("Microciclo" in today_html) or ("propuesta cocinada" in today_html))

# ---------- 4) Chunks — editabilidad Cátedra (9b8ec6d) ----------
status, lib_html = get(f"{BASE}/dashboard/library")
check("GET /dashboard/library 200", status == 200, f"status={status}")
chunks = sorted(set(re.findall(r'(/_next/static/chunks/[\w.\-]+\.js)', lib_html + html)))
bodies = []
for c in chunks[:40]:
    st, cb = get(f"{BASE}{c}")
    if st == 200:
        bodies.append(cb)
blob = "\n".join(bodies)
check(f"chunks descargados ({len(bodies)}/{len(chunks)})", len(bodies) > 0)
marker_edit = "edítala y añade sus subprincipios"
check("editabilidad Cátedra en chunks (9b8ec6d)", marker_edit in blob or marker_edit in lib_html)
check("tab HOY en chunks de cliente (c422bb5)", "Cocinar propuesta" in blob or "Cocinar propuesta" in html)

# ---------- Resumen ----------
fails = [r for r in results if not r[1]]
print(f"\n═══ RESULTADO: {len(results) - len(fails)}/{len(results)} comprobaciones OK ═══")
if fails:
    for name, _, detail in fails:
        print(f"   FALLÓ: {name} {detail}")
    sys.exit(1)
print("PRODUCCIÓN AL DÍA — paquete aplicado correctamente.")
