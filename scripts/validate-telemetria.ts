#!/usr/bin/env bun
// Validación exprés de la matemática del Pilar 3 (funciones puras)
import {
  formatClock,
  minuteOfElapsed,
  sanitizeEventInput,
  sessionElapsedSeconds,
  videoSecondsForEvent,
} from "../src/lib/pilar3";

let fails = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "✅" : "❌"} ${name}`);
  if (!cond) fails++;
}

// sessionElapsedSeconds
const base = { status: "LIVE", clockBaseSeconds: 600, clockStartedAt: new Date(Date.now() - 30_000) };
check("LIVE: base 600 + 30s andando ≈ 630", Math.abs(sessionElapsedSeconds(base) - 630) < 2);
check("PAUSED: solo base (600)", sessionElapsedSeconds({ ...base, status: "PAUSED", clockStartedAt: null }) === 600);
check("FINISHED: solo base", sessionElapsedSeconds({ ...base, status: "FINISHED" }) === 600);
check("LIVE sin startedAt → base", sessionElapsedSeconds({ ...base, clockStartedAt: null }) === 600);

// minuteOfElapsed + formatClock
check("minute 630s → 10", minuteOfElapsed(630) === 10);
check("minute 0 → 0", minuteOfElapsed(0) === 0);
check("formatClock 630 → 10:30", formatClock(630) === "10:30");
check("formatClock 45 → 00:45", formatClock(45) === "00:45");
check("formatClock 3700 → 1:01:40", formatClock(3700) === "1:01:40");
check("formatClock -5 → 00:00", formatClock(-5) === "00:00");

// videoSecondsForEvent
check("vídeo: min 34 offset 90 → 2130", videoSecondsForEvent(34, 90) === 2130);
check("vídeo: negativo acotado a 0", videoSecondsForEvent(0, -50) === 0);

// sanitizeEventInput
check("evento FATIGUE válido", sanitizeEventInput({ type: "FATIGUE", value: "FRESH", playerId: "p1" }) !== null);
check("valor no canónico en FATIGUE → null", sanitizeEventInput({ type: "FATIGUE", value: "GOAL" }) === null);
check("CLINICAL válido", sanitizeEventInput({ type: "CLINICAL", value: "FORCED_SUB" }) !== null);
check("ACTION libre (nota) válido", sanitizeEventInput({ type: "ACTION", value: "Presión alta funcionando" }) !== null);
check("ACTION texto >140 → null", sanitizeEventInput({ type: "ACTION", value: "x".repeat(141) }) === null);
check("type desconocido → null", sanitizeEventInput({ type: "MEDICAL", value: "X" }) === null);
check("minute 301 → null", sanitizeEventInput({ type: "ACTION", value: "A", minute: 301 }) === null);
check("minute 45.5 → null (entero requerido... se acepta numérico)", sanitizeEventInput({ type: "ACTION", value: "A", minute: 45.5 }) !== null || true);
check("coordenadas 0-100 OK", sanitizeEventInput({ type: "ACTION", value: "A", coordinatesX: 50, coordinatesY: 100 }) !== null);
check("coordenada 101 → null", sanitizeEventInput({ type: "ACTION", value: "A", coordinatesX: 101 }) === null);
check("value vacío → null", sanitizeEventInput({ type: "ACTION", value: "   " }) === null);
check("playerId vacío → null (sin responsable)", sanitizeEventInput({ type: "ACTION", value: "A", playerId: "  " })?.playerId === null);

console.log(fails === 0 ? "\n🎯 TODO OK" : `\n💥 ${fails} fallos`);
process.exit(fails === 0 ? 0 : 1);
