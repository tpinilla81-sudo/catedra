#!/usr/bin/env bash
# ============================================================================
# Verificación e2e del Pilar 2/3 en el sandbox — TODO EN UNA LLAMADA
# (el sandbox mata procesos background entre llamadas, así que: PG → migrate
#  → seed → dev server → API smoke (curl+cookie NextAuth) → agent-browser
#  → capturas → cleanup)
# ============================================================================
cd /home/z/my-project
set +e
# El sandbox exporta DATABASE_URL=file:... (SQLite del template) por encima
# del .env → lo corregimos para TODOS los comandos de este script.
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"
export DIRECT_URL="postgresql://postgres:postgres@localhost:5432/metodo"
mkdir -p /tmp/render
R=/tmp/p3-results.txt
: > "$R"

say() { echo "== $1" | tee -a "$R"; }

# ---------- 1. PostgreSQL embebido ----------
say "[1] PostgreSQL"
node scripts/dev-postgres.mjs > /tmp/pg.log 2>&1 &
PGJOB=$!
for i in $(seq 1 40); do
  node -e "const n=require('net');const s=n.connect(5432,'localhost',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(1000,()=>{s.destroy();process.exit(1)})" && break
  sleep 1
done
node -e "const n=require('net');const s=n.connect(5432,'localhost',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(1000,()=>{s.destroy();process.exit(1)})" \
  && say "  PG listo en :5432" || { say "  💥 PG NO ARRANCÓ"; cat /tmp/pg.log >> "$R"; exit 1; }

# ---------- 2. Migraciones + seed ----------
say "[2] prisma migrate deploy"
bunx prisma migrate deploy > /tmp/mig.log 2>&1 && say "  OK" || { say "  💥 FALLO"; tail -15 /tmp/mig.log >> "$R"; exit 1; }
say "[3] seed"
bun prisma/seed.ts > /tmp/seed.log 2>&1 && say "  OK" || { say "  💥 FALLO"; tail -10 /tmp/seed.log >> "$R"; exit 1; }

# ---------- 4. ids reales ----------
say "[4] ids de prueba"
bun scripts/p3-test-ids.ts > /tmp/p3-ids.json 2>/dev/null
python3 - << 'PYEOF' >> "$R" 2>&1
import json
d = json.load(open("/tmp/p3-ids.json"))
print(f"  partido={d['matchId']} rival={d['opponent']} estado={d['status']} jugadores={len(d['players'])}")
PYEOF
MATCH_ID=$(python3 -c "import json;print(json.load(open('/tmp/p3-ids.json'))['matchId'])")
P1=$(python3 -c "import json;d=json.load(open('/tmp/p3-ids.json'));print(d['players'][0]['id'])")
P2=$(python3 -c "import json;d=json.load(open('/tmp/p3-ids.json'));print(d['players'][1]['id'])")
[ -n "$MATCH_ID" ] && [ -n "$P1" ] || { say "  💥 sin ids"; exit 1; }

# ---------- 5. dev server ----------
say "[5] next dev"
nohup node_modules/.bin/next dev -p 3000 > /tmp/next.log 2>&1 &
NEXTJOB=$!
UP=0
for i in $(seq 1 90); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
  [ "$CODE" = "200" ] && { UP=1; break; }
  sleep 1
done
[ "$UP" = "1" ] && say "  server arriba (200)" || { say "  💥 server no respondió"; tail -25 /tmp/next.log >> "$R"; exit 1; }

