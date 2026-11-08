#!/usr/bin/env bash
# ============================================================================
# CATEDRA by Método — DESPLIEGUE EN 1 COMANDO (sin tokens en el chat)
# ----------------------------------------------------------------------------
# TU PARTE: descarga a la MISMA carpeta los 2 ficheros del chat:
#     catedra-deploy.bundle   deploy-catedra.sh
#   y ejecuta:   bash deploy-catedra.sh
#
# El script hace TODO solo (8 fases). Las credenciales NUNCA pasan por el
# chat: GitHub y Vercel se autentican por NAVEGADOR (email/código) y las 2
# cadenas de Neon se pegan por teclado (entrada oculta, no se guardan en
# ningún fichero).
# Si algo falla: corta, pégame SOLO el mensaje de error (no contiene
# secretos) y te doy la corrección exacta.
# ============================================================================
set -uo pipefail

die()  { echo ""; echo "❌  ERROR: $1" >&2; echo "    (corta aquí, copia el error y pégamelo en el chat — no contiene secretos)" >&2; exit 1; }
step() { echo ""; echo "════════ $1 ════════"; }
ok()   { echo "✅  $1"; }
HERE="$(cd "$(dirname "$0")" && pwd)"

step "0/8  Requisitos + integridad del paquete"
command -v git  >/dev/null 2>&1 || die "Falta git → https://git-scm.com"
command -v node >/dev/null 2>&1 || die "Falta Node.js (20+) → https://nodejs.org"
command -v gh   >/dev/null 2>&1 || die "Falta GitHub CLI → Mac: brew install gh | Windows: winget install GitHub.cli | Linux: sudo apt install gh"
BUNDLE="$HERE/catedra-deploy.bundle"
[ -f "$BUNDLE" ] || die "No encuentro catedra-deploy.bundle en esta carpeta — descárgalo del chat junto a este script"
DIGEST="$(sha256sum "$BUNDLE" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 "$BUNDLE" | cut -d' ' -f1)"
case "$DIGEST" in
  f9b6c649e6513ee2*) ok "bundle verificado (sha256 correcto)" ;;
  *) die "El bundle está dañado o es una versión antigua → bórralo y descárgalo de nuevo del chat" ;;
esac

step "1/8  GitHub — autenticación por navegador"
if gh auth status >/dev/null 2>&1; then
  ok "ya autenticado: $(gh api user -q .login 2>/dev/null || echo 'cuenta GitHub')"
else
  echo "→ se abre tu navegador (o te da un código): sigue las instrucciones"
  gh auth login -w || die "No se completó la autenticación de GitHub"
fi

step "2/8  Repo local"
REPO_DIR="$HERE/catedra"
if [ -d "$REPO_DIR/.git" ]; then
  ok "el repo ya existe en $REPO_DIR — lo reutilizo"
  git -C "$REPO_DIR" fetch origin >/dev/null 2>&1 || true
else
  gh repo clone tpinilla81-sudo/catedra "$REPO_DIR" || die "No pude clonar tpinilla81-sudo/catedra (¿es el nombre exacto del repo?)"
fi

step "3/8  Incorporar los cambios del paquete (rebranding + schema + Pizarra en directo)"
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

step "4/8  Subir a GitHub"
if git -C "$REPO_DIR" push origin main; then
  ok "push correcto"
else
  die "push rechazado → normalmente el repo remoto tiene commits que te faltan. Ejecuta:  cd catedra && git pull origin main  y vuelve a lanzar este script"
fi

step "5/8  Neon — migración (las cadenas se pegan OCULTAS, no se guardan ni se envían al chat)"
echo "   (las 2 cadenas salen de Neon → Connect → rol neondb_owner, una con -pooler y otra sin él)"
read -rsp "   Pega DATABASE_URL (cadena CON -pooler) + Enter: " DB_POOL; echo
read -rsp "   Pega DIRECT_URL (cadena SIN -pooler)   + Enter: " DB_DIRECT; echo
case "$DB_POOL$DB_DIRECT" in
  postgresql://*) : ;;
  *) die "Las cadenas deben empezar por postgresql:// — revisa que pegaste las 2" ;;
esac
cd "$REPO_DIR" || die "No puedo entrar en $REPO_DIR"
DATABASE_URL="$DB_POOL" DIRECT_URL="$DB_DIRECT" npx prisma migrate deploy \
  || die "La migración falló (pego el error completo sin las cadenas)"
ok "migraciones aplicadas — solo CREATE, tus datos de Neon intactos"

step "6/8  Vercel — autenticación por navegador (email)"
npx vercel whoami >/dev/null 2>&1 && ok "ya autenticado en Vercel" || { npx vercel login || die "No se completó el login de Vercel"; }

step "7/8  Vercel — variables de entorno de producción (cifradas, via API de tu sesión)"
npx vercel link --yes --project catedra 2>/dev/null || npx vercel link || die "No pude enlazar el proyecto catedra en Vercel"
npx vercel env rm DATABASE_URL production -y >/dev/null 2>&1 || true
npx vercel env rm DIRECT_URL  production -y >/dev/null 2>&1 || true
printf '%s' "$DB_POOL"   | npx vercel env add DATABASE_URL production || die "Fallo al añadir DATABASE_URL en Vercel"
printf '%s' "$DB_DIRECT" | npx vercel env add DIRECT_URL  production || die "Fallo al añadir DIRECT_URL en Vercel"
ok "DATABASE_URL y DIRECT_URL actualizadas en producción"
npx vercel env ls production 2>/dev/null | grep -q NEXTAUTH_SECRET || echo "⚠️  No veo NEXTAUTH_SECRET en Vercel → si el login falla después, dímelo y lo añadimos"

step "8/8  Deploy a producción"
npx vercel --prod --yes || die "El deploy falló (pega el error)"
ok "DESPLIEGUE COMPLETADO 🎉"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Comprueba en tu dominio de Vercel (recarga fuerte: Ctrl+Shift+R):"
echo "   • Logo y colores CATEDRA by Método"
echo "   • Partidos → tarjeta con 'Pizarra en directo'"
echo "   • Login: mister@cfmetodo.es / metodo2025"
echo ""
echo "  MONTAJE PARA SIEMPRE (hazlo 1 vez en el navegador):"
echo "   Vercel → proyecto catedra → Settings → Git →"
echo "   conectar tpinilla81-sudo/catedra"
echo "   → a partir de ahora, cada git push despliega solo"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
