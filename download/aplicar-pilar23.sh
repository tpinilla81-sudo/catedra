#!/usr/bin/env bash
# ============================================================
# CATEDRA · Paquete Pilar 2 + Pilar 3 — aplicador automático
# Descarga cada archivo de dpaste, verifica sha256 y lo coloca
# en su ruta. Después: migración + generate + commit + push.
# Uso:  bash aplicar-pilar23.sh
# ============================================================
set -euo pipefail
cd "${CATEDRA_DIR:-/workspaces/catedra}"

manifest=$(mktemp)
cat > "$manifest" << 'MANIFEST'
c6051c6dd03a74e8c04c2b3c7494f608505eb6ac82c7404158465634d079cf4d	https://dpaste.org/kaH5u/raw	prisma/migrations/20261109180000_pilar3_telemetria_directo/migration.sql
87772c40952aa9a61f6925ffce1bb03ecf5feaff67ef68cbff5369b29191ebc7	https://dpaste.org/O4L1R/raw	src/lib/pilar3.ts
24fe356a3b97acf89696bbe22a7167a59e4d401241abc1e5c515945e20b5dfc4	https://dpaste.org/pVmB1/raw	src/app/api/pilar3/events/route.ts
6c3dc6a3a73e3958c598d6366adda5ea013b7bff3594808ef151a675e7cdbd1e	https://dpaste.org/oSY2r/raw	src/app/api/pilar3/matches/[id]/telemetry/route.ts
03d9f304c7ebf49136d78969f4491ef3677827933f36fdd99299f97a65d40d4c	https://dpaste.org/Zr6Xo/raw	src/app/api/pilar3/video-bookmarks/route.ts
015e12c404ca6d888f5813b07b2327ac915b19c382a25905c7f1ed45a9284372	https://dpaste.org/9qqRJ/raw	src/app/api/matches/[id]/evaluations/route.ts
f4a13c155a2f68abae64218af59bc7c84d6ce684af49463e32e2cf1a4c9c3da9	https://dpaste.org/bQCz6/raw	prisma/schema.prisma
f90216299638e8ecc6baa1f162615d6150d9b4aad1a7de008237433338ea477b	https://dpaste.org/j32aw/raw	prisma/seed.ts
5d828db7e2b467891f809584bd436646f0cc91b45b9ed08e862b68373e7fbe49	https://dpaste.org/PrtdT/raw	src/components/match/live-match-board.tsx
b1258a55aa22ee0289ba09373bda75138f72bd8f6d0d70d6a74ff3fa8e83a418	https://dpaste.org/ToxS6/raw	src/components/match/ingest-flow.tsx
70f1d0133383226389455990e2c7a5c30175e702d3197adac0d3e4e4ca1352fb	https://dpaste.org/N8p4S/raw	src/app/dashboard/match/page.tsx
0311d21411d735c295336c826b0a1a39fc59870a0d7a3ce31bdcfad5f5a0cf28	https://dpaste.org/05YYG/raw	src/app/dashboard/match/live/page.tsx
21cd2e2e8e8ab75138faed789f033bf28b5de283bbe762b0da4db10bc5b16dd2	https://dpaste.org/XfaND/raw	src/app/dashboard/players/page.tsx
7879b91bb222c3a6be6ebd05549b6b01e4c37d24ce776d505b60c80993d31004	https://dpaste.org/oTSpQ/raw	src/app/dashboard/players/actions.ts
d51303dee7e6db8f1058a4d816663d3bd361df81d3f04c03e284101be8b68a04	https://dpaste.org/bs2U6/raw	src/components/players/players-view.tsx
23a41e96889de4f223d8d2d347ccd8c82b6deb77e8223739a2479e19a7ac3cb5	https://dpaste.org/cZwvb/raw	src/components/players/new-player-dialog.tsx
b73cd4857865c18379a089d5c9413f1abad4168db02c0354c63fddd399a58faa	https://dpaste.org/a4erb/raw	src/components/players/position-picker.tsx
MANIFEST

echo "→ Descargando y verificando $(wc -l < "$manifest") archivos…"
ok=0; total=$(wc -l < "$manifest")

while IFS=$'\t' read -r hash url path; do
  mkdir -p "$(dirname "$path")"
  tmp=$(mktemp)
  curl -fsSL "$url" -o "$tmp"
  if ! echo "$hash  $tmp" | sha256sum -c --quiet > /dev/null 2>&1; then
    echo "  ✗ HASH NO COINCIDE: $path (aborto, no se toca nada)"
    rm -f "$tmp"
    exit 1
  fi
  mv "$tmp" "$path"
  ok=$((ok+1))
  echo "  ✓ [$ok/$total] $path"
done < "$manifest"

echo ""
echo "→ $ok/$total archivos verificados (sha256) y colocados."

echo "→ Prisma generate + migración…"
bunx prisma generate
bunx prisma migrate deploy

echo ""
echo "▸▸▸ SIGUIENTE (te lo dejo listo, lo lanzas tú):"
echo "  git add -A"
echo "  git commit -m \"feat(p2-p3): telemetría en directo, perfil pre-partido y sync de vídeo\""
echo "  git push"
echo ""
echo "Después del push: Vercel despliega solo. La migración YA está aplicada."
