// ============================================================================
// VALIDACIÓN E2E — PILAR 3 (Ingesta Post-Partido Exprés < 3 min)
// ----------------------------------------------------------------------------
// Mismo estándar de robustez que validate-pilar4.ts:
// 1) Unit: heurísticas de diagnóstico (diagnose.ts REAL) — fatiga/ánimo del
//    pulso, pérdidas en 1/3 propio (zonas), duelos perdidos, consolidación.
// 2) Persistencia: flujo completo de 3 pasos con el núcleo REAL
//    (runMatchIngest de src/lib/match-ingest): estado del partido (marcador +
//    semáforo + sliders saneados), pizarra táctica (coordenadas 0-100 clamp,
//    tipos válidos, minuto 0-130, jugador inválido → null) y cuaderno de
//    notas (una por jugador, flag válido, nota ≤ 140). Re-ingesta idempotente.
//    Hook del motor: racha en el Pulso + re-prescripción del PROPOSED con
//    DiagnosisIssue desde la evidencia de la pizarra.
// 3) Aislamiento multi-tenant: MatchReport/TacticalEvent/PlayerMatchNote por
//    relación (match.clubId), ingesta de partido ajeno bloqueada (cross-club
//    y cross-equipo) y /dashboard/match?g= ajeno → 404 en HTTP.
// 4) HTTP: /dashboard/matches y /dashboard/match?g= con datos reales ingesta.
// Idempotente: limpia restos de ejecuciones interrumpidas antes de empezar.
// Ejecutar: bun scripts/validate-pilar3.ts  (dev server en :3000, PG en :5432)
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { addDays } from "date-fns";
import { createTenantClient } from "../src/lib/tenant";
import { runMatchIngest, type SubmitPayload } from "../src/lib/match-ingest";
import {
  buildIssueDrafts,
  mondayOf,
  type EngineInputs,
} from "../src/lib/engine/diagnose";
import { writeResults } from "./validation-output";

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

// ---------- Contexto ----------
const clubA = await raw.club.findUniqueOrThrow({ where: { slug: "cf-metodo" } });
const coach = await raw.user.findUniqueOrThrow({ where: { email: "mister@cfmetodo.es" } });
const dbA = createTenantClient(clubA.id) as any;
const mondayThisWeek = mondayOf(new Date()); // lunes-Madrid canónico (re-exportado por diagnose)

// ============================================================================
console.log("\n══ 0) Limpieza de restos de ejecuciones interrumpidas ══");
// ============================================================================
async function purgeTestData() {
  for (const name of ["Equipo Ingesta TEST", "Equipo Vecino TEST"]) {
    const leftoverTeams = await raw.team.findMany({
      where: { clubId: clubA.id, name },
    });
    for (const lt of leftoverTeams) {
      await raw.engineRun.deleteMany({ where: { teamId: lt.id } });
      await raw.microcycle.deleteMany({ where: { teamId: lt.id } });
      await raw.match.deleteMany({ where: { teamId: lt.id } }); // cascada report+eventos+notas
      await raw.teamPulse.deleteMany({ where: { teamId: lt.id } });
      await raw.player.deleteMany({ where: { teamId: lt.id } });
      await raw.team.delete({ where: { id: lt.id } });
    }
  }
  const intruder = await raw.club.findUnique({ where: { slug: "zz-intruso-p3" } });
  if (intruder) await raw.club.delete({ where: { id: intruder.id } }); // cascada total
}
await purgeTestData();
console.log("  sin restos previos — arranque limpio");

// ============================================================================
console.log("\n══ 1) Unit — heurísticas de diagnóstico (código real) ══");
// ============================================================================

// Lunes ISO (fuente de verdad del calendario semanal)
const aSunday = new Date("2026-11-08T15:00:00.000Z"); // domingo
check(
  "mondayOf: domingo → lunes de su semana ISO",
  mondayOf(aSunday).getUTCDay() === 1 && mondayOf(aSunday).getTime() < aSunday.getTime(),
);

