// ============================================================================
// VALIDACIÓN E2E — PILAR 4 (Motor Prescriptivo + Auditoría EngineRun + Hoy)
// ----------------------------------------------------------------------------
// 1) Unit: ranking de candidatas (receta ponderada) + factibilidad
//    (jugadores disponibles / contraindicación fatiga×intensidad) sobre
//    subprincipios de prueba dedicados (determinismo total).
// 2) Persistencia: pipeline completo con equipo sintético → Microcycle +
//    DiagnosisIssue + SessionTask con prescribedIssueId + EngineRun con
//    prescripciones y descartadas; re-prescripción al llegar evidencia
//    (ACCEPTED intacto, PROPOSED regenerado).
// 3) Regeneración de la propuesta del equipo demo con el motor v0.2.
// 4) HTTP: /dashboard/today muestra "Por qué este plan" (transparencia).
// Idempotente: limpia restos de ejecuciones interrumpidas antes de empezar.
// Ejecutar: bun scripts/validate-pilar4.ts  (dev server en :3000, PG en :5432)
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { addDays, startOfWeek } from "date-fns";
import { createTenantClient } from "../src/lib/tenant";
import {
  prescribeForIssues,
  rankTaskCandidates,
  runWeeklyProposalPipeline,
  refreshProposalEvidence,
  ENGINE_VERSION,
  type PipelineDb,
} from "../src/lib/engine/pipeline";

const PG = "postgresql://postgres:postgres@localhost:5432/metodo";
const BASE = "http://localhost:3000";
let failures = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

const raw = new PrismaClient({ datasources: { db: { url: PG } } });

// ---------- Contexto ----------
const clubA = await raw.club.findUniqueOrThrow({ where: { slug: "cf-metodo" } });
const coach = await raw.user.findUniqueOrThrow({ where: { email: "mister@cfmetodo.es" } });
const dbA = createTenantClient(clubA.id) as unknown as PipelineDb;

const mondayThisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });

// ============================================================================
console.log("\n══ 0) Limpieza de restos de ejecuciones interrumpidas ══");
// ============================================================================
async function purgeTestData() {
  const leftoverTeams = await raw.team.findMany({
    where: { clubId: clubA.id, name: "Equipo Motor TEST" },
  });
  for (const lt of leftoverTeams) {
    await raw.engineRun.deleteMany({ where: { teamId: lt.id } });
    await raw.microcycle.deleteMany({ where: { teamId: lt.id } });
    await raw.match.deleteMany({ where: { teamId: lt.id } }); // cascada report+eventos
    await raw.teamPulse.deleteMany({ where: { teamId: lt.id } });
    await raw.player.deleteMany({ where: { teamId: lt.id } });
    await raw.team.delete({ where: { id: lt.id } });
  }
  // Tareas y subprincipios de test (las recetas caen en cascada)
  const ltTasks = await raw.task.findMany({
    where: { clubId: clubA.id, title: { endsWith: "TEST" } },
  });
  await raw.task.deleteMany({ where: { id: { in: ltTasks.map((t) => t.id) } } });
  const ltSps = await raw.subPrinciple.findMany({
    where: { clubId: clubA.id, name: { contains: "TEST" } },
  });
  await raw.subPrinciple.deleteMany({ where: { id: { in: ltSps.map((s) => s.id) } } });
}
await purgeTestData();
console.log("  sin restos previos — arranque limpio");

// ============================================================================
console.log("\n══ 1) Unit — ranking de candidatas + factibilidad ══");
// ============================================================================
// Subprincipios de prueba SOLO con las recetas del test (determinismo)
const spOffTest = await raw.subPrinciple.create({
  data: { clubId: clubA.id, phase: "OFF_TRANSITION", name: "SP Motor TEST A", order: 900 },
});
const spDefTest = await raw.subPrinciple.create({
  data: { clubId: clubA.id, phase: "DEFENSIVE", name: "SP Motor TEST B", order: 901 },
});

// Tareas de prueba (club A): cubren todos los caminos de factibilidad
const t1 = await raw.task.create({
  data: {
    clubId: clubA.id,
    title: "Pase y consolida TEST",
    objective: "test",
    phases: ["OFFENSIVE", "OFF_TRANSITION"],
    playersMin: 4,
    durationMin: 45,
    intensity: "MEDIUM",
  },
});
const t2 = await raw.task.create({
  data: {
    clubId: clubA.id,
    title: "Presión alta TEST",
    objective: "test",
    phases: ["OFFENSIVE", "OFF_TRANSITION"],
    playersMin: 4,
    durationMin: 50,
    intensity: "HIGH",
  },
});
const t3 = await raw.task.create({
  data: {
    clubId: clubA.id,
    title: "Ronda 30 jugadores TEST",
    objective: "test",
    phases: ["OFFENSIVE", "OFF_TRANSITION"],
    playersMin: 30,
    durationMin: 30,
    intensity: "LOW",
  },
});
const t4 = await raw.task.create({
  data: {
    clubId: clubA.id,
    title: "Bloque bajo TEST",
    objective: "test",
    phases: ["DEFENSIVE"],
    playersMin: 4,
    durationMin: 40,
    intensity: "MEDIUM",
  },
});

