#!/usr/bin/env bash
# Ronda final: toggle de "Cargado / Al límite" (HEAVY) → round-trip UI→API→DB→GET
cd /home/z/my-project
set +e
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"
export DIRECT_URL="postgresql://postgres:postgres@localhost:5432/metodo"
R=/tmp/p3-final.txt
: > "$R"
say() { echo "== $1" | tee -a "$R"; }

node scripts/dev-postgres.mjs > /tmp/pg.log 2>&1 &
PGJOB=$!
for i in $(seq 1 40); do
  node -e "const n=require('net');const s=n.connect(5432,'localhost',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(1000,()=>{s.destroy();process.exit(1)})" && break
  sleep 1
done
bunx prisma migrate deploy > /tmp/mig.log 2>&1 && bun prisma/seed.ts > /tmp/seed.log 2>&1 && say "[1] PG+datos OK" || { say "💥 datos"; exit 1; }
bun scripts/p3-test-ids.ts > /tmp/p3-ids.json 2>/dev/null
MATCH_ID=$(python3 -c "import json;print(json.load(open('/tmp/p3-ids.json'))['matchId'])")

nohup node_modules/.bin/next dev -p 3000 > /tmp/next.log 2>&1 &
NEXTJOB=$!
for i in $(seq 1 90); do
  [ "$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)" = "200" ] && break
  sleep 1
done
say "[2] server arriba"

agent-browser set device "iPhone 16" >> "$R" 2>&1
agent-browser open http://localhost:3000/ >> "$R" 2>&1
agent-browser wait --load networkidle >> "$R" 2>&1
agent-browser snapshot -i > /tmp/p3-login.txt 2>&1
agent-browser fill "@e3" "mister@cfmetodo.es" >> "$R" 2>&1
agent-browser fill "@e4" "metodo2025" >> "$R" 2>&1
agent-browser click "@e5" >> "$R" 2>&1
sleep 5
say "[3] login hecho (url: $(agent-browser get url 2>/dev/null))"

agent-browser open "http://localhost:3000/dashboard/match/live?g=$MATCH_ID" >> "$R" 2>&1
agent-browser wait --load networkidle >> "$R" 2>&1
sleep 3
agent-browser snapshot -i > /tmp/p3-live.txt 2>&1
agent-browser click "@e24" >> "$R" 2>&1
sleep 2
agent-browser snapshot -i > /tmp/p3-card.txt 2>&1
say "[4] ficha abierta — pulso Cargado/Al límite (HEAVY)"
agent-browser click "@e49" >> "$R" 2>&1
sleep 2
agent-browser screenshot /tmp/render/p3-card-heavy.png >> "$R" 2>&1
say "[5] captura tras pulsar"

# cierre + verificación en la API
agent-browser close >> "$R" 2>&1

CSRF=$(curl -s -c /tmp/cj.txt http://localhost:3000/api/auth/csrf | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b /tmp/cj.txt -c /tmp/cj.txt -X POST http://localhost:3000/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=mister@cfmetodo.es" \
  --data-urlencode "password=metodo2025" --data-urlencode "callbackUrl=http://localhost:3000/" \
  -o /dev/null
curl -s -b /tmp/cj.txt "http://localhost:3000/api/pilar3/matches/$MATCH_ID/telemetry" > /tmp/p3-tele.json
P1=$(python3 -c "import json;d=json.load(open('/tmp/p3-ids.json'));print(d['players'][0]['id'])")
python3 - << 'PYEOF' >> "$R" 2>&1
import json
d = json.load(open("/tmp/p3-tele.json"))
p1 = open("/tmp/p3-ids.json").read()
pid = json.loads(p1)["players"][0]["id"]
name = json.loads(p1)["players"][0]
evs = [e for e in d["events"] if e["playerId"] == pid and e["type"] == "FATIGUE"]
last = evs[-1] if evs else None
evals = {e["playerId"]: e for e in d["evaluations"]}
ev = evals.get(pid)
print(f"  jugador: {name['firstName']} {name['lastName']}")
print(f"  último evento FATIGUE: {last}")
print(f"  evaluación (estado ficha): fatigueFlag={ev['fatigueFlag'] if ev else None}")
print(f"  {'✅ ROUND-TRIP OK: HEAVY persistido' if ev and ev['fatigueFlag']=='HEAVY' else '❌ round-trip falló'}")
PYEOF

kill $NEXTJOB $PGJOB 2>/dev/null
pkill -f "next dev" 2>/dev/null; pkill -f embedded-postgres 2>/dev/null; pkill postgres 2>/dev/null
say "[6] cleanup"
echo "===== RESULTADO ====="
cat "$R"