// Inputs sintéticos (el formato exacto que collectInputs produce en producción)
const healthyPulse = { moraleScore: 6, fatigueScore: 5 } as any;
const matchWithEvents = (events: Array<{ type: string; x: number }>): EngineInputs["matches"] =>
  [
    {
      id: "m1",
      report: { events },
    },
  ] as any;

// Fatiga alta → hallazgo FÍSICO
const dFatigue = await buildIssueDrafts(dbA, "t", {
  pulse: { moraleScore: 6, fatigueScore: 9 } as any,
  matches: [],
});
check(
  "fatiga 9/10 → hallazgo FÍSICO severidad 4",
  dFatigue.length === 1 && dFatigue[0].kind === "PHYSICAL" && dFatigue[0].severity === 4,
  JSON.stringify(dFatigue),
);

// Ánimo bajo → hallazgo ANÍMICO
const dMorale = await buildIssueDrafts(dbA, "t", {
  pulse: { moraleScore: 2, fatigueScore: 4 } as any,
  matches: [],
});
check(
  "ánimo 2/10 → hallazgo ANÍMICO (éxito temprano)",
  dMorale.some((d) => d.kind === "MORALE" && /Inercia anímica baja \(2\/10\)/.test(d.evidence)),
  JSON.stringify(dMorale),
);

// Zonas: ≥6 pérdidas en el 1/3 propio (x ≤ 35) → transición ofensiva
const dBuildUp = await buildIssueDrafts(dbA, "t", {
  pulse: healthyPulse,
  matches: matchWithEvents([
    ...Array.from({ length: 7 }, () => ({ type: "BALL_LOSS", x: 20 })),
    { type: "BALL_LOSS", x: 80 }, // en campo rival: NO cuenta
    { type: "BALL_RECOVERY", x: 50 },
  ]),
});
const buildUp = dBuildUp.find((d) => d.kind === "TACTICAL" && d.phase === "OFF_TRANSITION");
check(
  "7 pérdidas en 1/3 propio → táctico OFF_TRANSITION con subprincipio",
  !!buildUp && /7 pérdidas en construcción \(1\/3 propio\)/.test(buildUp.evidence) && !!buildUp.subPrincipleId,
  JSON.stringify(dBuildUp),
);
check("severidad escala con el volumen: 7 pérdidas → severidad 3", buildUp?.severity === 3, `got ${buildUp?.severity}`);

// Duelos: ≥6 duelos perdidos → intensidad defensiva
const dDuels = await buildIssueDrafts(dbA, "t", {
  pulse: healthyPulse,
  matches: matchWithEvents([
    ...Array.from({ length: 6 }, () => ({ type: "NEGATIVE_DUEL", x: 60 })),
    { type: "POSITIVE_DUEL", x: 60 },
  ]),
});
const duels = dDuels.find((d) => d.kind === "TACTICAL" && d.phase === "DEFENSIVE");
check(
  "6 duelos perdidos → táctico DEFENSIVE",
  !!duels && /6 duelos perdidos/.test(duels.evidence) && !!duels.subPrincipleId,
  JSON.stringify(dDuels),
);

// Umbral NO alcanzado (5 pérdidas) + pulso sano → consolidación (cero pantallas en blanco)
const dCalm = await buildIssueDrafts(dbA, "t", {
  pulse: healthyPulse,
  matches: matchWithEvents(Array.from({ length: 5 }, () => ({ type: "BALL_LOSS", x: 20 }))),
});
check(
  "5 pérdidas (umbral 6) con pulso sano → consolidación ofensiva",
  dCalm.length === 1 && dCalm[0].kind === "TACTICAL" && dCalm[0].phase === "OFFENSIVE" && /Sin señales de alarma/.test(dCalm[0].evidence),
  JSON.stringify(dCalm),
);

// ============================================================================
console.log("\n══ 2) Persistencia — flujo REAL de 3 pasos + hook del motor ══");
// ============================================================================
const demoSeason = await raw.season.findFirstOrThrow({ where: { clubId: clubA.id } });
const testTeam = await raw.team.create({
  data: { clubId: clubA.id, seasonId: demoSeason.id, name: "Equipo Ingesta TEST", category: "Test" },
});

