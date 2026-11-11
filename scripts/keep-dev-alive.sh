#!/bin/bash
# Supervisor de desarrollo — mantiene PG embebido + next dev vivos.
# Lo arranca el agente con: setsid nohup bash scripts/keep-dev-alive.sh >/tmp/keepalive.log 2>&1 &
cd /home/z/my-project

while true; do
  # ---------- Postgres :5432 ----------
  if ! (exec 3<>/dev/tcp/localhost/5432) 2>/dev/null; then
    echo "[$(date +%H:%M:%S)] PG caído → arranco"
    nohup node scripts/dev-postgres.mjs >> /tmp/pg-keep.log 2>&1 &
    sleep 5
  fi

  # ---------- Next dev :3000 ----------
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 http://localhost:3000/ 2>/dev/null)
  if [ "$code" = "000" ]; then
    echo "[$(date +%H:%M:%S)] next dev caído → arranco"
    export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"
    export DIRECT_URL="postgresql://postgres:postgres@localhost:5432/metodo"
    npx prisma generate >/dev/null 2>&1
    nohup npx next dev -p 3000 >> /tmp/next-keep.log 2>&1 &
    sleep 8
  fi
  sleep 10
done
