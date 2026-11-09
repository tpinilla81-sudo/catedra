#!/usr/bin/env bash
# ============================================================================
# Round-trip DEFINITIVO del Pilar 3 (ficha rápida 1-toque) — versión corregida
# ----------------------------------------------------------------------------
# Corrige los 3 falsos fallos de las rondas anteriores:
#   1. Click por NOMBRE accesible (scripts/p3-ref.py sobre el snapshot),
#      no por índice frágil (@e49 era "Fresco/Arriba"=FRESH, no el HEAVY).
#   2. Se verifica el jugador PULSADO (Pablo Ferrer), no players[0] (Iker Sanz).
#   3. El check del 400 usa el código HTTP real de curl, no un find().
#
# Flujo comprobado (UI→API→DB→GET):
#   HEAVY on        → evento FATIGUE/HEAVY + fatigueFlag=HEAVY
#   EXHAUSTED on    → (último toque gana) evento + fatigueFlag=EXHAUSTED
#   EXHAUSTED off   → fatigueFlag=null y NINGÚN evento nuevo (toggle sin evento)
# ============================================================================
cd /home/z/my-project
set +e
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"
export DIRECT_URL="postgresql://postgres:postgres@localhost:5432/metodo"
mkdir -p /tmp/render
R=/tmp/p3-roundtrip.txt
: > "$R"
say() { echo "== $1" | tee -a "$R"; }

# ---------- 1. PG + migraciones + seed + estado limpio ----------
node scripts/dev-postgres.mjs > /tmp/pg.log 2>&1 &
PGJOB=$!
for i in $(seq 1 40); do
  node -e "const n=require('net');const s=n.connect(5432,'localhost',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(1000,()=>{s.destroy();process.exit(1)})" && break
  sleep 1
done
bunx prisma migrate deploy > /tmp/mig.log 2>&1 && bun prisma/seed.ts > /tmp/seed.log 2>&1 \
  && bun scripts/p3-reset-session.ts > /tmp/reset.log 2>&1 \
  && say "[1] PG + datos + reset OK ($(cat /tmp/reset.log))" \
  || { say "💥 datos"; tail -5 /tmp/mig.log /tmp/seed.log /tmp/reset.log >> "$R"; exit 1; }