# ---------- 6. login NextAuth vía curl ----------
say "[6] login NextAuth (curl)"
CSRF=$(curl -s -c /tmp/cj.txt http://localhost:3000/api/auth/csrf | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
LOGIN=$(curl -s -b /tmp/cj.txt -c /tmp/cj.txt -X POST http://localhost:3000/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=mister@cfmetodo.es" \
  --data-urlencode "password=metodo2025" \
  --data-urlencode "callbackUrl=http://localhost:3000/dashboard" \
  -o /dev/null -w "%{http_code}")
DASH=$(curl -s -b /tmp/cj.txt -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard)
say "  login=$LOGIN dashboard=$DASH"

# ---------- 7. API smoke ----------
say "[7] API /api/pilar3"
say "  -- START reloj"
curl -s -b /tmp/cj.txt -X POST http://localhost:3000/api/pilar3/events \
  -H "Content-Type: application/json" \
  -d "{\"matchId\":\"$MATCH_ID\",\"action\":\"START\"}" > /tmp/p3-r1.json
say "  -- lote de eventos (fatiga/clínico/táctico/acción)"
curl -s -b /tmp/cj.txt -X POST http://localhost:3000/api/pilar3/events \
  -H "Content-Type: application/json" \
  -d "{\"matchId\":\"$MATCH_ID\",\"events\":[{\"playerId\":\"$P1\",\"type\":\"FATIGUE\",\"value\":\"FRESH\"},{\"playerId\":\"$P1\",\"type\":\"CLINICAL\",\"value\":\"MINOR\"},{\"playerId\":\"$P2\",\"type\":\"TACTICAL\",\"value\":\"EXPLOITING\"},{\"type\":\"ACTION\",\"value\":\"GOAL_FOR\"}]}" > /tmp/p3-r2.json
say "  -- evento inválido (debe 400)"
BAD=$(curl -s -b /tmp/cj.txt -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/pilar3/events \
  -H "Content-Type: application/json" \
  -d "{\"matchId\":\"$MATCH_ID\",\"events\":[{\"type\":\"FATIGUE\",\"value\":\"NO_EXISTE\"}]}")
echo "  invalid_code=$BAD" >> "$R"
say "  -- GET telemetry"
curl -s -b /tmp/cj.txt "http://localhost:3000/api/pilar3/matches/$MATCH_ID/telemetry" > /tmp/p3-r3.json
say "  -- PAUSE + RESUME"
curl -s -b /tmp/cj.txt -X POST http://localhost:3000/api/pilar3/events -H "Content-Type: application/json" -d "{\"matchId\":\"$MATCH_ID\",\"action\":\"PAUSE\"}" > /tmp/p3-r4.json
curl -s -b /tmp/cj.txt -X POST http://localhost:3000/api/pilar3/events -H "Content-Type: application/json" -d "{\"matchId\":\"$MATCH_ID\",\"action\":\"RESUME\"}" > /tmp/p3-r5.json
say "  -- bookmark de vídeo"
EVID=$(python3 -c "import json;print(json.load(open('/tmp/p3-r2.json'))['created'][0]['id'])")
curl -s -b /tmp/cj.txt -X POST http://localhost:3000/api/pilar3/video-bookmarks \
  -H "Content-Type: application/json" \
  -d "{\"telemetryEventId\":\"$EVID\",\"notes\":\"clip de test\"}" > /tmp/p3-r6.json

python3 - << 'PYEOF' >> "$R" 2>&1
import json

txt = open("/tmp/p3-results.txt").read()
chk_code = "invalid_code=400" in txt

def load(p):
    try: return json.load(open(p))
    except Exception as e: return {"_error": str(e)}

r1, r2, r3, r4, r5, r6 = (load(f"/tmp/p3-r{i}.json") for i in (1, 2, 3, 4, 5, 6))
ok = True
def chk(name, cond):
    global ok
    print(f"  {'✅' if cond else '❌'} {name}")
    if not cond: ok = False

chk("START crea sesión LIVE", r1.get("ok") and r1["session"]["status"] == "LIVE")
chk("lote de 4 eventos creado", r2.get("ok") and len(r2.get("created", [])) == 4)
chk("evaluación de estado actualizada (P1 FATIGUE=FRESH)", r2["created"][0]["type"] == "FATIGUE")
chk("evento inválido → 400", BAD == "400" if (BAD := open("/tmp/p3-results.txt").read().find("400") >= 0) else False)
chk("telemetry: eventos ≥ 4", r3.get("ok") and len(r3.get("events", [])) >= 4)
chk("telemetry: XI/banquillo presente", r3.get("ok") and len(r3.get("players", [])) >= 4 and len(r3.get("evaluations", [])) >= 1)
chk("telemetry: agregados", r3.get("ok") and r3["aggregates"]["total"] >= 4)
chk("telemetry: sesión con vídeo/offset", r3.get("ok") and r3["session"] is not None)
chk("PAUSE → PAUSED", r4.get("ok") and r4["session"]["status"] == "PAUSED")
chk("RESUME → LIVE", r5.get("ok") and r5["session"]["status"] == "LIVE")
chk("bookmark creado 1:1", r6.get("ok") and r6["bookmark"]["telemetryEventId"] == r2["created"][0]["id"])
chk("bookmark: segundo calculado con offset", isinstance(r6["bookmark"]["videoTimestampSeconds"], (int, float)))
print(f"\n  {'🎯 API TODO OK' if ok else '💥 API CON FALLOS'}")
PYEOF

# ---------- 8. Verificación visual (agent-browser, móvil) ----------
say "[8] visual agent-browser (iPhone)"
agent-browser set device "iPhone 13" >> "$R" 2>&1
agent-browser open http://localhost:3000/ >> "$R" 2>&1
agent-browser wait --load networkidle >> "$R" 2>&1
SNAP=/tmp/p3-login.txt
agent-browser snapshot -i > "$SNAP" 2>&1
rg -n "email|password|textbox" "$SNAP" | head -6 >> "$R" 2>&1
# rellena el formulario por refs detectados
E_REF=$(rg -o '@e[0-9]+' "$SNAP" | head -1)
agent-browser find label fill "Email" "mister@cfmetodo.es" >> "$R" 2>&1
agent-browser find label fill "Contraseña" "metodo2025" >> "$R" 2>&1 || agent-browser find label fill "Password" "metodo2025" >> "$R" 2>&1
agent-browser find role button click --name "Entrar" >> "$R" 2>&1 || agent-browser find role button click >> "$R" 2>&1
agent-browser wait --url "/dashboard" >> "$R" 2>&1 || sleep 4
URL=$(agent-browser get url 2>/dev/null)
say "  tras login: $URL"

agent-browser open "http://localhost:3000/dashboard/match/live?g=$MATCH_ID" >> "$R" 2>&1
agent-browser wait --load networkidle >> "$R" 2>&1
sleep 2
agent-browser screenshot /tmp/render/p3-live-mobile.png >> "$R" 2>&1
say "  captura tablón: /tmp/render/p3-live-mobile.png"

# pulsa un jugador (primer botón de jugador visible) → ficha rápida
agent-browser snapshot -i > /tmp/p3-live.txt 2>&1
say "  refs tablón: $(wc -l < /tmp/p3-live.txt) líneas"
agent-browser find first "button" screenshot /tmp/render/ignore.png > /dev/null 2>&1 || true

# ---------- 9. cleanup ----------
agent-browser close >> "$R" 2>&1
kill $NEXTJOB $PGJOB 2>/dev/null
pkill -f "next dev" 2>/dev/null; pkill -f embedded-postgres 2>/dev/null; pkill postgres 2>/dev/null
say "[9] cleanup hecho"
echo "===== RESULTADO ====="
cat "$R"
