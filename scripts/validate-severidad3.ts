// ============================================================================
// VALIDACIÓN E2E — SEVERIDAD 3 (perfección técnica local)
// ----------------------------------------------------------------------------
// Certifica los tres refinamientos post-auditoría forense:
//   1. VENTANA TEMPORAL DEL PULSO: collectInputs solo acepta el pulso dentro
//      de [weekStart−8d, weekStart+2d]; caducado o inexistente → null y el
//      motor aplica defaults seguros (fatiga neutra 5/10, sin hallazgo anímico).
//   2. TZ MADRID: mondayOf decide el lunes con el calendario Europe/Madrid
//      (sin saltos de día por UTC, con y sin horario de verano).
//   3. FACTIBILIDAD FÍSICA EN APOYOS: MD+1 (recuperación, solo LOW) y MD-1
//      (activación, LOW/MEDIUM con techo por fatiga) respetan los jugadores
//      disponibles y los umbrales de fatiga del grupo — ninguna tarea inviable.
// Panel: escribe pilar5.json → bloque "Refino S3" en /dashboard/quality.
// Idempotente: purga clubes-probe anteriores (slug zzz-s3-*) antes de empezar.
// Ejecutar: bun scripts/validate-severidad3.ts  (dev server :3000, PG :5432)
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { addDays, subDays } from "date-fns";
import { randomUUID } from "node:crypto";
import { createTenantClient } from "../src/lib/tenant";
import { writeResults } from "./validation-output";
import { mondayOf, pulseWindowFor } from "../src/lib/utils/dates";
import { collectInputs, buildIssueDrafts } from "../src/lib/engine/diagnose";
import { runWeeklyProposalPipeline } from "../src/lib/engine/pipeline";

const PG = "postgresql://postgres:postgres@localhost:5432/metodo";
const BASE = "http://localhost:3000";
let failures = 0;
let total = 0;
const checkLog: Array<{ name: string; ok: boolean }> = [];
const t0 = Date.now();