// Plantilla sintética: 5 disponibles + 1 lesionado (la factibilidad del motor cuenta disponibles)
const rosterIds: string[] = [];
const positions = ["GK", "CB", "CB", "CM", "LW"] as const;
for (let i = 0; i < 5; i++) {
  const p = await dbA.player.create({
    data: { teamId: testTeam.id, firstName: `Titular${i}`, lastName: "Test", shirtNumber: i + 1, mainPosition: positions[i], isActive: true },
  });
  rosterIds.push(p.id);
}
const injured = await dbA.player.create({
  data: { teamId: testTeam.id, firstName: "Lesionado", lastName: "Test", shirtNumber: 6, mainPosition: "CM", status: "INJURED", isActive: true },
});

// Partido programado (ingesta pendiente): miércoles de esta semana
const testMatch = await raw.match.create({
  data: {
    clubId: clubA.id,
    teamId: testTeam.id,
    opponent: "Rival Ingesta",
    competition: "Liga TEST",
    isHome: true,
    kickoffAt: addDays(mondayThisWeek, 2),
    status: "SCHEDULED",
  },
});

// Pulso del lunes ya capturado (el hook actualiza SU racha) + propuesta PROPOSED vacía
const mondayPulse = await dbA.teamPulse.create({
  data: { clubId: clubA.id, teamId: testTeam.id, date: mondayThisWeek, moraleScore: 6, fatigueScore: 5, capturedById: coach.id },
});
const proposedMc = await raw.microcycle.create({
  data: {
    clubId: clubA.id,
    teamId: testTeam.id,
    weekStart: mondayThisWeek,
    status: "PROPOSED",
    tacticalDirectives: ["Propuesta inicial"],
    engineVersion: "seed",
  },
});

// ---------- Paso 1+2+3 en un payload: ingesta completa ----------
const longNotes = "x".repeat(600);
const longNote = "y".repeat(180);

const payload: SubmitPayload = {
  gameId: testMatch.id,
  goalsFor: 2,
  goalsAgainst: 1,
  sensation: "GREEN",
  perceivedLoad: 99,     // → clamp 10
  collectiveAttitude: -3, // → clamp 1
  tacticalExecution: 7.5, // → round 8
  notes: longNotes,       // → 500 chars
  events: [
    // 8 pérdidas en construcción (1/3 propio) → hallazgo táctico
    ...Array.from({ length: 8 }, (_, i) => ({ type: "BALL_LOSS", x: 25, y: 20 + i * 5, playerId: rosterIds[i % 5], minute: 10 + i })),
    // 2 pérdidas en campo rival (no alimentan el hallazgo de construcción)
    { type: "BALL_LOSS", x: 75, y: 50 },
    { type: "BALL_LOSS", x: 90, y: 30 },
    // 6 duelos perdidos → hallazgo defensivo
    ...Array.from({ length: 6 }, () => ({ type: "NEGATIVE_DUEL", x: 60, y: 50, playerId: rosterIds[1] })),
    // 3 recuperaciones positivas
    { type: "BALL_RECOVERY", x: 45, y: 60, minute: 55 },
    { type: "BALL_RECOVERY", x: 50, y: 40, minute: 70 },
    { type: "BALL_RECOVERY", x: 55, y: 45, minute: 80 },
    // Saneado: tipo inválido se descarta
    { type: "HACK_EVENT", x: 50, y: 50 } as any,
    // Saneado: jugador del intruso → null (evento colectivo)
    { type: "POSITIVE_DUEL", x: 30, y: 30, playerId: "zz-usuario-intruso" },
    // Saneado: coordenadas/minuto fuera de rango → clamp
    { type: "ATTEMPTED_SHOT", x: -5, y: 150, minute: 999 },
  ],
  playerNotes: [
    { playerId: rosterIds[0], flag: "GREEN", note: "Gran partido" },
    { playerId: rosterIds[1], flag: "AMBER", note: longNote },
    { playerId: "zz-usuario-intruso", flag: "GREEN" },   // jugador inválido → filtrado
    { playerId: injured.id, flag: "PURPURA" },            // flag inválido → filtrado
  ],
};

