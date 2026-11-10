#!/bin/bash
# E2E autocontenido (el sandbox mata procesos entre llamadas):
# PG embebido del proyecto → migrate+seed → next dev → login → tests API.
set -uo pipefail
cd /home/z/my-project

export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"
export DIRECT_URL="$DATABASE_URL"
export NEXTAUTH_SECRET="cambia-esto-en-produccion"
export NEXTAUTH_URL="http://localhost:3000"

echo "=== 1/5 · PostgreSQL embebido del proyecto (:5432) ==="
node scripts/dev-postgres.mjs > /tmp/e2e-pg.log 2>&1 &
for i in $(seq 1 90); do
  (echo > /dev/tcp/localhost/5432) 2>/dev/null && break
  sleep 1
done
if (echo > /dev/tcp/localhost/5432) 2>/dev/null; then
  echo "PG listo en :5432"
else
  echo "FALLO PG:"; tail -20 /tmp/e2e-pg.log; exit 1
fi

echo "=== 2/5 · prisma generate + migrate deploy + seed ==="
./node_modules/.bin/prisma generate 2>&1 | tail -1
./node_modules/.bin/prisma migrate deploy 2>&1 | tail -3
bun prisma/seed.ts > /tmp/e2e-seed.log 2>&1 && echo "seed OK" || { echo "FALLO seed:"; tail -10 /tmp/e2e-seed.log; exit 1; }

echo "=== 3/5 · next dev :3000 ==="
pkill -f "next dev" 2>/dev/null; sleep 1; pkill -9 -f "next dev" 2>/dev/null; sleep 1
nohup ./node_modules/.bin/next dev -p 3000 > /tmp/e2e-dev.log 2>&1 &
for i in $(seq 1 120); do
  curl -sf -o /dev/null http://localhost:3000/api/auth/csrf && break
  sleep 1
done
if curl -sf -o /dev/null http://localhost:3000/api/auth/csrf; then
  echo "next dev listo"
else
  echo "FALLO next dev:"; tail -30 /tmp/e2e-dev.log; exit 1
fi

echo "=== 4/5 · login credentials (mister@cfmetodo.es) ==="
JAR=/tmp/e2e-cookies.txt
rm -f "$JAR"
CSRF=$(curl -s -c "$JAR" http://localhost:3000/api/auth/csrf | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
CODE=$(curl -s -b "$JAR" -c "$JAR" -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=mister@cfmetodo.es" \
  --data-urlencode "password=metodo2025")
echo "login POST → HTTP $CODE"
SESS=$(curl -s -b "$JAR" http://localhost:3000/api/auth/session)
if echo "$SESS" | grep -q "mister@cfmetodo.es"; then
  echo "sesión activa: $(echo "$SESS" | head -c 140)"
else
  echo "FALLO sesión: $SESS"; exit 1
fi

echo "=== 5/5 · tests API Pilar 2 ==="
bun scripts/e2e-api-tests.mjs "$JAR"
RC=$?

echo "=== limpieza de tareas de test ==="
cat > /tmp/e2e-cleanup.sql <<'SQL'
DELETE FROM "TaskSubPrinciple" WHERE "taskId" IN (SELECT id FROM "Task" WHERE title LIKE 'TEST E2E%');
DELETE FROM "Task" WHERE title LIKE 'TEST E2E%';
SQL
./node_modules/.bin/prisma db execute --file /tmp/e2e-cleanup.sql --schema prisma/schema.prisma 2>&1 | tail -1 && echo "limpieza OK"

exit $RC