function check(name: string, cond: boolean, detail = "") {
  total++;
  checkLog.push({ name, ok: cond });
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

const raw = new PrismaClient({ datasources: { db: { url: PG } } });

// ============================================================================
console.log("\n══ 0) Limpieza de restos de ejecuciones interrumpidas ══");
// ============================================================================
await raw.club.deleteMany({ where: { slug: { startsWith: "zzz-s3-" } } });
await raw.task.deleteMany({ where: { title: { endsWith: "S3 TEST" } } });
console.log("  sin restos previos — arranque limpio");

// ============================================================================
console.log("\n══ 1) TZ Madrid — mondayOf decide el lunes con el calendario de Madrid ══");
// ============================================================================
const isMondayUTC = (d: Date) => d.getUTCDay() === 1 && d.getUTCHours() === 0 && d.getUTCMinutes() === 0;

// E1 (invierno UTC+1): lunes 00:30 Madrid = domingo 23:30 UTC — el caso que
// con TZ del proceso saltaba a la semana anterior.
const wkE1 = mondayOf(new Date("2026-11-09T00:30:00+01:00"));
check(
  "E1 mondayOf(lunes 00:30 Madrid, invierno) → lunes 09-nov 00:00 UTC",
  isMondayUTC(wkE1) && wkE1.getTime() === Date.UTC(2026, 10, 9),
  wkE1.toISOString(),
);

// E2 (invierno UTC+1): domingo 23:30 Madrid = domingo 22:30 UTC — misma semana.
const wkE2 = mondayOf(new Date("2026-11-08T22:30:00Z"));
check(
  "E2 mondayOf(domingo 23:30 Madrid, invierno) → lunes 02-nov (semana que termina)",
  isMondayUTC(wkE2) && wkE2.getTime() === Date.UTC(2026, 10, 2),
  wkE2.toISOString(),
);

// E3 (verano UTC+2): lunes 00:30 Madrid = domingo 22:30 UTC.
const wkE3 = mondayOf(new Date("2026-07-13T00:30:00+02:00"));
check(
  "E3 mondayOf(lunes 00:30 Madrid, verano) → lunes 13-jul 00:00 UTC",
  isMondayUTC(wkE3) && wkE3.getTime() === Date.UTC(2026, 6, 13),
  wkE3.toISOString(),
);

// E4 (verano UTC+2): domingo 23:30 Madrid = domingo 21:30 UTC.
const wkE4 = mondayOf(new Date("2026-07-12T21:30:00Z"));
check(
  "E4 mondayOf(domingo 23:30 Madrid, verano) → lunes 06-jul (semana que termina)",
  isMondayUTC(wkE4) && wkE4.getTime() === Date.UTC(2026, 6, 6),
  wkE4.toISOString(),
);

// E5: miércoles por la tarde → lunes de ESA semana.
const wkE5 = mondayOf(new Date("2026-11-04T18:00:00Z"));
check(
  "E5 mondayOf(miércoles 18:00 UTC) → lunes 02-nov",
  isMondayUTC(wkE5) && wkE5.getTime() === Date.UTC(2026, 10, 2),
  wkE5.toISOString(),
);

// E6: cruce de mes — domingo 01-mar → lunes 23-feb.
const wkE6 = mondayOf(new Date("2026-03-01T12:00:00Z"));
check(
  "E6 mondayOf(domingo 01-mar) → lunes 23-feb (cruce de mes exacto)",
  isMondayUTC(wkE6) && wkE6.getTime() === Date.UTC(2026, 1, 23),
  wkE6.toISOString(),
);

// E7: cruce de año — domingo 03-ene-2027 → lunes 28-dic-2026.
const wkE7 = mondayOf(new Date("2027-01-03T12:00:00Z"));
check(
  "E7 mondayOf(domingo 03-ene-2027) → lunes 28-dic-2026 (cruce de año exacto)",
  isMondayUTC(wkE7) && wkE7.getTime() === Date.UTC(2026, 11, 28),
  wkE7.toISOString(),
);

// E8: ventana del pulso exacta — [weekStart−8d, weekStart+2d].
const weekStartRef = mondayOf(new Date("2026-11-04T18:00:00Z")); // lunes 02-nov
const win = pulseWindowFor(weekStartRef);
check(
  "E8a pulseWindowFor: gte = weekStart − 8 días (domingo previo incluido)",
  win.gte.getTime() === weekStartRef.getTime() - 8 * 86_400_000,
  win.gte.toISOString(),
);
check(
  "E8b pulseWindowFor: lte = weekStart + 2 días (miércoles de la semana)",
  win.lte.getTime() === weekStartRef.getTime() + 2 * 86_400_000,
  win.lte.toISOString(),
);

// ============================================================================
console.log("\n══ 2) Ventana temporal del pulso — collectInputs solo acepta pulsos vivos ══");
// ============================================================================
const TAG = randomUUID().slice(0, 8);
const clubW = await raw.club.create({ data: { name: "S3 Ventana", slug: `zzz-s3-ventana-${TAG}` } });
const seasonW = await raw.season.create({
  data: { clubId: clubW.id, name: "2026/27", startDate: new Date(), endDate: new Date() },
});
const teamW = await raw.team.create({
  data: { clubId: clubW.id, seasonId: seasonW.id, name: "Equipo Ventana S3" },
});
const dbW = createTenantClient(clubW.id) as unknown as PrismaClient;

const weekStart = mondayOf(new Date());
const pulseDay = (offset: number) => addDays(weekStart, offset);

/** Crea un pulso, consulta collectInputs, verifica y limpia (aislamiento total). */
async function probePulse(offsetDays: number, morale: number, fatigue: number) {
  const p = await raw.teamPulse.create({
    data: {
      clubId: clubW.id,
      teamId: teamW.id,
      date: pulseDay(offsetDays),
      moraleScore: morale,
      fatigueScore: fatigue,
    },
  });
  const inputs = await collectInputs(dbW, teamW.id, weekStart);
  await raw.teamPulse.delete({ where: { id: p.id } });
  return inputs;
}

// a) Caducado: hace 30 días (fatiga 9, ánimo 3) → RECHAZADO + defaults seguros
const stale = await probePulse(-30, 3, 9);
check("pulso de hace 30 días → RECHAZADO (pulse null)", stale.pulse == null, stale.pulse?.date.toISOString() ?? "null");
const draftsStale = await buildIssueDrafts(dbW, teamW.id, stale);
check(
  "defaults seguros sin pulso vivo: solo consolidación (sin hallazgo FÍSICO ni ANÍMICO)",
  draftsStale.length === 1 && draftsStale[0].kind === "TACTICAL" && draftsStale[0].phase === "OFFENSIVE",
  JSON.stringify(draftsStale.map((d) => d.kind)),
);

// b) Fuera por un día: weekStart − 9d → null
check("pulso de hace 9 días (fuera por 1) → RECHAZADO", (await probePulse(-9, 5, 5)).pulse == null);
// c) Borde exacto gte: weekStart − 8d (domingo previo, día de partido) → incluido
const atGte = await probePulse(-8, 5, 3);
check("pulso del domingo previo (weekStart−8d, borde gte) → INCLUIDO", atGte.pulse?.fatigueScore === 3, atGte.pulse?.date.toISOString());
// d) Lunes de la semana → incluido
check("pulso del lunes (weekStart+1d) → INCLUIDO", (await probePulse(1, 7, 5)).pulse?.moraleScore === 7);
// e) Borde exacto lte: weekStart + 2d (miércoles) → incluido
const atLte = await probePulse(2, 6, 4);
check("pulso del miércoles (weekStart+2d, borde lte) → INCLUIDO", atLte.pulse?.fatigueScore === 4, atLte.pulse?.date.toISOString());
// f) Fuera por un día arriba: weekStart + 3d → null
check("pulso del jueves (weekStart+3d, fuera por 1) → RECHAZADO", (await probePulse(3, 5, 5)).pulse == null);

// g) Coexistencia: domingo previo (fatiga 3) + lunes (fatiga 8) → gobierna el MÁS RECIENTE
const oldP = await raw.teamPulse.create({
  data: { clubId: clubW.id, teamId: teamW.id, date: pulseDay(-8), moraleScore: 8, fatigueScore: 3 },
});
const newP = await raw.teamPulse.create({
  data: { clubId: clubW.id, teamId: teamW.id, date: pulseDay(1), moraleScore: 6, fatigueScore: 8 },
});
const inputsBoth = await collectInputs(dbW, teamW.id, weekStart);
check(
  "coexistencia de pulsos vivos → el más reciente gobierna (fatiga 8)",
  inputsBoth.pulse?.id === newP.id && inputsBoth.pulse?.fatigueScore === 8 && inputsBoth.pulse?.id !== oldP.id,
  inputsBoth.pulse ? `date=${inputsBoth.pulse.date.toISOString().slice(0, 10)}` : "null",
);
const draftsBoth = await buildIssueDrafts(dbW, teamW.id, inputsBoth);
check(
  "el pulso vivo alimenta el diagnóstico: fatiga 8/10 → hallazgo FÍSICO",
  draftsBoth.some((d) => d.kind === "PHYSICAL" && /Fatiga grupal acumulada 8\/10/.test(d.evidence)),
  JSON.stringify(draftsBoth.map((d) => d.kind)),
);
await raw.teamPulse.deleteMany({ where: { teamId: teamW.id } });

// ============================================================================
console.log("\n══ 3) Factibilidad física en apoyos — MD+1 y MD-1 ══");
// ============================================================================
const clubF = await raw.club.create({ data: { name: "S3 Factibilidad", slug: `zzz-s3-feas-${TAG}` } });
const seasonF = await raw.season.create({
  data: { clubId: clubF.id, name: "2026/27", startDate: new Date(), endDate: new Date() },
});

// Tareas dedicadas del club (deterministas: la más reciente del pool de
// activación es la MEDIUM de test; la recuperación entra por el pool LOW).
const taskRec = await raw.task.create({
  data: {
    clubId: clubF.id,
    title: "Recuperación LOW S3 TEST",
    objective: "test S3",
    phases: ["OFFENSIVE"],
    playersMin: 4,
    durationMin: 40,
    intensity: "LOW",
  },
});
const taskAct = await raw.task.create({
  data: {
    clubId: clubF.id,
    title: "Activación MEDIUM S3 TEST",
    objective: "test S3",
    phases: ["OFFENSIVE"],
    playersMin: 2,
    durationMin: 35,
    intensity: "MEDIUM",
  },
});

async function feasibilityTeam(name: string, players: number, pulseFatigue: number) {
  const team = await raw.team.create({
    data: { clubId: clubF.id, seasonId: seasonF.id, name },
  });
  // Pulso del martes (dentro de la ventana) con la fatiga indicada
  await raw.teamPulse.create({
    data: { clubId: clubF.id, teamId: team.id, date: pulseDay(1), moraleScore: 6, fatigueScore: pulseFatigue },
  });
  for (let i = 0; i < players; i++) {
    await raw.player.create({
      data: {
        clubId: clubF.id,
        teamId: team.id,
        firstName: `J${i}`,
        lastName: "S3",
        shirtNumber: i + 1,
        primaryPosition: "CM",
        status: "AVAILABLE",
        isActive: true,
      },
    });
  }
  const dbF = createTenantClient(clubF.id) as unknown as PrismaClient;
  const proposal = await runWeeklyProposalPipeline(dbF, {
    clubId: clubF.id,
    teamId: team.id,
    weekStart,
  });
  const mc = await raw.microcycle.findUniqueOrThrow({
    where: { id: proposal.microcycleId! },
    include: { sessions: { include: { tasks: true } } },
  });
  const md1 = mc.sessions.find((s) => s.label === "MD+1");
  const mdm1 = mc.sessions.find((s) => s.label === "MD-1");
  const supportTaskIds = [...(md1?.tasks ?? []), ...(mdm1?.tasks ?? [])].map((t) => t.taskId);
  const supportTasks = supportTaskIds.length
    ? await raw.task.findMany({ where: { id: { in: supportTaskIds } } })
    : [];
  return { proposal, mc, md1, mdm1, supportTasks, team };
}

// --- FA: plantilla VACÍA + pulso CADUCADO (fatiga 9, ánimo 3) → defaults seguros
const FA = await feasibilityTeam("Equipo FA S3", 0, 9);
// el pulso de FA es del martes (vivo)… para probar "caducado" lo reemplazamos:
// rehacemos FA con pulso viejo: borramos el microciclo y el pulso del martes,
// creamos pulso de hace 30 días y re-cocinamos.
await raw.microcycle.deleteMany({ where: { teamId: FA.team.id } });
await raw.engineRun.deleteMany({ where: { teamId: FA.team.id } });
await raw.teamPulse.deleteMany({ where: { teamId: FA.team.id } });
await raw.teamPulse.create({
  data: { clubId: clubF.id, teamId: FA.team.id, date: subDays(weekStart, 30), moraleScore: 3, fatigueScore: 9 },
});
const dbFA = createTenantClient(clubF.id) as unknown as PrismaClient;
const faRun = await runWeeklyProposalPipeline(dbFA, {
  clubId: clubF.id,
  teamId: FA.team.id,
  weekStart,
});
check("FA: pipeline con plantilla vacía + pulso caducado → propuesta creada", faRun.created === true, JSON.stringify({ issues: faRun.issuesCount }));
const faMc = await raw.microcycle.findUniqueOrThrow({
  where: { id: faRun.microcycleId! },
  include: { sessions: { include: { tasks: true } } },
});
const faAllTasks = faMc.sessions.flatMap((s) => s.tasks);
check(
  "FA: pulso caducado NO gobierna → solo consolidación (sin hallazgo FÍSICO por fatiga 9 caducada)",
  faRun.issuesCount === 1 && faRun.prescriptions.every((p) => /consolidación/i.test(p.rationale) || p.issueKind === "TACTICAL"),
  JSON.stringify(faRun.prescriptions.map((p) => p.issueKind)),
);
const faRunRow = await raw.engineRun.findUniqueOrThrow({ where: { id: faRun.runId! } });
const faSnapshot = faRunRow.inputSnapshot as { pulse: unknown };
check("FA: EngineRun inputSnapshot.pulse === null (caducado fuera de ventana)", faSnapshot.pulse === null, JSON.stringify(faSnapshot));
const faKinds = (faRunRow.issuesJson as Array<{ kind: string }>).map((x) => x.kind);
check("FA: issuesJson sin PHYSICAL ni MORALE (defaults seguros)", !faKinds.includes("PHYSICAL") && !faKinds.includes("MORALE"), JSON.stringify(faKinds));
check(
  "FA: 0 jugadores disponibles → ninguna tarea en el césped (MD+1/MD-1 vacías por factibilidad)",
  faAllTasks.length === 0,
  `got ${faAllTasks.length} tareas`,
);

// --- FB: 5 disponibles + fatiga 8/10 → MD-1 sin MEDIUM (techo por fatiga)
const FB = await feasibilityTeam("Equipo FB S3", 5, 8);
check("FB: propuesta creada (5 jugadores, fatiga 8)", FB.proposal.created === true);
const fbSupport = FB.supportTasks;
check(
  "FB: tareas de apoyo solo intensidad LOW (fatiga alta) y playersMin ≤ 5",
  fbSupport.every((t) => t.intensity === "LOW" && t.playersMin <= 5),
  JSON.stringify(fbSupport.map((t) => `${t.title}:${t.intensity}/min${t.playersMin}`)),
);
check(
  "FB: la activación MEDIUM de test NO entra en MD-1 (contraindicada por fatiga 8/10)",
  !(FB.mdm1?.tasks ?? []).some((t) => t.taskId === taskAct.id) &&
    !(FB.md1?.tasks ?? []).some((t) => t.taskId === taskAct.id),
);

// --- FC: 5 disponibles + fatiga 4/10 → la MEDIUM de test SÍ entra en MD-1
const FC = await feasibilityTeam("Equipo FC S3", 5, 4);
check("FC: propuesta creada (5 jugadores, fatiga 4)", FC.proposal.created === true);
check(
  "FC: activación MEDIUM de test entra en MD-1 (factible sin fatiga alta, la más reciente del pool)",
  (FC.mdm1?.tasks ?? []).some((t) => t.taskId === taskAct.id),
  JSON.stringify(FC.mdm1?.tasks.map((t) => t.taskId)),
);
check(
  "FC: MD+1 mantiene techo LOW (regeneración) con playersMin ≤ 5",
  (FC.md1?.tasks ?? []).length >= 0 &&
    FC.supportTasks
      .filter((t) => (FC.md1?.tasks ?? []).some((st) => st.taskId === t.id))
      .every((t) => t.intensity === "LOW" && t.playersMin <= 5),
);

// --- FD: 1 disponible → ninguna tarea de apoyo exige más jugadores de los hay
const FD = await feasibilityTeam("Equipo FD S3", 1, 4);
check("FD: propuesta creada (1 jugador)", FD.proposal.created === true);
check(
  "FD: tareas de apoyo (MD+1/MD-1) nunca exceden los 1 disponible (playersMin ≤ 1)",
  FD.supportTasks.every((t) => t.playersMin <= 1),
  JSON.stringify(FD.supportTasks.map((t) => `${t.title}:min${t.playersMin}`)),
);
check(
  "FD: las tareas de test (min 4 y min 2) NO se asignan con plantilla insuficiente",
  !(FD.md1?.tasks ?? []).some((t) => t.taskId === taskRec.id || t.taskId === taskAct.id) &&
    !(FD.mdm1?.tasks ?? []).some((t) => t.taskId === taskRec.id || t.taskId === taskAct.id),
);

// ============================================================================
console.log("\n══ 4) HTTP — panel de control y Hoy ══");
// ============================================================================
async function login(email: string, password: string): Promise<string | null> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const csrf = (await csrfRes.json()) as { csrfToken: string };
  const cookie = csrfRes.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email,
      password,
      callbackUrl: BASE,
      json: "true",
    }),
    redirect: "manual",
  });
  const sessionCookie = res.headers
    .getSetCookie()
    .find((c) => c.startsWith("next-auth.session-token"));
  return sessionCookie ? sessionCookie.split(";")[0] : null;
}

