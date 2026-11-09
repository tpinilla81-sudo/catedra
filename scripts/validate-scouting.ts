// ============================================================================
// VALIDACIÓN E2E — P4.1 SCOUTING DEL RIVAL
// ----------------------------------------------------------------------------
// Certifica la integración completa del scouting como insumo del motor:
//   1. TENANT GUARD: OpponentReport (CLUB_SCOPED) + hijos RELATION_SCOPED —
//      inyección de clubId, lecturas/escrituras cross-club bloqueadas,
//      FK opponentReportId validada en escrituras (directas y anidadas).
//   2. UNICIDAD: un informe por (teamId, weekStart) + matchId único (P2002).
//   3. MOTOR: cada debilidad del informe entra como hallazgo TACTICAL con
//      metric.source = OPPONENT_SCOUTING — orden determinista (severity desc
//      → id asc), clamp 1-5, fase y subprincipio propagados, directrices
//      "Explotar: ..." (no "Corregir:"), prescripción MD-3/MD-2 enlazada,
//      EngineRun con opponentIntegrated + snapshot del rival.
//   4. RE-PRESCRIPCIÓN: el scouting SOBREVIVE el refresh (los hallazgos se
//      regeneran desde buildIssueDrafts, nunca creados al margen) y el caso
//      sin rival mantiene el fallback de consolidación intacto.
// Panel: escribe pilar6.json → bloque "Scouting P4.1" en /dashboard/quality.
// Idempotente: purga clubes-probe anteriores (slug zzz-p41-*) al empezar.
// Ejecutar: bun scripts/validate-scouting.ts  (dev server :3000, PG :5432)
// ============================================================================
import { Prisma, PrismaClient } from "@prisma/client";
import { addDays } from "date-fns";
import { randomUUID } from "node:crypto";
import { createTenantClient } from "../src/lib/tenant";
import { writeResults } from "./validation-output";
import { mondayOf } from "../src/lib/utils/dates";
import { runWeeklyProposalPipeline, refreshProposalEvidence } from "../src/lib/engine/pipeline";

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
await raw.club.deleteMany({ where: { slug: { startsWith: "zzz-p41-" } } });
console.log("  sin restos previos — arranque limpio");

const TAG = randomUUID().slice(0, 8);
const weekStart = mondayOf(new Date());

// ============================================================================
console.log("\n══ 1) Tenant Guard — scouting aislado por Club (informe + hijos) ══");
// ============================================================================
const clubX = await raw.club.create({ data: { name: "P41 Scout X", slug: `zzz-p41-x-${TAG}` } });
const seasonX = await raw.season.create({
  data: { clubId: clubX.id, name: "2026/27", startDate: new Date(), endDate: new Date() },
});
const teamX = await raw.team.create({
  data: { clubId: clubX.id, seasonId: seasonX.id, name: "Equipo X P41" },
});
const matchX = await raw.match.create({
  data: {
    clubId: clubX.id,
    teamId: teamX.id,
    opponent: "CD Rivalicio",
    kickoffAt: addDays(weekStart, 6),
    status: "SCHEDULED",
  },
});

const clubY = await raw.club.create({ data: { name: "P41 Intruso Y", slug: `zzz-p41-y-${TAG}` } });
const seasonY = await raw.season.create({
  data: { clubId: clubY.id, name: "2026/27", startDate: new Date(), endDate: new Date() },
});
const teamY = await raw.team.create({
  data: { clubId: clubY.id, seasonId: seasonY.id, name: "Equipo Y P41" },
});
const matchY = await raw.match.create({
  data: {
    clubId: clubY.id,
    teamId: teamY.id,
    opponent: "Union Ajena",
    kickoffAt: addDays(weekStart, 6),
    status: "SCHEDULED",
  },
});

const tenantX = createTenantClient(clubX.id) as unknown as PrismaClient;
const tenantY = createTenantClient(clubY.id) as unknown as PrismaClient;

