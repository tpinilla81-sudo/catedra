#!/usr/bin/env bash
# ============================================================================
# CATEDRA by Método — DESPLIEGUE SEGURO A PRODUCCIÓN (GitHub + Neon + Vercel)
# ----------------------------------------------------------------------------
# Diferencias clave frente al script original (el destructivo):
#   • NUNCA sobrescribe prisma/schema.prisma (el esquema vive en el repo).
#   • `prisma migrate deploy` en vez de `db push --accept-data-loss`:
#     solo aplica migraciones pendientes EN ORDEN; no borra nada.
#   • `git push` normal, SIN --force (no reescribe historial).
#   • Ningún token escrito en el fichero: todo por variables de entorno.
#
# USO — rellena primero (tokens NUEVOS, los anteriores quedaron expuestos):
#   export GITHUB_TOKEN="ghp_NUEVO"
#   export VERCEL_TOKEN="vcp_NUEVO"
#   export DATABASE_URL="postgresql://…pooler…neon.tech/neondb?sslmode=require"
#   export DIRECT_URL="postgresql://…directo…neon.tech/neondb?sslmode=require"
#   bash scripts/deploy-prod.sh          # despliegue
#   SEED=1 bash scripts/deploy-prod.sh   # despliegue + datos demo (idempotente)
# ============================================================================

set -euo pipefail

: "${GITHUB_TOKEN:?Falta GITHUB_TOKEN (genera uno NUEVO en GitHub)}"
: "${VERCEL_TOKEN:?Falta VERCEL_TOKEN (genera uno NUEVO en Vercel)}"
: "${DATABASE_URL:?Falta DATABASE_URL (cadena pooled de Neon)}"
: "${DIRECT_URL:?Falta DIRECT_URL (cadena directa de Neon)}"

REPO="tpinilla81-sudo/catedra"

echo "=== [1/5] Comprobando que el esquema es válido y las migraciones son aditivas ==="
npx prisma validate
if npx prisma migrate diff \
     --from-url "$DATABASE_URL" \
     --to-migrations prisma/migrations \
     --shadow-database-url "$DIRECT_URL" \
     --exit-code >/dev/null 2>&1; then
  echo "OK: la base ya está al día con las migraciones (no hay nada destructivo pendiente)."
else
  echo "Pendiente: hay migraciones que aplicar (las 4 del repo, todas aditivas)."
fi

echo "=== [2/5] Aplicando migraciones a Neon (solo CREATE/ADD, nunca DROP) ==="
npx prisma migrate deploy
npx prisma generate

echo "=== [3/5] Sincronizando repo con GitHub (push normal, sin --force) ==="
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "https://${GITHUB_TOKEN}@github.com/${REPO}.git"
else
  git remote add origin "https://${GITHUB_TOKEN}@github.com/${REPO}.git"
fi
git push origin HEAD:main

echo "=== [4/5] Variables de entorno en Vercel (producción) ==="
npx vercel link --yes --project catedra --token="$VERCEL_TOKEN"
npx vercel env rm DATABASE_URL production -y 2>/dev/null || true
npx vercel env rm DIRECT_URL  production -y 2>/dev/null || true
printf '%s' "$DATABASE_URL" | npx vercel env add DATABASE_URL production --token="$VERCEL_TOKEN"
printf '%s' "$DIRECT_URL"   | npx vercel env add DIRECT_URL  production --token="$VERCEL_TOKEN"

echo "=== [5/5] Despliegue a producción en Vercel ==="
npx vercel --prod --token="$VERCEL_TOKEN" --yes

if [ "${SEED:-0}" = "1" ]; then
  echo "=== Extra: datos demo (idempotente) contra Neon ==="
  DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DIRECT_URL" bun prisma/seed.ts
fi

echo "=== DESPLIEGUE COMPLETADO CON ÉXITO ==="
