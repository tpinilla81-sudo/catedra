#!/bin/bash
# Garantiza PG embebido + next dev ARRIBA (una pasada, idempotente).
# Uso: bash scripts/dev-ensure.sh  → siempre antes de una batería local.
cd /home/z/my-project

# ---------- Postgres :5432 (el cluster .pgdata persiste; solo postmaster) ----------
if ! (exec 3<>/dev/tcp/localhost/5432) 2>/dev/null; then
  echo "PG: arrancando postmaster…"
  setsid nohup node scripts/dev-postgres.mjs >> /tmp/pg-ensure.log 2>&1 < /dev/null &
  for i in $(seq 1 20); do
    (exec 3<>/dev/tcp/localhost/5432) 2>/dev/null && break
    sleep 1
  done
  echo "PG: listo"
else
  echo "PG: ya arriba"
fi

# ---------- Next dev :3000 ----------
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 http://localhost:3000/ 2>/dev/null)
if [ "$code" = "000" ]; then
  echo "next dev: arrancando…"
  export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"
  export DIRECT_URL="postgresql://postgres:postgres@localhost:5432/metodo"
  setsid nohup npx next dev -p 3000 >> /tmp/next-ensure.log 2>&1 < /dev/null &
  for i in $(seq 1 40); do
    c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:3000/ 2>/dev/null)
    [ "$c" != "000" ] && break
    sleep 1
  done
  echo "next dev: listo"
else
  echo "next dev: ya arriba"
fi