const result1 = await runMatchIngest(dbA, { user: coach, team: testTeam }, payload);
check("ingesta completa → ok:true con reportId", result1.ok === true, JSON.stringify(result1));
if (!result1.ok) throw new Error("La ingesta falló: " + result1.error);
check("eventos saneados: 21 guardados de 22 enviados", result1.eventsSaved === 21, `got ${result1.eventsSaved}`);
check("notas saneadas: 2 guardadas de 4 enviadas", result1.notesSaved === 2, `got ${result1.notesSaved}`);

// ---------- Paso 1 persistido: estado del partido ----------
const matchAfter = await raw.match.findUniqueOrThrow({ where: { id: testMatch.id } });
check("partido → ANALYZED con marcador 2-1", matchAfter.status === "ANALYZED" && matchAfter.goalsFor === 2 && matchAfter.goalsAgainst === 1);

const report = await raw.matchReport.findUniqueOrThrow({ where: { matchId: testMatch.id } });
check(
  "semáforo GREEN + sliders saneados (99→10, -3→1, 7.5→8)",
  report.sensation === "GREEN" && report.perceivedLoad === 10 && report.collectiveAttitude === 1 && report.tacticalExecution === 8,
  JSON.stringify({ s: report.sensation, pl: report.perceivedLoad, ca: report.collectiveAttitude, te: report.tacticalExecution }),
);
check("notas del reporte truncadas a 500", report.notes?.length === 500, `got ${report.notes?.length}`);

// ---------- Paso 2 persistido: pizarra (coordenadas, tipos, zonas) ----------
const events = await raw.tacticalEvent.findMany({ where: { reportId: report.id } });
check("21 eventos en la pizarra (22 enviados − 1 tipo inválido)", events.length === 21, `got ${events.length}`); // 21 - 1 con tipo inválido
const shot = events.find((e) => e.type === "ATTEMPTED_SHOT");
check("coordenadas clamp 0-100 y minuto ≤130 (remate saneado)", shot?.x === 0 && shot?.y === 100 && shot?.minute === 130, JSON.stringify(shot));
const lossInBuild = events.filter((e) => e.type === "BALL_LOSS" && e.x <= 35).length;
check("zona 1/3 propio: 8 pérdidas registradas en construcción", lossInBuild === 8, `got ${lossInBuild}`);
const orphanEvent = events.find((e) => e.type === "POSITIVE_DUEL" && e.x === 30);
check("evento con jugador ajeno → playerId null (colectivo)", orphanEvent?.playerId === null);
const withPlayer = events.filter((e) => e.playerId === rosterIds[0]).length;
check("eventos firmados por el jugador correcto", withPlayer === 2, `got ${withPlayer}`); // 8 pérdidas rotan por 5 titulares → T0 firma 2

// ---------- Paso 3 persistido: cuaderno de notas ----------
const notes = await raw.playerMatchNote.findMany({ where: { reportId: report.id } });
check("cuaderno: 2 notas (una por jugador, inválidas filtradas)", notes.length === 2, `got ${notes.length}`);
const noteT0 = notes.find((n) => n.playerId === rosterIds[0]);
check("nota verde 'Gran partido' persistida", noteT0?.flag === "GREEN" && noteT0?.note === "Gran partido");
const noteT1 = notes.find((n) => n.playerId === rosterIds[1]);
check("nota ámbar truncada a 140 caracteres", noteT1?.flag === "AMBER" && noteT1?.note?.length === 140, `got ${noteT1?.note?.length}`);

// ---------- Hook del motor: racha + re-prescripción del PROPOSED ----------
const pulseAfter = await raw.teamPulse.findUniqueOrThrow({ where: { id: mondayPulse.id } });
check("hook: racha de resultados cacheada en el pulso (+1 victoria)", pulseAfter.resultsStreak === 1, `got ${pulseAfter.resultsStreak}`);