// Recetas sobre los SP de prueba (unit determinista)…
await raw.taskSubPrinciple.createMany({
  data: [
    { taskId: t1.id, subPrincipleId: spOffTest.id, relevance: 2, usageNote: "Factible y sólida" },
    { taskId: t2.id, subPrincipleId: spOffTest.id, relevance: 3, usageNote: "Núcleo pero intensa" },
    { taskId: t3.id, subPrincipleId: spOffTest.id, relevance: 2 },
    { taskId: t4.id, subPrincipleId: spDefTest.id, relevance: 3 },
  ],
});
// …y además sobre TODOS los SP reales de las fases implicadas, para que el
// pipeline E2E tenga candidatas garantizadas sea cual sea el SP que el
// diagnóstico escoja (las recetas de la seed conviven sin problema).
const spOffAll = await raw.subPrinciple.findMany({
  where: { phase: "OFF_TRANSITION", id: { notIn: [spOffTest.id] } },
});
const spDefAll = await raw.subPrinciple.findMany({
  where: { phase: "DEFENSIVE", id: { notIn: [spDefTest.id] } },
});
for (const sp of [...spOffAll, ...spDefAll]) {
  const phaseTasks = sp.phase === "OFF_TRANSITION" ? [t1, t2, t3] : [t4];
  await raw.taskSubPrinciple.createMany({
    data: phaseTasks.map((t, i) => ({
      taskId: t.id,
      subPrincipleId: sp.id,
      relevance: t.id === t4.id ? 3 : i === 0 ? 2 : 3,
    })),
    skipDuplicates: true,
  });
}

// Unit 1: orden del ranking (relevancia desc → intensidad asc → título)
const ranked = await rankTaskCandidates(dbA, spOffTest.id);
check(
  "ranking: rel3 HIGH primero, luego rel2 LOW, luego rel2 MEDIUM",
  ranked.length === 3 &&
    ranked[0].taskTitle === "Presión alta TEST" &&
    ranked[1].taskTitle === "Ronda 30 jugadores TEST" &&
    ranked[2].taskTitle === "Pase y consolida TEST",
  JSON.stringify(ranked.map((t) => t.taskTitle)),
);

// Unit 2: factibilidad — fatiga 8/10 descarta HIGH; 5 jugadores descarta min 30
const { prescriptions, discarded } = await prescribeForIssues(
  dbA,
  [
    {
      kind: "TACTICAL",
      phase: "OFF_TRANSITION",
      subPrincipleId: spOffTest.id,
      severity: 4,
      evidence: "7 pérdidas en construcción (1/3 propio) — reacción tras pérdida",
      metric: {},
    },
  ],
  { availablePlayers: 5, fatigueScore: 8 },
);
check(
  "prescripción: tras descartes, elige la factible",
  prescriptions.length === 1 && prescriptions[0].taskId === t1.id,
  JSON.stringify(prescriptions.map((p) => p.taskTitle)),
);
check("duración ajustada a la regla táctica (≤60')", prescriptions[0]?.durationMin === 45);
const d2 = discarded.find((d) => d.taskId === t2.id);
const d3 = discarded.find((d) => d.taskId === t3.id);
check("descartada HIGH por fatiga 8/10", !!d2 && /fatiga grupal 8\/10/.test(d2.reason), d2?.reason);
check(
  "descartada por jugadores insuficientes",
  !!d3 && /Necesita 30 jugadores y solo hay 5 disponibles/.test(d3.reason),
  d3?.reason,
);
check("exactamente 2 descartadas en el unit", discarded.length === 2, `got ${discarded.length}`);

