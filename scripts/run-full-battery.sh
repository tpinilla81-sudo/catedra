#!/bin/bash
# ============================================================================
# BATERÍA E2E COMPLETA EN UNA SOLA SESIÓN (el sandbox mata procesos entre
# llamadas, así que PG + dev server + suites corren y se verifican aquí)
#   1. PostgreSQL embebido (:5432) — con reparación de dirs vacíos
#   2. Prisma client (regenera si falta) + migraciones pendientes (deploy)
#   3. Dev server Next (:3000)
#   4. Suites: pilar1..4 + severidad3 + scouting (192 + 36 + 27 checks)
# ============================================================================
cd /home/z/my-project
set -u

echo "══ 1) PostgreSQL embebido ══"
# Dirs de runtime que git no versiona (vacíos) — idempotente
cd .pgdata 2>/dev/null && mkdir -p pg_notify pg_tblspc pg_replslot pg_twophase \
  pg_commit_ts pg_stat_tmp pg_dynshmem pg_snapshots pg_serial pg_sockets \
  pg_multixact/members pg_multixact/offsets pg_wal/archive_status pg_subtrans \
  pg_logical/mappings pg_logical/snapshots && chmod 700 . && cd ..
setsid nohup node scripts/dev-postgres.mjs > pg.log 2>&1 < /dev/null &
PG_OK=0
for i in $(seq 1 30); do
  if node -e "const s=require('net').connect({host:'localhost',port:5432},()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then PG_OK=1; break; fi
  sleep 2
done
if [ "$PG_OK" != "1" ]; then echo "❌ PG no arrancó"; tail -5 pg.log; exit 1; fi
echo "✅ PG:5432 READY"

echo "══ 2) Prisma client ══"
# Regenera si falta O si el schema es más nuevo que el cliente (cambios de modelo)
if [ ! -d node_modules/.prisma/client ] || [ prisma/schema.prisma -nt node_modules/.prisma/client ]; then
  bun run db:generate >/dev/null 2>&1 && echo "✅ regenerado"
else
  echo "✅ ya presente"
fi

echo "══ 2b) Migraciones pendientes ══"
# Misma regla que src/lib/env-guard.ts: sin URL postgres (sandbox exporta
# file:... por encima del .env) se fuerza el PG embebido — el CLI de Prisma
# NO pasa por env-guard, así que la corrección se replica aquí.
case "${DATABASE_URL:-}" in
  postgres*) ;;
  *) export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo" ;;
esac
bun x prisma migrate deploy 2>&1 | tail -3 || bun x prisma db push --accept-data-loss 2>&1 | tail -2

echo "══ 3) Dev server Next :3000 ══"
setsid nohup bun dev > dev.log 2>&1 < /dev/null &
DEV_OK=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:3000/ 2>/dev/null)
  if [ "$code" != "000" ]; then DEV_OK=1; break; fi
  sleep 2
done
if [ "$DEV_OK" != "1" ]; then echo "❌ dev server no arrancó"; tail -8 dev.log; exit 1; fi
echo "✅ dev server READY (http:$code)"

echo "══ 4) Batería E2E completa ══"
FAIL=0
for s in validate-pilar1 validate-pilar2 validate-pilar3 validate-pilar4 validate-severidad3 validate-scouting; do
  echo "──────── $s ────────"
  if ! bun "scripts/$s.ts"; then FAIL=1; echo "❌ $s terminó con error"; fi
done

echo "══ 5) Resumen final ══"
python3 - <<'PY'
import json, glob
tot = passed = failed = 0
for f in sorted(glob.glob("scripts/validation-results/pilar*.json")):
    d = json.load(open(f))
    tot += d["total"]; passed += d["passed"]; failed += d["failed"]
    status = "✅" if d["failed"] == 0 else "❌"
    print(f'{status} {f.split("/")[-1]}: {d["passed"]}/{d["total"]} checks ({d["durationMs"]} ms)')
print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print(f"TOTAL: {passed}/{tot} checks verdes · {failed} fallidos")
PY
exit $FAIL