const mcAfter = await raw.microcycle.findUniqueOrThrow({
  where: { id: proposedMc.id },
  include: { issues: true },
});
const tacticalIssues = mcAfter.issues.filter((i) => i.kind === "TACTICAL");
check(
  "hook: PROPOSED re-diagnosticado con los 2 hallazgos tácticos",
  mcAfter.issues.length === 2 && tacticalIssues.some((i) => i.phase === "OFF_TRANSITION" && /8 pérdidas en construcción/.test(i.evidence)) && tacticalIssues.some((i) => i.phase === "DEFENSIVE" && /6 duelos perdidos/.test(i.evidence)),
  JSON.stringify(mcAfter.issues.map((i) => ({ k: i.kind, p: i.phase, e: i.evidence }))),
);
check("hallazgos con métrica cruda auditada (Json)", tacticalIssues.every((i) => i.metric != null));

const evidence1 = result1.engineEvidence;
check(
  "feedback inmediato: evidencia del motor en la respuesta de la ingesta",
  Array.isArray(evidence1) && evidence1.some((e) => /8 pérdidas en construcción/.test(e)) && evidence1.some((e) => /6 duelos perdidos/.test(e)),
  JSON.stringify(evidence1),
);
check("hook: semana del partido refrescada", result1.refreshedWeeks.length === 1, JSON.stringify(result1.refreshedWeeks));

const refreshRuns = await raw.engineRun.findMany({ where: { teamId: testTeam.id, trigger: "EVIDENCE_REFRESH" } });
check("hook: EngineRun EVIDENCE_REFRESH persistido (auditoría)", refreshRuns.length === 1, `got ${refreshRuns.length}`);

// ---------- Re-ingesta idempotente (editar la ingesta, no duplicarla) ----------
const payload2: SubmitPayload = {
  gameId: testMatch.id,
  goalsFor: 1,
  goalsAgainst: 1,
  sensation: "AMBER",
  perceivedLoad: 6,
  collectiveAttitude: 5,
  tacticalExecution: 6,
  notes: "Empate ajustado",
  events: [{ type: "GOAL_FOR", x: 88, y: 50, playerId: rosterIds[4], minute: 30 }],
  playerNotes: [
    { playerId: rosterIds[0], flag: "AMBER", note: "Bajó intensidad en la 2ª parte" },
    { playerId: rosterIds[1], flag: "GREEN", note: "Recuperó su mejor versión" },
  ],
};

const result2 = await runMatchIngest(dbA, { user: coach, team: testTeam }, payload2);
check("re-ingesta → ok:true con EL MISMO reportId (edición)", result2.ok === true && result2.reportId === result1.reportId, JSON.stringify({ ok: result2.ok, same: result2.ok && result2.reportId === result1.reportId }));

const reportCount = await raw.matchReport.count({ where: { matchId: testMatch.id } });
check("matchReport unique: solo 1 reporte para el partido", reportCount === 1);

const report2 = await raw.matchReport.findUniqueOrThrow({ where: { id: result1.reportId } });
check("semáforo actualizado a AMBER y marcador 1-1", report2.sensation === "AMBER" && report2.notes === "Empate ajustado");
const match2 = await raw.match.findUniqueOrThrow({ where: { id: testMatch.id } });
check("marcador del partido actualizado 1-1", match2.goalsFor === 1 && match2.goalsAgainst === 1);

const events2 = await raw.tacticalEvent.findMany({ where: { reportId: report2.id } });
check("pizarra reemplazada por completo (1 evento, sin residuos)", events2.length === 1 && events2[0].type === "GOAL_FOR", `got ${events2.length}`);

const notes2 = await raw.playerMatchNote.findMany({ where: { reportId: report2.id } });
check(
  "cuaderno actualizado sin duplicados (mismas 2 notas, flags nuevos)",
  notes2.length === 2 && notes2.every((n) => n.flag === "AMBER" || n.flag === "GREEN") && notes2.find((n) => n.playerId === rosterIds[1])?.note === "Recuperó su mejor versión",
  JSON.stringify(notes2.map((n) => ({ f: n.flag, n: n.note }))),
);