// Material para el pipeline E2E: pulso (fatiga alta) + partido jugado con ingesta
const demoSeason = await raw.season.findFirstOrThrow({ where: { clubId: clubA.id } });
const testTeam = await raw.team.create({
  data: {
    clubId: clubA.id,
    seasonId: demoSeason.id,
    name: "Equipo Motor TEST",
    category: "Test",
  },
});
await raw.teamPulse.create({
  data: {
    clubId: clubA.id,
    teamId: testTeam.id,
    date: new Date(),
    moraleScore: 6,
    fatigueScore: 8,
    notes: "Test motor",
    capturedById: coach.id,
  },
});
for (let i = 0; i < 5; i++) {
  await raw.player.create({
    data: {
      clubId: clubA.id,
      teamId: testTeam.id,
      firstName: `Jugador${i}`,
      lastName: "Test",
      shirtNumber: i + 1,
      mainPosition: "CM",
      status: "AVAILABLE",
      isActive: true,
    },
  });
}
const testMatch = await raw.match.create({
  data: {
    clubId: clubA.id,
    teamId: testTeam.id,
    opponent: "Rival TEST",
    isHome: true,
    kickoffAt: addDays(mondayThisWeek, 2), // miércoles de esta semana
    status: "PLAYED",
    goalsFor: 1,
    goalsAgainst: 2,
  },
});
const testReport = await raw.matchReport.create({
  data: {
    matchId: testMatch.id,
    createdById: coach.id,
    sensation: "AMBER",
    perceivedLoad: 7,
    collectiveAttitude: 6,
    tacticalExecution: 5,
  },
});
const eventRows: Array<{ type: "BALL_LOSS" | "NEGATIVE_DUEL"; x: number; y: number }> = [];
for (let i = 0; i < 7; i++) eventRows.push({ type: "BALL_LOSS", x: 20, y: 30 + i * 5 }); // construcción
for (let i = 0; i < 6; i++) eventRows.push({ type: "NEGATIVE_DUEL", x: 60, y: 50 }); // duelos
await raw.tacticalEvent.createMany({
  data: eventRows.map((e) => ({ reportId: testReport.id, ...e })),
});

// ============================================================================
console.log("\n══ 2) Persistencia — pipeline completo con auditoría ══");
// ============================================================================
const proposal = await runWeeklyProposalPipeline(dbA, {
  clubId: clubA.id,
  teamId: testTeam.id,
  weekStart: mondayThisWeek,
});

check("pipeline crea la propuesta", proposal.created === true && !!proposal.microcycleId);
check("EngineRun persistido (WEEKLY_PROPOSAL)", !!proposal.runId);
check(
  "3 hallazgos diagnosticados (físico + 2 tácticos)",
  proposal.issuesCount === 3,
  `got ${proposal.issuesCount}`,
);
check(
  "2 prescripciones tácticas con rationale",
  proposal.prescriptions.length === 2 &&
    proposal.prescriptions.every((p) => p.rationale.startsWith("Entra por:")),
  JSON.stringify(proposal.prescriptions.map((p) => p.taskTitle)),
);
check(
  "descartadas auditadas con motivo legible",
  proposal.discarded.every((d) => d.reason.length > 5),
  JSON.stringify(proposal.discarded),
);

const mc = await raw.microcycle.findUniqueOrThrow({
  where: { id: proposal.microcycleId! },
  include: { issues: true, sessions: { include: { tasks: true } } },
});
check(
  "microciclo PROPOSED con engineVersion v0.2",
  mc.status === "PROPOSED" && mc.engineVersion === ENGINE_VERSION,
);

const md3 = mc.sessions.find((s) => s.label === "MD-3");
const md2 = mc.sessions.find((s) => s.label === "MD-2");
check(
  "MD-3 lleva 2 tareas tácticas con rationale del motor",
  md3?.tasks.length === 2 && md3.tasks.every((t) => /Entra por:/.test(t.rationale ?? "")),
  `got ${md3?.tasks.length}`,
);
check("MD-2 consolida la 2ª prescripción", md2?.tasks.length === 1);
check(
  "SessionTask con prescribedIssueId (trazabilidad hallazgo→césped) en MD-3 y MD-2",
  (md3?.tasks.every((t) => t.prescribedIssueId != null) ?? false) &&
    (md2?.tasks.every((t) => t.prescribedIssueId != null) ?? false),
);
check(
  "prescripciones auditadas llevan etiqueta de sesión",
  proposal.prescriptions.every((p) => p.sessionLabel === "MD-3" || p.sessionLabel === "MD-2"),
  JSON.stringify(proposal.prescriptions.map((p) => p.sessionLabel)),
);

const run = await raw.engineRun.findUniqueOrThrow({ where: { id: proposal.runId! } });
check(
  "EngineRun guarda issuesJson + prescriptions + discarded + durationMs",
  Array.isArray(run.issuesJson) &&
    (run.issuesJson as unknown[]).length === 3 &&
    Array.isArray(run.prescriptions) &&
    (run.prescriptions as unknown[]).length === 2 &&
    Array.isArray(run.discarded) &&
    typeof run.durationMs === "number",
);
check("EngineRun ligado al microciclo", run.microcycleId === mc.id);