bun scripts/p3-test-ids.ts > /tmp/p3-ids.json 2>/dev/null
MATCH_ID=$(python3 -c "import json;print(json.load(open('/tmp/p3-ids.json'))['matchId'])")
PABLO=$(python3 -c "
import json
d = json.load(open('/tmp/p3-ids.json'))
print(next(p['id'] for p in d['players'] if p['lastName']=='Ferrer'))")
IKER=$(python3 -c "
import json
d = json.load(open('/tmp/p3-ids.json'))
print(next(p['id'] for p in d['players'] if p['lastName']=='Sanz'))")
say "[2] partido=$MATCH_ID pablo=…${PABLO: -6} iker=…${IKER: -6}"

# ---------- 2. dev server ----------
nohup node_modules/.bin/next dev -p 3000 > /tmp/next.log 2>&1 &
NEXTJOB=$!
for i in $(seq 1 90); do
  [ "$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)" = "200" ] && break
  sleep 1
done
say "[3] server arriba"

# ---------- 3. login NextAuth (curl, cookie jar) ----------
CSRF=$(curl -s -c /tmp/cj.txt http://localhost:3000/api/auth/csrf | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b /tmp/cj.txt -c /tmp/cj.txt -X POST http://localhost:3000/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=mister@cfmetodo.es" \
  --data-urlencode "password=metodo2025" --data-urlencode "callbackUrl=http://localhost:3000/" \
  -o /dev/null
say "[4] login curl hecho"

# ---------- 4. check del 400 (corregido) ----------
BAD=$(curl -s -b /tmp/cj.txt -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/pilar3/events \
  -H "Content-Type: application/json" \
  -d "{\"matchId\":\"$MATCH_ID\",\"events\":[{\"type\":\"FATIGUE\",\"value\":\"NO_EXISTE\"}]}")
say "[5] evento inválido → HTTP $BAD (esperado 400)"

# ---------- 5. estado inicial limpio vía API ----------
curl -s -b /tmp/cj.txt "http://localhost:3000/api/pilar3/matches/$MATCH_ID/telemetry" > /tmp/p3-t0.json
python3 - "$PABLO" << 'PYEOF' >> "$R" 2>&1
import json, sys
pid = sys.argv[1]
d = json.load(open("/tmp/p3-t0.json"))
evs = [e for e in d["events"] if e["playerId"] == pid]
evals = {e["playerId"] for e in d["evaluations"]}
print(f"  estado inicial: eventos de Pablo={len(evs)}, evaluación={'sí' if pid in evals else 'no'}")
print(f"  {'✅ partida de cero' if len(evs) == 0 and pid not in evals else '❌ estado sucio'}")
PYEOF

# ---------- 6. UI: login SOLO si el formulario está (el navegador puede
#          conservar la sesión de una ejecución anterior) ----------
agent-browser set device "iPhone 16" >> "$R" 2>&1
agent-browser open http://localhost:3000/ >> "$R" 2>&1
agent-browser wait --load networkidle >> "$R" 2>&1
agent-browser snapshot -i > /tmp/p3-rt-login.txt 2>&1
read -r E_REF P_REF B_REF <<< "$(python3 scripts/p3-ref.py /tmp/p3-rt-login.txt "Email del cuerpo" "Contraseña" "Entrar al vestuario")"
if [ "$E_REF" != "X" ] && [ "$B_REF" != "X" ]; then
  say "[6] formulario de login: email=$E_REF pass=$P_REF btn=$B_REF"
  agent-browser fill "@$E_REF" "mister@cfmetodo.es" >> "$R" 2>&1
  agent-browser fill "@$P_REF" "metodo2025" >> "$R" 2>&1
  agent-browser click "@$B_REF" >> "$R" 2>&1
  sleep 5
else
  say "[6] navegador ya autenticado (sin formulario) — sigo directo"
fi

agent-browser open "http://localhost:3000/dashboard/match/live?g=$MATCH_ID" >> "$R" 2>&1
agent-browser wait --load networkidle >> "$R" 2>&1
sleep 3
agent-browser snapshot -i > /tmp/p3-rt-board.txt 2>&1
PL_REF=$(python3 scripts/p3-ref.py /tmp/p3-rt-board.txt "Ferrer")
say "[7] Pablo Ferrer en tablón: ref=$PL_REF"
if [ "$PL_REF" = "X" ]; then
  say "💥 jugador no encontrado"; cat /tmp/p3-rt-board.txt >> "$R"; exit 1
fi
agent-browser click "@$PL_REF" >> "$R" 2>&1
sleep 2
agent-browser snapshot -i > /tmp/p3-rt-card.txt 2>&1
read -r H_REF X_REF <<< "$(python3 scripts/p3-ref.py /tmp/p3-rt-card.txt "Cargado / Al límite" "Fundido / Pide cambio")"
say "[8] ficha abierta: HEAVY=$H_REF EXHAUSTED=$X_REF"
if [ "$H_REF" = "X" ] || [ "$X_REF" = "X" ]; then
  say "💥 botones de estado no encontrados"; cat /tmp/p3-rt-card.txt >> "$R"; exit 1
fi

# HEAVY on
agent-browser find role button click --name "Cargado / Al límite" >> "$R" 2>&1 || \
  agent-browser click "@$H_REF" >> "$R" 2>&1
sleep 3
curl -s -b /tmp/cj.txt "http://localhost:3000/api/pilar3/matches/$MATCH_ID/telemetry" > /tmp/p3-s1.json
FLAG1=$(python3 -c "
import json
d = json.load(open('/tmp/p3-s1.json'))
ev = next((e for e in d['evaluations'] if e['playerId']=='$PABLO'), None)
print(ev['fatigueFlag'] if ev else 'NO_EVAL')")
say "[9a] tras HEAVY → ficha=$FLAG1 (esperado HEAVY)"
agent-browser screenshot /tmp/render/p3-rt-heavy.png >> "$R" 2>&1

# EXHAUSTED on (último toque gana) — find re-consulta el DOM, inmune a refs viejas
agent-browser find role button click --name "Fundido / Pide cambio" >> "$R" 2>&1 || \
  agent-browser click "@$X_REF" >> "$R" 2>&1
sleep 3
curl -s -b /tmp/cj.txt "http://localhost:3000/api/pilar3/matches/$MATCH_ID/telemetry" > /tmp/p3-s2.json
FLAG2=$(python3 -c "
import json
d = json.load(open('/tmp/p3-s2.json'))
ev = next((e for e in d['evaluations'] if e['playerId']=='$PABLO'), None)
print(ev['fatigueFlag'] if ev else 'NO_EVAL')")
say "[9b] tras EXHAUSTED → ficha=$FLAG2 (esperado EXHAUSTED)"

# EXHAUSTED off (toggle: repetir apaga) — re-resuelve el botón en el DOM
agent-browser find role button click --name "Fundido / Pide cambio" >> "$R" 2>&1 || \
  agent-browser click "@$X_REF" >> "$R" 2>&1
sleep 3
agent-browser close >> "$R" 2>&1
say "[9c] clicks hechos (HEAVY → EXHAUSTED → off)"

# ---------- 7. verificación servidor ----------
curl -s -b /tmp/cj.txt "http://localhost:3000/api/pilar3/matches/$MATCH_ID/telemetry" > /tmp/p3-t1.json
python3 - "$PABLO" "$IKER" "$BAD" << 'PYEOF' >> "$R" 2>&1
import json, sys
pid, iker, bad = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open("/tmp/p3-t1.json"))
evs = [e for e in d["events"] if e["playerId"] == pid and e["type"] == "FATIGUE"]
evals = {e["playerId"]: e for e in d["evaluations"]}
ev = evals.get(pid)
ok = True
def chk(name, cond):
    global ok
    print(f"  {'✅' if cond else '❌'} {name}")
    if not cond: ok = False

print(f"  eventos FATIGUE de Pablo: {[(e['value'], 'min ' + str(e['minute'])) for e in evs]}")
print(f"  ficha de Pablo: fatigueFlag={ev['fatigueFlag'] if ev else '—'}")
chk("evento inválido → 400", bad == "400")
chk("[HEAVY] evento persistido", any(e["value"] == "HEAVY" for e in evs))
chk("[HEAVY] ficha creada por el toque (statusUpdatedAt)", bool(ev) and ev["statusUpdatedAt"] is not None)
chk("[EXHAUSTED] evento persistido (último toque gana)", any(e["value"] == "EXHAUSTED" for e in evs))
chk("[OFF] toggle apaga la ficha (fatigueFlag=null)", bool(ev) and ev["fatigueFlag"] is None)
chk("[OFF] toggle no crea evento (solo 2 FATIGUE)", len(evs) == 2)
chk("[AISLAMIENTO] Iker sin evaluación", iker not in evals)
chk("agregados coherentes (FATIGUE=2)", d["aggregates"]["byType"].get("FATIGUE", 0) == 2)
print(f"\n  {'🎯 ROUND-TRIP DEFINITIVO OK' if ok else '💥 ROUND-TRIP CON FALLOS'}")
sys.exit(0 if ok else 1)
PYEOF
RT=$?

kill $NEXTJOB $PGJOB 2>/dev/null
pkill -f "next dev" 2>/dev/null; pkill -f embedded-postgres 2>/dev/null; pkill postgres 2>/dev/null
say "[10] cleanup"
echo "===== RESULTADO ====="
cat "$R"
exit $RT
