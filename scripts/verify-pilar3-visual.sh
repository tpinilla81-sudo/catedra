#!/usr/bin/env bash
# Verificación visual del Pilar 3: login móvil + tablón + ficha rápida 1-toque
cd /home/z/my-project
set +e
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metodo"
export DIRECT_URL="postgresql://postgres:postgres@localhost:5432/metodo"
mkdir -p /tmp/render
R=/tmp/p3-visual.txt
: > "$R"
say() { echo "== $1" | tee -a "$R"; }

# ---------- PG + migrate + seed (idempotente) ----------
say "[1] PG + datos"
node scripts/dev-postgres.mjs > /tmp/pg.log 2>&1 &
PGJOB=$!
for i in $(seq 1 40); do
  node -e "const n=require('net');const s=n.connect(5432,'localhost',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(1000,()=>{s.destroy();process.exit(1)})" && break
  sleep 1
done
bunx prisma migrate deploy > /tmp/mig.log 2>&1 && bun prisma/seed.ts > /tmp/seed.log 2>&1 && say "  OK" || { say "  💥 fallo migrate/seed"; tail -8 /tmp/mig.log /tmp/seed.log >> "$R"; exit 1; }
bun scripts/p3-test-ids.ts > /tmp/p3-ids.json 2>/dev/null
MATCH_ID=$(python3 -c "import json;print(json.load(open('/tmp/p3-ids.json'))['matchId'])")
say "  partido=$MATCH_ID"

# ---------- dev server ----------
say "[2] next dev"
nohup node_modules/.bin/next dev -p 3000 > /tmp/next.log 2>&1 &
NEXTJOB=$!
UP=0
for i in $(seq 1 90); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
  [ "$CODE" = "200" ] && { UP=1; break; }
  sleep 1
done
[ "$UP" = "1" ] && say "  arriba" || { say "  💥 sin server"; tail -20 /tmp/next.log >> "$R"; exit 1; }

# ---------- browser móvil ----------
say "[3] browser (iPhone 16)"
agent-browser set device "iPhone 16" >> "$R" 2>&1
agent-browser open http://localhost:3000/ >> "$R" 2>&1
agent-browser wait --load networkidle >> "$R" 2>&1
SNAP=/tmp/p3-login.txt
agent-browser snapshot -i > "$SNAP" 2>&1
python3 - << 'PYEOF' > /tmp/p3-refs.txt
import re
txt = open("/tmp/p3-login.txt").read()
email = pw = btn = None
for line in txt.splitlines():
    m = re.search(r'ref=(e\d+)', line)
    if not m: continue
    ref = m.group(1)
    low = line.lower()
    if 'textbox' in low and 'email' in low and email is None: email = ref
    if 'textbox' in low and ('contrase' in low or 'password' in low): pw = ref
    if 'button' in low and btn is None: btn = ref
print(email or "", pw or "", btn or "")
PYEOF
read E_REF P_REF B_REF <<< "$(cat /tmp/p3-refs.txt)"
say "  refs: email=@$E_REF pass=@$P_REF btn=@$B_REF"
[ -n "$E_REF" ] || { say "  💥 snapshot sin refs"; cp "$SNAP" /tmp/p3-debug.txt; }
agent-browser fill "@$E_REF" "mister@cfmetodo.es" >> "$R" 2>&1
agent-browser fill "@$P_REF" "metodo2025" >> "$R" 2>&1
agent-browser click "@$B_REF" >> "$R" 2>&1
agent-browser wait --url "/dashboard" >> "$R" 2>&1 || sleep 6
URL=$(agent-browser get url 2>/dev/null)
say "  tras login: $URL"
case "$URL" in
  *dashboard*) say "  ✅ login OK" ;;
  *) say "  ❌ login NO entró"; agent-browser screenshot /tmp/render/p3-login-stuck.png >> "$R" 2>&1 ;;
esac

# ---------- tablón en directo ----------
say "[4] tablón en directo"
agent-browser open "http://localhost:3000/dashboard/match/live?g=$MATCH_ID" >> "$R" 2>&1
agent-browser wait --load networkidle >> "$R" 2>&1
sleep 3
agent-browser screenshot /tmp/render/p3-live-mob.png >> "$R" 2>&1
agent-browser snapshot -i > /tmp/p3-live.txt 2>&1
say "  tablón: $(wc -l < /tmp/p3-live.txt) elementos"

# clic en un jugador de la banqueta (botón con nombre "N. Apellido")
python3 - << 'PYEOF' > /tmp/p3-player-ref.txt
import re
txt = open("/tmp/p3-live.txt").read()
for line in txt.splitlines():
    m = re.search(r'ref=(e\d+)', line)
    if not m: continue
    if 'button' in line.lower() and re.search(r'button "?\d', line):
        print(m.group(1)); break
PYEOF
PL_REF=$(cat /tmp/p3-player-ref.txt)
say "  jugador ref=@$PL_REF"
if [ -n "$PL_REF" ]; then
  agent-browser click "@$PL_REF" >> "$R" 2>&1
  sleep 2
  agent-browser screenshot /tmp/render/p3-card-mob.png >> "$R" 2>&1
  agent-browser snapshot -i > /tmp/p3-card.txt 2>&1
  say "  ficha rápida: $(rg -c 'button' /tmp/p3-card.txt || echo 0) botones"
  # pulsa el botón 🟢 Fresco
  FR_REF=$(rg -o 'ref=e[0-9]+' /tmp/p3-card.txt | head -50 | rg -B0 . | head -0; python3 -c "
import re
txt = open('/tmp/p3-card.txt').read()
for line in txt.splitlines():
    if 'Fresco' in line:
        m = re.search(r'ref=(e\d+)', line)
        if m: print(m.group(1)); break
")
  say "  fresco ref=@$FR_REF"
  if [ -n "$FR_REF" ]; then
    agent-browser click "@$FR_REF" >> "$R" 2>&1
    sleep 2
    agent-browser screenshot /tmp/render/p3-card-fresco.png >> "$R" 2>&1
    say "  ✅ fresco pulsado"
  fi
  # cierra la ficha (Escape)
  agent-browser press Escape >> "$R" 2>&1
else
  say "  ❌ sin ref de jugador"
  cp /tmp/p3-live.txt /tmp/p3-live-debug.txt
fi

# ---------- reloj visible ----------
say "[5] texto del reloj"
agent-browser find text "EN JUEGO" text 2>/dev/null >> "$R" 2>&1 || true

agent-browser close >> "$R" 2>&1
kill $NEXTJOB $PGJOB 2>/dev/null
pkill -f "next dev" 2>/dev/null; pkill -f embedded-postgres 2>/dev/null; pkill postgres 2>/dev/null
say "[6] cleanup"
echo "===== RESULTADO ====="
cat "$R"
