#!/bin/bash
# SMOKE VISUAL — tablón en directo (Pilar 3) en navegador real.
# Todo en UNA sesión: dev server + login + tablón + ficha rápida + capturas.
cd /home/z/my-project
set -u
MATCH=$(cat tool-results/visual-match-id.txt)
SHOT=tool-results

setsid nohup bun run dev > dev.log 2>&1 < /dev/null &
for i in $(seq 1 40); do
  node -e "require('net').connect({host:'localhost',port:3000},()=>{process.exit(0)}).on('error',()=>process.exit(1))" 2>/dev/null && break
  sleep 2
done
echo "── dev server listo ──"

# Sesión directa: csrf → credentials → cookie (mismo flujo que validate-live)
COOKIE=$(node --input-type=module -e "
const csrfRes = await fetch('http://localhost:3000/api/auth/csrf');
const { csrfToken } = await csrfRes.json();
const cookie = csrfRes.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const res = await fetch('http://localhost:3000/api/auth/callback/credentials', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
  body: new URLSearchParams({ csrfToken, email: 'mister@cfmetodo.es', password: 'metodo2025', callbackUrl: 'http://localhost:3000', json: 'true' }),
  redirect: 'manual',
});
const token = res.headers.getSetCookie().find((c) => c.startsWith('next-auth.session-token'));
if (!token) { console.error('LOGIN HTTP FALLÓ', res.status); process.exit(1); }
console.log(token.split(';')[0].split('=').slice(1).join('='));
")
echo "── cookie de sesión obtenida (${#COOKIE} chars) ──"

agent-browser open "http://localhost:3000/" >/dev/null 2>&1
agent-browser wait 1200
agent-browser cookies set next-auth.session-token "$COOKIE"
agent-browser open "http://localhost:3000/dashboard/match/live?g=$MATCH" >/dev/null 2>&1
agent-browser wait --load networkidle --timeout 30000
agent-browser wait 1000
agent-browser get url
agent-browser screenshot $SHOT/board.png --full && echo "── CAPTURA TABLÓN OK ──"

# Abrir la ficha rápida de Iker (portero, limpio de estado)
agent-browser find text "Iker" click
agent-browser wait 600
agent-browser screenshot $SHOT/card-open.png && echo "── CAPTURA FICHA ABIERTA OK ──"

# 1 toque: 🟢 Fresco / Arriba → guarda al instante (optimista)
agent-browser find text "Fresco / Arriba" click
agent-browser wait 900
agent-browser screenshot $SHOT/card-set.png && echo "── CAPTURA ESTADO FIJADO OK ──"

# Cerrar ficha (Escape) y captura final del campo con el punto de estado
agent-browser press Escape
agent-browser wait 500
agent-browser screenshot $SHOT/board-final.png && echo "── CAPTURA FINAL OK ──"

agent-browser close >/dev/null 2>&1
# Verificación autoritativa: ¿el flag quedó en la base de datos?
node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const raw = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/metodo' } } });
const matchId = '$MATCH';
const gk = await raw.player.findFirst({ where: { firstName: 'Iker', team: { name: 'Equipo Visual TEST' } } });
const ev = await raw.liveMatchEvaluation.findUnique({ where: { matchId_playerId: { matchId, playerId: gk.id } } });
console.log('DB CHECK → fatigueFlag de Iker:', ev?.fatigueFlag, '· statusUpdatedAt:', ev?.statusUpdatedAt ? 'sí' : 'no');
console.log(ev?.fatigueFlag === 'FRESH' ? '✅ 1-toque persistió en DB' : '❌ NO persistió');
await raw.\$disconnect();
process.exit(ev?.fatigueFlag === 'FRESH' ? 0 : 1);
"
echo "── limpieza ──"
node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
import { readFileSync, rmSync } from 'node:fs';
const raw = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/metodo' } } });
for (const t of await raw.team.findMany({ where: { name: 'Equipo Visual TEST' } })) {
  await raw.match.deleteMany({ where: { teamId: t.id } });
  await raw.player.deleteMany({ where: { teamId: t.id } });
  await raw.team.delete({ where: { id: t.id } });
}
const mister = await raw.user.findUniqueOrThrow({ where: { email: 'mister@cfmetodo.es' }, select: { id: true } });
const original = readFileSync('tool-results/visual-last-team.txt', 'utf8').trim();
await raw.user.update({ where: { id: mister.id }, data: { lastTeamId: original || null } });
rmSync('tool-results/visual-match-id.txt'); rmSync('tool-results/visual-last-team.txt');
console.log('material visual eliminado + lastTeamId restaurado');
await raw.\$disconnect();
"