const session = await login("mister@cfmetodo.es", "metodo2025");
check("login COACH_ADMIN", !!session);
if (session) {
  const resQ = await fetch(`${BASE}/dashboard/quality`, { headers: { cookie: session } });
  const htmlQ = await resQ.text();
  check("GET /dashboard/quality 200", resQ.status === 200);
  check("panel de control integra el bloque Refino S3 (Severidad 3)", htmlQ.includes("Refino S3"));
  const resT = await fetch(`${BASE}/dashboard/today`, { headers: { cookie: session } });
  check("GET /dashboard/today 200 (smoke post-refino)", resT.status === 200);
}

// ============================================================================
console.log("\n══ 🧹 Limpieza del material de prueba ══");
// ============================================================================
await raw.club.deleteMany({ where: { id: { in: [clubW.id, clubF.id] } } });
await raw.task.deleteMany({ where: { id: { in: [taskRec.id, taskAct.id] } } });
console.log("  clubes-probe y tareas S3 eliminados (cascada completa)");

await raw.$disconnect();

await writeResults(5, "Perfección técnica local — Severidad 3 (pulso vivo · TZ Madrid · factibilidad apoyos)", total, failures, t0, checkLog);

console.log(
  `\n${failures === 0 ? "🎉 TODO OK — Severidad 3 validada (ventana de pulso + TZ Madrid + factibilidad MD+1/MD-1)" : `💥 ${failures} fallos`}`,
);
process.exit(failures === 0 ? 0 : 1);
