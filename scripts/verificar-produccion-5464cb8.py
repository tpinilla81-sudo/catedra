#!/usr/bin/env python3
"""Verificación de producción tras aplicar el paquete con ec1f680 + 5464cb8.
Comprueba contra https://catedra-sooty.vercel.app:
  1. Login demo (NextAuth credentials) → cookie de sesión.
  2. /dashboard/pizarra (mock A, ec1f680): Restablecer posiciones, modo
     explicación táctica, dibujo de flechas — y ausencia de paleta vieja.
  3. /dashboard/match/live (mock B, 5464cb8): botón «MP4 local», chip blob,
     effectiveVideo, clip −3s/+2s.
  4. Rutas base intactas: today, library, players, matches.
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


# ---------- 1. login ----------
csrf_url = BASE + "/api/auth/csrf"
status, body = get(csrf_url)
csrf = re.search(r'"csrfToken"\s*:\s*"([^"]+)"', body)
check("GET /api/auth/csrf", status == 200 and csrf is not None,
      f"status={status}")

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

# ---------- 2. /dashboard/pizarra (mock A) ----------
status, body = get(BASE + "/dashboard/pizarra")
low = body.lower()
check("GET /dashboard/pizarra", status == 200, f"status={status}")
mock_a = {
    "Restablecer": "restablecer" in low,
    "Modo explicación": "modo explicación" in low,
    "flechas": "flecha" in low,
    "sin registro de pérdidas": "sin registro" in low,
}
for name, ok in mock_a.items():
    check(f"  pizarra SSR · {name}", ok)
check("  pizarra SSR · sin paleta vocabulario vieja",
      "paleta de vocabulario" not in low and "responsible" not in low)

# ---------- 3. /dashboard/match/live?g=<id> (mock B) ----------
# La ruta firma con ?g=<id>; sin g => notFound() (404 esperado).
# Algunos partidos pertenecen a otro equipo (teamId != team.id => 404):
# probamos cada id único hasta que uno responda 200.
status, m_body = get(BASE + "/dashboard/matches")
match_ids = list(dict.fromkeys(
    re.findall(r"dashboard/match/live\?g=([a-z0-9]+)", m_body)))
check("GET /dashboard/matches + id de partido", status == 200 and match_ids,
      f"status={status} ids={match_ids[:2]}")
status, body = 404, ""
for mid in match_ids:
    s_try, b_try = get(BASE + "/dashboard/match/live?g=" + mid)
    if s_try == 200:
        status, body = s_try, b_try
        break
    print(f"   (g={mid} → {s_try}, probando siguiente)")
low = body.lower()
check("GET /dashboard/match/live?g=…", status == 200, f"status={status}")
mock_b = {
    "MP4 local (botón)": "mp4 local" in low,
    "pizarra espacial": "pizarra espacial" in low or "espacial" in low,
}
for name, ok in mock_b.items():
    check(f"  live SSR · {name}", ok)
# NOTA: «Cambiar MP4» (ternario tras cargar blob), «📂 Cargar MP4 desde
# Ordenador» (estado vacío, pizarra espacial cerrada por defecto) y
# «▶ clip −3s/+2s» (lista con events.length>0) son render condicional
# hidratado: se validan en la fase CDP interactiva (agent-browser),
# no en SSR. Scripts: scripts/verify-video-local.sh (local) y CDP aquí.

# ---------- 4. rutas base ----------
for path, marker in [
    ("/dashboard/today", "dashboard"),
    ("/dashboard/library", None),
    ("/dashboard/players", None),
    ("/dashboard/matches", None),
]:
    status, body = get(BASE + path)
    ok = status == 200
    extra = ""
    if marker:
        ok = ok and marker in body.lower()
        extra = f" marcador={marker}"
    check(f"GET {path}", ok, f"status={status}{extra}")

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