const pulse2 = await raw.teamPulse.findUniqueOrThrow({ where: { id: mondayPulse.id } });
check("racha recalculada tras re-ingesta: empate → 0", pulse2.resultsStreak === 0, `got ${pulse2.resultsStreak}`);

// ============================================================================
console.log("\n══ 3) Aislamiento multi-tenant y guardias sobre datos del partido ══");
// ============================================================================
const clubC = await raw.club.create({ data: { name: "Club Intruso P3 (test)", slug: "zz-intruso-p3" } });
const seasonC = await raw.season.create({ data: { clubId: clubC.id, name: "S1", startDate: new Date(), endDate: new Date() } });
const teamC = await raw.team.create({ data: { clubId: clubC.id, seasonId: seasonC.id, name: "Intruso FC" } });
const matchC = await raw.match.create({
  data: { clubId: clubC.id, teamId: teamC.id, opponent: "Rival Secreto", isHome: false, kickoffAt: new Date(), status: "SCHEDULED" },
});
const reportC = await raw.matchReport.create({
  data: { matchId: matchC.id, createdById: coach.id, sensation: "RED", perceivedLoad: 9, collectiveAttitude: 2, tacticalExecution: 3 },
});
const eventC = await raw.tacticalEvent.create({ data: { reportId: reportC.id, x: 50, y: 50, type: "BALL_LOSS" } });
const noteC = await raw.playerMatchNote.create({
  data: {
    reportId: reportC.id,
    playerId: (await raw.player.create({ data: { clubId: clubC.id, teamId: teamC.id, firstName: "Espía", lastName: "P3", mainPosition: "CM" } })).id,
    flag: "RED",
  },
});

// Lecturas del club A: nada del intruso (scope por RELACIÓN match.clubId).
// El club A sí ve SUS propios datos; lo que no debe aparecer es el material ajeno.
const reportsA = await dbA.matchReport.findMany();
check("club A NO ve matchReports del intruso (RELATION_SCOPED)", !reportsA.some((r: any) => r.id === reportC.id), `got ${reportsA.length}`);
const eventsA = await dbA.tacticalEvent.findMany();
check("club A NO ve eventos tácticos del intruso", !eventsA.some((e: any) => e.id === eventC.id), `filtrados: ${eventsA.length - eventsA.filter((e: any) => e.id === eventC.id).length}/${eventsA.length}`);
const notesA = await dbA.playerMatchNote.findMany();
check("club A NO ve notas del cuaderno del intruso", !notesA.some((n: any) => n.id === noteC.id), `filtradas: ${notesA.length - notesA.filter((n: any) => n.id === noteC.id).length}/${notesA.length}`);

// Ingesta de un partido de OTRO CLUB → no encontrado (el guard lo filtra antes)
const crossClub = await runMatchIngest(dbA, { user: coach, team: testTeam }, { ...payload2, gameId: matchC.id });
check("ingesta de partido cross-club → 'Partido no encontrado.'", crossClub.ok === false && /no encontrado/.test(crossClub.ok ? "" : crossClub.error), JSON.stringify(crossClub));

// Ingesta de un partido de OTRO EQUIPO del MISMO club → error explícito
const teamB = await raw.team.create({
  data: { clubId: clubA.id, seasonId: demoSeason.id, name: "Equipo Vecino TEST", category: "Test" },
});
const matchB = await raw.match.create({
  data: { clubId: clubA.id, teamId: teamB.id, opponent: "Rival Vecino", isHome: true, kickoffAt: new Date(), status: "SCHEDULED" },
});
const crossTeam = await runMatchIngest(dbA, { user: coach, team: testTeam }, { ...payload2, gameId: matchB.id });
check("ingesta de partido de otro equipo del club → rechazada", crossTeam.ok === false && /pertenece a otro equipo/.test(crossTeam.ok ? "" : crossTeam.error), JSON.stringify(crossTeam));

