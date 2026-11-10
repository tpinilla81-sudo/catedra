#!/usr/bin/env python3
"""Smoke test local de las 4 secciones tras la reestructuración sticky master.
Login demo (míster) contra el dev server y marcadores por página."""
import re
import sys
import urllib.request
import urllib.parse
import http.cookiejar

BASE = "http://localhost:3000"
EMAIL = "mister@cfmetodo.es"
PASSWORD = "metodo2025"

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
opener.addheaders = [("User-Agent", "Mozilla/5.0 (smoke-catedra)")]

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))


def get(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        res = opener.open(req, timeout=90)
        return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


status, body = get(f"{BASE}/api/auth/csrf")
m = re.search(r'"csrfToken":"([^"]+)"', body)
csrf = m.group(1) if m else ""
check("CSRF", bool(csrf), f"status={status}")

data = urllib.parse.urlencode({
    "csrfToken": csrf, "email": EMAIL, "password": PASSWORD,
    "callbackUrl": BASE, "json": "true",
}).encode()
req = urllib.request.Request(
    f"{BASE}/api/auth/callback/credentials", data=data, method="POST",
    headers={"Content-Type": "application/x-www-form-urlencoded"},
)
try:
    res = opener.open(req, timeout=90)
    st = res.status
except urllib.error.HTTPError as e:
    st = e.code
check("Login míster", any("session-token" in c.name for c in jar), f"status={st}")

# ---------- HOY ----------
st, h = get(f"{BASE}/dashboard/today")
check("GET today 200", st == 200, f"status={st}")
for mk in ["Primer Equipo · Hoy", "Inercia anímica", "Fatiga grupal",
           "Último partido", "Próximo rival", "Microciclo · semana del",
           "Qué falló", "Por qué este plan"]:
    check(f"today: «{mk}»", mk in h)
check("today: CTA compacta (Aceptar Plan)", "Aceptar Plan" in h)
check("today: zona fija + scroll propio",
      "flex-none border-b border-cream-border" in h and "flex-1 min-h-0 overflow-y-auto" in h)
check("today: TAREAS DEL DÍA o aviso", ("Tareas de entrenamiento del día" in h) or ("Hoy no hay sesión programada" in h))

# ---------- BIBLIOTECA ----------
st, h = get(f"{BASE}/dashboard/library")
check("GET library 200", st == 200, f"status={st}")
for mk in ["Subprincipios", "Recetas", "Fases cubiertas", "Taxonomía", "Tareas", "Pilar 1"]:
    check(f"library: «{mk}»", mk in h)

# ---------- PLANTILLA ----------
st, h = get(f"{BASE}/dashboard/players")
check("GET players 200", st == 200, f"status={st}")
for mk in ["Disponibles", "Bajas", "Polivalentes", "Carga alta", "Pilar 2 ·"]:
    check(f"players: «{mk}»", mk in h)

# ---------- PARTIDOS ----------
st, h = get(f"{BASE}/dashboard/matches")
check("GET matches 200", st == 200, f"status={st}")
for mk in ["Pilar 3 ·", "VS", "Analizados"]:
    check(f"matches: «{mk}»", mk in h)
check("matches: destacado o próximos", ("Partido de esta semana" in h) or ("Próximo partido" in h) or ("Otros próximos" in h))

fails = [r for r in results if not r[1]]
print(f"\n═══ SMOKE: {len(results) - len(fails)}/{len(results)} OK ═══")
if fails:
    for name, _, d in fails:
        print(f"   FALLÓ: {name} {d}")
    sys.exit(1)
print("Las 4 secciones responden con la anatomía sticky master.")