// G1 — create SIN clubId → el guard lo inyecta (undefined tipado: la API de
// Prisma exige clubId en el input, el guard exige NO confiar en el caller);
// hijos anidados creados en la misma escritura
const reportX = await tenantX.opponentReport.create({
  data: {
    clubId: undefined as unknown as string,
    teamId: teamX.id,
    matchId: matchX.id,
    opponentName: "CD Rivalicio",
    weekStart,
    buildUpType: "Salida lavolpiana, corta en corto",
    defensiveBlock: "Bloque medio-bajo en 4-4-2",
    weaknesses: {
      create: [
        { phase: "OFF_TRANSITION", description: "espacio a la espalda del lateral", severity: 5 },
        { phase: "DEFENSIVE", description: "duelo aéreo perdido en área propia", severity: 9 },
        { phase: "SET_PIECE", description: "saque de banda lento", severity: 3 },
      ],
    },
    scoutingEvents: {
      create: [
        { zone: "banda derecha", behavior: "presión tras pérdida" },
        { zone: "3/4 propio", behavior: "centros rasos sin rematador" },
      ],
    },
  },
});
check(
  "G1 create sin clubId → clubId del tenant INYECTADO (+ hijos anidados)",
  reportX.clubId === clubX.id && reportX.matchId === matchX.id,
  reportX.clubId,
);

// G2 — create con clubId AJENO → rechazado en seco
let g2 = false;
try {
  await tenantX.opponentReport.create({
    data: {
      clubId: clubY.id,
      teamId: teamX.id,
      opponentName: "Hack",
      weekStart: addDays(weekStart, 14),
      buildUpType: "x",
      defensiveBlock: "x",
    },
  });
} catch (e) {
  g2 = e instanceof Error && e.message.includes("cross-tenant");
}
check("G2 create con clubId de OTRO club → BLOQUEADO", g2);

// G3 — lectura por clave compuesta desde OTRO club → invisible
const crossRead = await tenantY.opponentReport.findUnique({
  where: { teamId_weekStart: { teamId: teamX.id, weekStart } },
});
check("G3 findUnique (teamId, weekStart) desde otro club → null", crossRead === null);

// G4 — listado desde OTRO club → 0 filas
const crossList = await tenantY.opponentReport.findMany({ where: { opponentName: "CD Rivalicio" } });
check("G4 findMany desde otro club → 0 filas", crossList.length === 0, String(crossList.length));

// G5 — update desde OTRO club → 0 filas tocadas
const crossUpdate = await tenantY.opponentReport.updateMany({
  where: { id: reportX.id },
  data: { defensiveBlock: "hackeado" },
});
check("G5 updateMany cross-club → count 0", crossUpdate.count === 0, String(crossUpdate.count));

// G6 — delete desde OTRO club → 0 filas borradas
const crossDelete = await tenantY.opponentReport.deleteMany({ where: { id: reportX.id } });
check("G6 deleteMany cross-club → count 0", crossDelete.count === 0, String(crossDelete.count));

// G7 — FK opponentReportId contra informe AJENO → escritura bloqueada
let g7 = false;
try {
  await tenantY.opponentWeakness.create({
    data: { opponentReportId: reportX.id, phase: "OFFENSIVE", description: "inyección", severity: 5 },
  });
} catch (e) {
  g7 = e instanceof Error && e.message.includes("cross-tenant");
}
check("G7 weakness con opponentReportId AJENO → BLOQUEADO (FK cross-tenant)", g7);

// G8 — connect al match de OTRO club → escritura bloqueada (estilo checked:
// relaciones anidadas para team/club propias + match ajeno)
let g8 = false;
try {
  await tenantY.opponentReport.create({
    data: {
      club: { connect: { id: clubY.id } },
      team: { connect: { id: teamY.id } },
      opponentName: "Rival Intruso",
      weekStart: addDays(weekStart, 21),
      buildUpType: "x",
      defensiveBlock: "x",
      match: { connect: { id: matchX.id } },
    },
  });
} catch (e) {
  g8 = e instanceof Error && e.message.includes("cross-tenant");
}
check("G8 match CONNECT ajeno → BLOQUEADO (FK cross-tenant)", g8);

// G9 — hijos invisibles desde otro club (RELATION_SCOPED por padre)
const crossChildren = await tenantY.opponentWeakness.findMany({
  where: { opponentReportId: reportX.id },
});
check("G9 weaknesses del informe ajeno → 0 filas", crossChildren.length === 0, String(crossChildren.length));

// G10 — control positivo: el dueño SÍ ve sus hijos
const ownChildren = await tenantX.opponentWeakness.findMany({
  where: { opponentReportId: reportX.id },
});
check(
  "G10 control positivo: el dueño ve sus 3 weaknesses",
  ownChildren.length === 3,
  String(ownChildren.length),
);