// Escritura cross-tenant de partidos bloqueada por el Tenant Guard
let matchBlocked = false;
try {
  await dbA.match.create({ data: { clubId: clubC.id, teamId: teamC.id, opponent: "hack", isHome: true, kickoffAt: new Date() } as any });
} catch (e: any) {
  matchBlocked = /Tenant Guard/.test(e?.message ?? "");
}
check("Tenant Guard bloquea create de partido cross-tenant", matchBlocked);

// El partido ajeno no deja huella en el club A
const matchBReports = await raw.matchReport.count({ where: { matchId: matchB.id } });
check("ingesta rechazada NO escribió ningún dato", matchBReports === 0 && (await raw.tacticalEvent.count({ where: { report: { matchId: matchB.id } } })) === 0);

// ============================================================================
console.log("\n══ 4) HTTP — Partidos e ingesta con datos reales (NextAuth) ══");
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

async function GET(path: string, session?: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: session ? { cookie: session } : {},
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location"), html: await res.text() };
}

const coachSession = await login("mister@cfmetodo.es", "metodo2025");
check("login COACH_ADMIN obtiene session-token", !!coachSession);
if (coachSession) {
  // Cambiamos el equipo activo al equipo de prueba (como haría setActiveTeam)
  const originalLastTeam = coach.lastTeamId;
  await raw.user.update({ where: { id: coach.id }, data: { lastTeamId: testTeam.id } });

  const matchesPage = await GET("/dashboard/matches", coachSession);
  check("COACH_ADMIN: /dashboard/matches 200", matchesPage.status === 200);
  check(
    "matches: partido analizado con rival, resultado 1-1 y semáforo ámbar",
    matchesPage.html.includes("Rival Ingesta") && matchesPage.html.includes("1-1") && matchesPage.html.includes("Sensación: Ámbar"),
  );
  check("matches: enlace firmado a la ingesta ?g=", matchesPage.html.includes(`/dashboard/match?g=${testMatch.id}`));

  const ingestPage = await GET(`/dashboard/match?g=${testMatch.id}`, coachSession);
  check("COACH_ADMIN: /dashboard/match?g= 200 con el asistente de 3 pasos", ingestPage.status === 200 && ingestPage.html.includes("Semáforo"));
  check("ingesta: carga el reporte previo para edición", ingestPage.html.includes("Rival Ingesta"));

  const intruderPage = await GET(`/dashboard/match?g=${matchC.id}`, coachSession);
  check("seguridad: ingesta del partido del intruso → 404", intruderPage.status === 404);

  const noParam = await GET("/dashboard/match", coachSession);
  check("diseño: /dashboard/match sin ?g= → 404 (la ingesta se firma desde Partidos)", noParam.status === 404);

  await raw.user.update({ where: { id: coach.id }, data: { lastTeamId: originalLastTeam } });
}

const analystSession = await login("analista@cfmetodo.es", "metodo2025");
check("login ANALYST obtiene session-token", !!analystSession);
if (analystSession) {
  const matchesPage = await GET("/dashboard/matches", analystSession);
  check("ANALYST: /dashboard/matches 200 (la ingesta es su trabajo)", matchesPage.status === 200);
}

const anonMatches = await GET("/dashboard/matches");
check("anónimo: /dashboard/matches → redirect a /", anonMatches.status >= 300 && anonMatches.status < 400);

// ============================================================================
console.log("\n══ 🧹 Limpieza del material de prueba ══");
// ============================================================================
await purgeTestData();
console.log("  material sintético eliminado (equipos, jugadores, partido+ingesta, pulso, microciclo, club intruso)");

await raw.$disconnect();

await writeResults(3, "Ingesta Post-Partido (Pilar 3)", total, failures, t0, checkLog);

console.log(
  `\n${failures === 0 ? "🎉 TODO OK — Pilar 3 validado (flujo 3 pasos + hook del motor + aislamiento + guardias)" : `💥 ${failures} fallos`}`,
);
process.exit(failures === 0 ? 0 : 1);
