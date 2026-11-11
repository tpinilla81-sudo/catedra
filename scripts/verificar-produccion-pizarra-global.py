#!/usr/bin/env python3
"""Verificación dura de producción tras aplicar el paquete de la Pizarra GLOBAL
(99a4a38 + 174038c + f89a43d). Comprueba contra https://catedra-sooty.vercel.app:
  1. Login demo (NextAuth credentials) → cookie de sesión.
  2. Menú de 5 pestañas: Hoy · Biblioteca · Plantilla · Partidos · Pizarra Táctica.
  3. /dashboard/pizarra (200 + marcadores, activa en nav).
  4. Biblioteca / Plantilla intactas.
  5. Partidos + detalle en 3 sub-pestañas (Resumen & Semáforo / Vestuario / Guardar Datos).
  6. Deep-links ?tab=locker y ?tab=data.
  7. Entradas al análisis en directo visibles (fix f89a43d) + live 200.
  8. Shell fijo (h-[100dvh] + overflow-hidden) y estilo crema/verde intacto.
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
        res = opener.open(req, timeout=90)
        return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


# ---------- 1) Login demo ----------
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
check("Login COACH_ADMIN (míster)", any("session-token" in c.name for c in jar), f"status={st}")

# ---------- 2) SHELL: nav de 5 pestañas ----------
st, h = get(f"{BASE}/dashboard/today")
check("GET today 200", st == 200, f"status={st}")
check("nav: Hoy · Biblioteca · Plantilla · Partidos · Pizarra Táctica",
      all(x in h for x in [">Hoy<", ">Biblioteca<", ">Plantilla<", ">Partidos<", ">Pizarra Táctica<"]))
check("nav: SIN Calidad ni etiquetas P#", ("Calidad" not in h) and ("P1" not in h) and ("E2E" not in h))
check("shell FIJO: h-[100dvh] + overflow-hidden", "h-[100dvh]" in h and "overflow-hidden" in h)
for mk in ["Primer Equipo · Hoy", "Inercia anímica", "Fatiga grupal",
           "Último partido", "Próximo rival", "Microciclo · semana del",
           "Qué falló"]:
    check(f"today: «{mk}»", mk in h)

# ---------- 3) PIZARRA TÁCTICA GLOBAL (nueva pestaña) ----------
st, pz = get(f"{BASE}/dashboard/pizarra")
check("GET pizarra 200", st == 200, f"status={st}")
for mk in ["Pizarra Táctica", "Herramienta activa",
           "Sesiones con pizarra en directo",
           "Pizarra libre · preparación", "/dashboard/match/live?g="]:
    check(f"pizarra: «{mk}»", mk in pz)
check("pizarra: activa en nav (aria-current)",
      '/dashboard/pizarra' in pz and 'aria-current="page"' in pz)

# ---------- 4) BIBLIOTECA / PLANTILLA (intactas) ----------
st, h2 = get(f"{BASE}/dashboard/library")
check("GET library 200", st == 200, f"status={st}")
check("library: marcadores", all(x in h2 for x in ["Subprincipios", "Recetas", "Taxonomía"]))
st, h3 = get(f"{BASE}/dashboard/players")
check("GET players 200", st == 200, f"status={st}")
check("players: marcadores", all(x in h3 for x in ["Disponibles", "Bajas"]))

# ---------- 5) PARTIDOS + DETALLE (3 sub-pestañas) ----------
st, mt = get(f"{BASE}/dashboard/matches")
check("GET matches 200", st == 200, f"status={st}")
check("matches: marcadores", all(x in mt for x in ["Pilar 3 ·", "Analizados"]))
gm = re.findall(r"dashboard/match\?g=([a-zA-Z0-9:_-]+)", mt)
game_id = gm[0] if gm else None
check("matches: hay partidos con enlace de ingesta", bool(game_id))

if game_id:
    st, md = get(f"{BASE}/dashboard/match?g={game_id}")
    check("GET match?g= 200", st == 200, f"status={st}")
    check("detalle: pestaña «Resumen & Semáforo»", "Resumen &amp; Semáforo" in md)
    for mk in ["Vestuario (Notas)", "Guardar Datos",
               "Métricas y Carga Grupal", "Estadísticas del Encuentro",
               "Evaluación del Cuerpo Técnico",
               'aria-label="Resultado']:
        check(f"detalle: «{mk}»", mk in md)
    check("detalle: SIN paso pizarra del wizard", ("Siguiente: pizarra" not in md) and ("Pizarra táctica: toca" not in md))
    # 7) fix f89a43d: entrada al directo SIEMPRE visible
    check("detalle: botón «Análisis en directo» visible", "Análisis en directo" in md)

    # 6) Deep-links
    st, lk = get(f"{BASE}/dashboard/match?g={game_id}&tab=locker")
    check("GET match?tab=locker 200", st == 200, f"status={st}")
    check("locker: nota de rendimiento + contador", "Añadir nota de rendimiento…" in lk and "anotados" in lk)

    st, dt = get(f"{BASE}/dashboard/match?g={game_id}&tab=data")
    check("GET match?tab=data 200", st == 200, f"status={st}")
    check("data: botón Guardar Datos del Partido", "Guardar Datos del Partido" in dt)
    check("data: resumen de consolidación", "Sincronización y guardado de datos" in dt)

    st, lv = get(f"{BASE}/dashboard/match/live?g={game_id}")
    check("GET match/live 200 (pizarra en directo)", st == 200, f"status={st}")
    check("live: marcadores Directo/Vídeo", ("Directo" in lv) and ("Vídeo" in lv))

# ---------- Resumen ----------
fails = [r for r in results if not r[1]]
print(f"\n═══ PRODUCCIÓN: {len(results) - len(fails)}/{len(results)} comprobaciones OK ═══")
if fails:
    for name, _, d in fails:
        print(f"   FALLÓ: {name} {d}")
    sys.exit(1)
print("PRODUCCIÓN AL DÍA — Pizarra global + partidos en 3 sub-pestañas + directo a la vista.")