// ============================================================================
console.log("\n══ 2) Unicidades — un informe por semana · matchId único ══");
// ============================================================================
let u1 = false;
try {
  await raw.opponentReport.create({
    data: {
      clubId: clubX.id,
      teamId: teamX.id,
      opponentName: "Duplicado",
      weekStart,
      buildUpType: "x",
      defensiveBlock: "x",
    },
  });
} catch (e) {
  u1 = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
check("U1 duplicar (teamId, weekStart) → P2002", u1);

let u2 = false;
try {
  await raw.opponentReport.create({
    data: {
      clubId: clubX.id,
      teamId: teamX.id,
      opponentName: "Duplicado",
      weekStart: addDays(weekStart, 7),
      matchId: matchX.id,
      buildUpType: "x",
      defensiveBlock: "x",
    },
  });
} catch (e) {
  u2 = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
check("U2 duplicar matchId (único) → P2002", u2);

// ============================================================================
console.log("\n══ 3) Motor — debilidades → hallazgos → prescripción (determinista) ══");
// ============================================================================
// Biblioteca determinista del club de prueba: subprincipios retro-fechados a
// 2020 → findFirst({ phase }) los elige SIEMPRE (ganan a la Cátedra global),
// con tareas conectadas por receta relevance 3.
const spOffTr = await raw.subPrinciple.create({
  data: { clubId: clubX.id, phase: "OFF_TRANSITION", name: "SP P41 OFF_TRANSITION", createdAt: new Date("2020-01-01") },
});
const spDef = await raw.subPrinciple.create({
  data: { clubId: clubX.id, phase: "DEFENSIVE", name: "SP P41 DEFENSIVE", createdAt: new Date("2020-01-01") },
});
const spSet = await raw.subPrinciple.create({
  data: { clubId: clubX.id, phase: "SET_PIECE", name: "SP P41 SET_PIECE", createdAt: new Date("2020-01-01") },
});
const taskOffTr = await raw.task.create({
  data: { clubId: clubX.id, title: "Ataque directo al hueco P41 TEST", objective: "test P4.1", phases: ["OFF_TRANSITION"], playersMin: 4, durationMin: 45, intensity: "LOW" },
});
const taskDef = await raw.task.create({
  data: { clubId: clubX.id, title: "Duelos y coberturas P41 TEST", objective: "test P4.1", phases: ["DEFENSIVE"], playersMin: 4, durationMin: 45, intensity: "LOW" },
});
const taskSet = await raw.task.create({
  data: { clubId: clubX.id, title: "ABP ofensivas rápidas P41 TEST", objective: "test P4.1", phases: ["SET_PIECE"], playersMin: 4, durationMin: 45, intensity: "LOW" },
});
await raw.taskSubPrinciple.create({ data: { taskId: taskOffTr.id, subPrincipleId: spOffTr.id, relevance: 3 } });
await raw.taskSubPrinciple.create({ data: { taskId: taskDef.id, subPrincipleId: spDef.id, relevance: 3 } });
await raw.taskSubPrinciple.create({ data: { taskId: taskSet.id, subPrincipleId: spSet.id, relevance: 3 } });

// Plantilla disponible: 6 jugadores (factibilidad de las tareas de test)
for (let i = 0; i < 6; i++) {
  await raw.player.create({
    data: {
      clubId: clubX.id,
      teamId: teamX.id,
      firstName: `J${i}`,
      lastName: "P41",
      shirtNumber: i + 1,
      primaryPosition: "CM",
      status: "AVAILABLE",
      isActive: true,
    },
  });
}

const proposal = await runWeeklyProposalPipeline(tenantX, {
  clubId: clubX.id,
  teamId: teamX.id,
  weekStart,
});
check("E1 pipeline con scouting → propuesta creada", proposal.created === true, JSON.stringify({ issues: proposal.issuesCount }));
check("E2 exactamente 3 hallazgos (sin pulso ni partido: SOLO scouting)", proposal.issuesCount === 3, String(proposal.issuesCount));

const mcId = proposal.microcycleId!;
const issues = await raw.diagnosisIssue.findMany({
  where: { microcycleId: mcId },
  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
});
const scoutingIssues = issues.filter(
  (i) => (i.metric as { source?: string } | null)?.source === "OPPONENT_SCOUTING",
);
check(
  "E3 los 3 issues son TACTICAL con metric.source = OPPONENT_SCOUTING",
  issues.length === 3 && scoutingIssues.length === 3 && scoutingIssues.every((i) => i.kind === "TACTICAL"),
  JSON.stringify(issues.map((i) => [i.kind, (i.metric as { source?: string } | null)?.source])),
);
check(
  "E4 orden determinista por severidad REPORTADA (9→primero) y clamp 1-5 → [5,5,3]",
  JSON.stringify(issues.map((i) => i.severity)) === JSON.stringify([5, 5, 3]),
  JSON.stringify(issues.map((i) => i.severity)),
);
check(
  "E5 fases propagadas en orden [DEFENSIVE, OFF_TRANSITION, SET_PIECE]",
  JSON.stringify(issues.map((i) => i.phase)) === JSON.stringify(["DEFENSIVE", "OFF_TRANSITION", "SET_PIECE"]),
  JSON.stringify(issues.map((i) => i.phase)),
);
check(
  "E6 subprincipio determinista de CADA fase (receta de la biblioteca)",
  issues[0].subPrincipleId === spDef.id &&
    issues[1].subPrincipleId === spOffTr.id &&
    issues[2].subPrincipleId === spSet.id,
  JSON.stringify(issues.map((i) => i.subPrincipleId)),
);
check(
  "E7 evidencia legible con el rival + metric completa (comportamientos=2, matchId)",
  issues.every((i) => i.evidence.startsWith("Rival CD Rivalicio: ")) &&
    issues.every((i) => (i.metric as { comportamientos?: number }).comportamientos === 2) &&
    issues.every((i) => (i.metric as { matchId?: string | null }).matchId === matchX.id),
  JSON.stringify(issues.map((i) => i.evidence)),
);

const mc = await raw.microcycle.findUniqueOrThrow({
  where: { id: mcId },
  include: { sessions: { include: { tasks: true } } },
});
check(
  "E8 directrices 'Explotar: Rival ...' (3/3, cero 'Corregir:')",
  mc.tacticalDirectives.length === 3 &&
    mc.tacticalDirectives.every((d) => d.startsWith("Explotar: Rival CD Rivalicio:")),
  JSON.stringify(mc.tacticalDirectives),
);
check("E9 cero pantallas en blanco: 4 sesiones (MD+1/MD-3/MD-2/MD-1)", mc.sessions.length === 4, String(mc.sessions.length));

const md3 = mc.sessions.find((s) => s.label === "MD-3")!;
const md2 = mc.sessions.find((s) => s.label === "MD-2")!;
const issueIds = new Set(issues.map((i) => i.id));
check(
  "E10 MD-3 con 2 tareas y MD-2 con 1, TODAS enlazadas a hallazgos de scouting",
  md3.tasks.length === 2 &&
    md2.tasks.length === 1 &&
    [...md3.tasks, ...md2.tasks].every((t) => t.prescribedIssueId != null && issueIds.has(t.prescribedIssueId)),
  JSON.stringify([md3.tasks.length, md2.tasks.length]),
);
check(
  "E11 rationale del motor rastrea la evidencia del rival",
  [...md3.tasks, ...md2.tasks].every((t) => (t.rationale ?? "").includes("Entra por: Rival CD Rivalicio:")),
  JSON.stringify([...md3.tasks, ...md2.tasks].map((t) => t.rationale?.slice(0, 40))),
);

const runRow = await raw.engineRun.findUniqueOrThrow({ where: { id: proposal.runId! } });
const snap = runRow.inputSnapshot as {
  opponent: { name: string; weaknesses: number; events: number } | null;
  opponentIntegrated: boolean;
};
check(
  "E12 EngineRun: opponentIntegrated true + snapshot del rival (3 debilidades, 2 eventos)",
  snap.opponentIntegrated === true &&
    snap.opponent?.name === "CD Rivalicio" &&
    snap.opponent?.weaknesses === 3 &&
    snap.opponent?.events === 2,
  JSON.stringify(snap),
);

const rerun = await runWeeklyProposalPipeline(tenantX, {
  clubId: clubX.id,
  teamId: teamX.id,
  weekStart,
});
check("E13 idempotencia: re-ejecutar la misma semana → created:false", rerun.created === false, String(rerun.created));

// --- Re-prescripción en vivo: el scouting SOBREVIVE (creado desde drafts, no al margen)
const refresh = await refreshProposalEvidence(tenantX, {
  clubId: clubX.id,
  teamId: teamX.id,
  kickoffAt: addDays(weekStart, 3),
});
check(
  "E14 refresh de la semana PROPOSED → 1 run, semana tocada",
  refresh.runs === 1 && refresh.refreshedWeeks.includes(weekStart.toISOString().slice(0, 10)),
  JSON.stringify(refresh),
);
const issuesAfter = await raw.diagnosisIssue.findMany({
  where: { microcycleId: mcId },
  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
});
const scoutingAfter = issuesAfter.filter(
  (i) => (i.metric as { source?: string } | null)?.source === "OPPONENT_SCOUTING",
);
check(
  "E15 el scouting SOBREVIVE la re-prescripción (3 hallazgos regenerados, mismo orden)",
  issuesAfter.length === 3 &&
    scoutingAfter.length === 3 &&
    JSON.stringify(issuesAfter.map((i) => i.evidence)) === JSON.stringify(issues.map((i) => i.evidence)),
  JSON.stringify(issuesAfter.map((i) => i.evidence)),
);
const mcAfter = await raw.microcycle.findUniqueOrThrow({
  where: { id: mcId },
  include: { sessions: { include: { tasks: true } } },
});
const md3After = mcAfter.sessions.find((s) => s.label === "MD-3")!;
const freshIds = new Set(issuesAfter.map((i) => i.id));
check(
  "E16 MD-3 re-prescrito con trazabilidad FRESCA (prescribedIssueId de los nuevos issues)",
  md3After.tasks.length === 2 &&
    md3After.tasks.every((t) => t.prescribedIssueId != null && freshIds.has(t.prescribedIssueId)),
  JSON.stringify(md3After.tasks.map((t) => t.prescribedIssueId)),
);
check(
  "E17 directrices tras el refresh siguen siendo 'Explotar:'",
  mcAfter.tacticalDirectives.every((d) => d.startsWith("Explotar: Rival CD Rivalicio:")),
  JSON.stringify(mcAfter.tacticalDirectives),
);

// --- Equipo SIN informe: el fallback de consolidación queda intacto
const teamN = await raw.team.create({
  data: { clubId: clubX.id, seasonId: seasonX.id, name: "Equipo Sin Rival P41" },
});
const noOpp = await runWeeklyProposalPipeline(tenantX, {
  clubId: clubX.id,
  teamId: teamN.id,
  weekStart,
});
const runN = await raw.engineRun.findUniqueOrThrow({ where: { id: noOpp.runId! } });
const snapN = runN.inputSnapshot as { opponent: unknown; opponentIntegrated: boolean };
const issuesN = await raw.diagnosisIssue.findMany({ where: { microcycleId: noOpp.microcycleId! } });
check(
  "E18 sin informe de rival → consolidación (1 hallazgo, opponentIntegrated false)",
  noOpp.created === true &&
    noOpp.issuesCount === 1 &&
    snapN.opponent === null &&
    snapN.opponentIntegrated === false &&
    issuesN.every((i) => (i.metric as { source?: string } | null)?.source == null),
  JSON.stringify({ issues: noOpp.issuesCount, snap: snapN }),
);

// ============================================================================
console.log("\n══ 4) HTTP — panel de control integra el bloque Scouting P4.1 ══");
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
  check("panel de control integra el bloque Scouting P4.1", htmlQ.includes("Scouting P4.1"));
}

// ============================================================================
console.log("\n══ 🧹 Limpieza del material de prueba ══");
// ============================================================================
await raw.club.deleteMany({ where: { id: { in: [clubX.id, clubY.id] } } });
console.log("  clubes-probe P41 eliminados (cascada completa: informes, hijos, motor)");

await raw.$disconnect();

await writeResults(6, "P4.1 Scouting del rival — guard multi-tenant + motor + re-prescripción", total, failures, t0, checkLog);

console.log(
  `\n${failures === 0 ? "🎉 TODO OK — P4.1 Scouting validado (guard + unicidad + motor + re-prescripción)" : `💥 ${failures} fallos`}`,
);
process.exit(failures === 0 ? 0 : 1);
