#!/usr/bin/env bash
# ============================================================================
# CATEDRA by Método — SUBIDA DE CÓDIGO EN 1 COMANDO (sin tokens en el chat)
# ----------------------------------------------------------------------------
# TU PARTE: descarga a la MISMA carpeta los 2 ficheros ACTUALIZADOS del chat:
#     catedra-deploy.bundle   deploy-catedra.sh
#   y ejecuta:   bash deploy-catedra.sh
#
# El script solo SUBE el código a GitHub (autenticación por navegador).
# El DESPLIEGUE entero (migrar Neon + env vars + Vercel producción) lo hace
# después GitHub Actions DENTRO de GitHub, usando TUS secrets cifradas
# (DATABASE_URL, DIRECT_URL, VERCEL_TOKEN). Y se repetirá solo en cada push.
#
# Si algo falla: corta, pégame SOLO el mensaje de error (no contiene
# secretos) y te doy la corrección exacta.
# ============================================================================
set -uo pipefail

die()  { echo ""; echo "❌  ERROR: $1" >&2; echo "    (corta aquí, copia el error y pégamelo en el chat — no contiene secretos)" >&2; exit 1; }
step() { echo ""; echo "════════ $1 ════════"; }
ok()   { echo "✅  $1"; }
HERE="$(cd "$(dirname "$0")" && pwd)"

step "0/5  Requisitos + integridad del paquete"
command -v git  >/dev/null 2>&1 || die "Falta git → https://git-scm.com"
command -v node >/dev/null 2>&1 || die "Falta Node.js (20+) → https://nodejs.org"
command -v gh   >/dev/null 2>&1 || die "Falta GitHub CLI → Mac: brew install gh | Windows: winget install GitHub.cli | Linux: sudo apt install gh"
BUNDLE="$HERE/catedra-deploy.bundle"
[ -f "$BUNDLE" ] || die "No encuentro catedra-deploy.bundle en esta carpeta — descárgalo del chat junto a este script (versión ACTUALIZADA de hoy)"
DIGEST="$(sha256sum "$BUNDLE" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 "$BUNDLE" | cut -d' ' -f1)"
case "$DIGEST" in
  a1a90953d7bc91245949*) ok "bundle verificado (sha256 correcto — incluye el workflow con seed)" ;;
  *) die "El bundle NO es la versión actualizada (descargaste el antiguo) → bórralo y descarga el nuevo del chat" ;;
esac

step "1/5  GitHub — autenticación por navegador"
if gh auth status >/dev/null 2>&1; then
  ok "ya autenticado: $(gh api user -q .login 2>/dev/null || echo 'cuenta GitHub')"
else
  echo "→ se abre tu navegador (o te da un código): sigue las instrucciones"
  gh auth login -w || die "No se completó la autenticación de GitHub"
fi

step "2/5  Repo local"
REPO_DIR="$HERE/catedra"
if [ -d "$REPO_DIR/.git" ]; then
  ok "el repo ya existe en $REPO_DIR — lo reutilizo"
  git -C "$REPO_DIR" fetch origin >/dev/null 2>&1 || true
else
  gh repo clone tpinilla81-sudo/catedra "$REPO_DIR" || die "No pude clonar tpinilla81-sudo/catedra (¿es el nombre exacto del repo?)"
fi

step "3/5  Incorporar los cambios del paquete (rebranding + schema Pilar 2 + Pizarra Pilar 3 + workflow de deploy)"
git -C "$REPO_DIR" fetch "$BUNDLE" "+refs/heads/main:refs/heads/desde-chat" || die "No pude leer el bundle"
if git -C "$REPO_DIR" rev-parse -q --verify main >/dev/null 2>&1; then
  git -C "$REPO_DIR" checkout main >/dev/null 2>&1 || die "No pude cambiar a la rama main"
  if git -C "$REPO_DIR" merge --ff-only desde-chat >/dev/null 2>&1; then
    ok "cambios incorporados (fast-forward)"
  else
    git -C "$REPO_DIR" merge desde-chat -m "merge: cambios del paquete CATEDRA" || { git -C "$REPO_DIR" merge --abort 2>/dev/null; die "Conflicto de merge inesperado"; }
    ok "cambios incorporados (merge)"
  fi
else
  git -C "$REPO_DIR" checkout -B main desde-chat >/dev/null 2>&1 || die "Repo vacío y no puedo crear main"
  ok "rama main creada desde el paquete"
fi
ok "estado del código: $(git -C "$REPO_DIR" log --oneline -1)"

step "4/5  Subir a GitHub (esto DISPARA el despliegue automático)"
if git -C "$REPO_DIR" push origin main; then
  ok "push correcto"
else
  die "push rechazado → normalmente el repo remoto tiene commits que te faltan. Ejecuta:  cd catedra && git pull origin main  y vuelve a lanzar este script"
fi

step "5/5  Despliegue automático en GitHub Actions (con TUS secrets, cifradas)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Código subido. GitHub Actions está desplegando ahora:"
echo ""
echo "     👀 https://github.com/tpinilla81-sudo/catedra/actions"
echo ""
echo "  (abre ese enlace — verás 'Deploy producción' en marcha; tarda ~3-5 min:"
echo "   1/3 migrar Neon · 2/3 env vars en Vercel · 3/3 deploy producción)"
echo ""
echo "  Al terminar en verde, comprueba tu dominio de Vercel"
echo "  (recarga fuerte: Ctrl+Shift+R):"
echo "   • Logo y colores CATEDRA by Método"
echo "   • Partidos → tarjeta con 'Pizarra en directo'"
echo "   • Login: mister@cfmetodo.es / metodo2025"
echo ""
echo "  PARA SIEMPRE: cada 'git push' a main repite este despliegue solo."
echo "  Si la acción sale en rojo: copia el error del log (GitHub oculta los"
echo "  secretos automáticamente) y pégamelo — te doy la corrección."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