// ---------- Re-prescripción al llegar evidencia nueva ----------
// Microciclo ACCEPTED de la semana siguiente: NUNCA debe tocarse
const nextWeek = addDays(mondayThisWeek, 7);
const acceptedMc = await raw.microcycle.create({
  data: {
    clubId: clubA.id,
    teamId: testTeam.id,
    weekStart: nextWeek,
    status: "ACCEPTED",
    tacticalDirectives: ["Plan aceptado — intocable"],
    acceptedById: coach.id,
    acceptedAt: new Date(),
    sessions: {
      create: {
        date: addDays(nextWeek, 2),
        label: "MD-3",
        objective: "Sesión aceptada",
        durationMin: 80,
        tasks: {
          create: { order: 1, taskId: t1.id, durationMin: 45, rationale: "Original aceptado" },
        },
      },
    },
  },
});

const refresh = await refreshProposalEvidence(dbA, {
  clubId: clubA.id,
  teamId: testTeam.id,
  kickoffAt: testMatch.kickoffAt,
});

check(
  "refresh procesa la semana del partido (PROPOSED)",
  refresh.refreshedWeeks.length === 1 && refresh.runs === 1,
  JSON.stringify(refresh),
);
const mcAfter = await raw.microcycle.findUniqueOrThrow({
  where: { id: mc.id },
  include: { sessions: { include: { tasks: true } } },
});
const md3After = mcAfter.sessions.find((s) => s.label === "MD-3")!;
check(
  "PROPOSED re-prescrito: MD-3 reemplazado con tareas frescas",
  md3After.tasks.length === 2 && md3After.tasks.every((t) => /Entra por:/.test(t.rationale ?? "")),
  `got ${md3After.tasks.length}`,
);
check("prescribedIssueId re-enlazado tras re-prescripción", md3After.tasks.every((t) => t.prescribedIssueId != null));
const refreshRuns = await raw.engineRun.findMany({
  where: { teamId: testTeam.id, trigger: "EVIDENCE_REFRESH" },
});
check("EngineRun EVIDENCE_REFRESH persistido", refreshRuns.length === 1);

const acceptedAfter = await raw.microcycle.findUniqueOrThrow({
  where: { id: acceptedMc.id },
  include: { sessions: { include: { tasks: true } } },
});
check(
  "plan ACCEPTED intacto (ni directrices ni tareas tocadas)",
  acceptedAfter.tacticalDirectives[0] === "Plan aceptado — intocable" &&
    acceptedAfter.sessions[0].tasks[0].rationale === "Original aceptado",
);

// ============================================================================
console.log("\n══ 3) Regeneración del equipo demo con el motor v0.2 ══");
// ============================================================================
const demoTeam = await raw.team.findFirstOrThrow({
  where: { clubId: clubA.id, name: { not: "Equipo Motor TEST" } },
});
const demoWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
const oldDemo = await raw.microcycle.findUnique({
  where: { teamId_weekStart: { teamId: demoTeam.id, weekStart: demoWeek } },
});
// La propuesta PROPOSED es regenerable por diseño (así trabaja el motor real)
if (oldDemo && oldDemo.status === "PROPOSED") {
  await raw.microcycle.delete({ where: { id: oldDemo.id } });
}
const demoRun = await runWeeklyProposalPipeline(dbA, {
  clubId: clubA.id,
  teamId: demoTeam.id,
  weekStart: demoWeek,
});
check("equipo demo re-cocinado con motor v0.2", demoRun.created && demoRun.runId != null);
check(
  "equipo demo con auditoría completa",
  demoRun.prescriptions.length > 0 || demoRun.issuesCount > 0,
  `rx=${demoRun.prescriptions.length} issues=${demoRun.issuesCount}`,
);

// ============================================================================
console.log("\n══ 4) HTTP — transparencia del motor en /dashboard/today ══");
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
  const res = await fetch(`${BASE}/dashboard/today`, { headers: { cookie: session } });
  const html = await res.text();
  check("GET /dashboard/today 200", res.status === 200);
  check("muestra 'Por qué este plan' (transparencia)", html.includes("Por qué este plan"));
  check("muestra versión del motor v0.2", html.includes(ENGINE_VERSION));
  check("muestra candidatas descartadas", html.includes("evaluadas y descartadas"));
  check("muestra botón Aceptar Plan", html.includes("Aceptar Plan"));
}

// ============================================================================
console.log("\n══ 🧹 Limpieza del material de prueba ══");
// ============================================================================
await purgeTestData();
console.log("  material sintético eliminado (equipo, microciclos, runs, tareas, recetas, SPs)");

await raw.$disconnect();

console.log(
  `\n${failures === 0 ? "🎉 TODO OK — Pilar 4 validado (motor prescriptivo + auditoría + transparencia)" : `💥 ${failures} fallos`}`,
);
process.exit(failures === 0 ? 0 : 1);
