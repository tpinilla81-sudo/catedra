#!/usr/bin/env python3
"""Verificación de producción tras aplicar el paquete del shell compacto (63a2938).
Comprueba contra https://catedra-sooty.vercel.app:
  1. Login demo (NextAuth credentials) → cookie de sesión.
  2. /dashboard/compacto y /dashboard/quality → FUERA (rutas eliminadas).
  3. Menú lateral SOLO nombres: Hoy · Biblioteca · Plantilla · Partidos
     (sin P1/P2/P3/P4/E2E/BANQ, sin Calidad, sin Compacto).
  4. Shell FIJO en viewport (h-[100dvh] + overflow-hidden) sin scroll de página.
  5. Motor Pilar 4 intacto (/dashboard/today).
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

# ---------- 2) Rutas eliminadas ----------
st_c, html_c = get(f"{BASE}/dashboard/compacto")
check("/dashboard/compacto FUERA (no 200)", st_c != 200, f"status={st_c}")
check("/dashboard/compacto sin contenido viejo", "Inercia anímica" not in html_c)

st_q, html_q = get(f"{BASE}/dashboard/quality")
check("/dashboard/quality FUERA (no 200)", st_q != 200, f"status={st_q}")

# ---------- 3) Menú lateral solo nombres + 4) shell fijo ----------
st_t, html = get(f"{BASE}/dashboard/today")
check("GET /dashboard/today 200", st_t == 200, f"status={st_t}")

for label in ["Hoy", "Biblioteca", "Plantilla", "Partidos"]:
    check(f"menú: «{label}» presente", f">{label}</span>" in html or f">{label}<" in html)

viejos = [">P1<", ">P2<", ">P3<", ">P4<", ">E2E<", ">BANQ<", ">Compacto<", ">Calidad<", ">La Cátedra<"]
quedan = [x for x in viejos if x in html]
check("menú: SIN etiquetas P1/P2/P3/P4/E2E/BANQ", not [x for x in viejos[:6] if x in html],
      f"quedan: {quedan}" if quedan else "")
check("menú: SIN «Compacto»", ">Compacto<" not in html)
check("menú: SIN «Calidad»", ">Calidad<" not in html)
check("menú: SIN «La Cátedra» para COACH_ADMIN", ">La Cátedra<" not in html)

check("shell FIJO: h-[100dvh]", "h-[100dvh]" in html)
check("shell FIJO: overflow-hidden", "overflow-hidden" in html)
check("estilo intacto: verde corteza #123a20", "%23123a20" in html or "#123a20" in html or "123a20" in html)

# ---------- 5) Motor Pilar 4 intacto ----------
check("today: motor (Microciclo/directrices/plan)",
      ("Microciclo" in html) or ("directrices" in html) or ("plan de la semana" in html))

# ---------- 6) Resto de secciones 200 ----------
for path, nombre in [("/dashboard/library", "Biblioteca"), ("/dashboard/players", "Plantilla"),
                     ("/dashboard/matches", "Partidos")]:
    st, h2 = get(f"{BASE}{path}")
    ok = st == 200
    check(f"GET {nombre} 200", ok, f"status={st}")
    if ok:
        check(f"{nombre}: shell nuevo presente", "h-[100dvh]" in h2)

# ---------- Resumen ----------
fails = [r for r in results if not r[1]]
print(f"\n═══ RESULTADO: {len(results) - len(fails)}/{len(results)} comprobaciones OK ═══")
if fails:
    for name, _, detail in fails:
        print(f"   FALLÓ: {name} {detail}")
    sys.exit(1)
print("PRODUCCIÓN AL DÍA — paquete 63a2938 aplicado correctamente.")
