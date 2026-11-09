// ============================================================================
// VALIDACIÓN E2E — PILAR 2 (Plantilla + Ingesta Ágil: CSV/Excel + Pulso)
// ----------------------------------------------------------------------------
// Mismo estándar de robustez que validate-pilar4.ts:
// 1) Unit: parser CSV real (RFC-4180), mapa de cabeceras flexibles, saneado
//    de dorsales/ratings/estados y taxonomía de posiciones (código REAL de
//    src/lib/squad-import + src/lib/taxonomy, no copias).
// 2) Persistencia: importación masiva REAL (applySquadImport) sobre un equipo
//    sintético — create/update/errores fila a fila, idempotencia por nombre
//    normalizado, importación XLSX real, y Tenant Guard sobre Player.
// 3) TeamPulse: unique (teamId, date), edición de fatiga, racha de resultados
//    (+victorias / -derrotas / 0 empates) y su lectura por el motor.
// 4) HTTP: /dashboard/players por rol (NextAuth) + indicadores de plantilla.
// Idempotente: limpia restos de ejecuciones interrumpidas antes de empezar.
// Ejecutar: bun scripts/validate-pilar2.ts  (dev server en :3000, PG en :5432)
// ============================================================================
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { createTenantClient } from "../src/lib/tenant";
import {
  applySquadImport,
  buildColumnMap,
  clampRating,
  fileToMatrix,
  parseCsv,
  parseSecondary,
  parseShirt,
  parseStatus,
} from "../src/lib/squad-import";
import {
  buildIssueDrafts,
  collectInputs,
  computeResultsStreak,
  mondayOf,
} from "../src/lib/engine/diagnose";
import { normalizeName, normalizePosition } from "../src/lib/taxonomy";
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

// ============================================================================
console.log("\n══ 0) Limpieza de restos de ejecuciones interrumpidas ══");
// ============================================================================
async function purgeTestData() {
  const leftoverTeams = await raw.team.findMany({
    where: { clubId: clubA.id, name: "Equipo Plantilla TEST" },
  });
  for (const lt of leftoverTeams) {
    await raw.engineRun.deleteMany({ where: { teamId: lt.id } });
    await raw.microcycle.deleteMany({ where: { teamId: lt.id } });
    await raw.match.deleteMany({ where: { teamId: lt.id } });
    await raw.teamPulse.deleteMany({ where: { teamId: lt.id } });
    await raw.player.deleteMany({ where: { teamId: lt.id } });
    await raw.team.delete({ where: { id: lt.id } });
  }
  const intruder = await raw.club.findUnique({ where: { slug: "zz-intruso-p2" } });
  if (intruder) await raw.club.delete({ where: { id: intruder.id } }); // cascada total
}
await purgeTestData();
console.log("  sin restos previos — arranque limpio");

// ============================================================================
console.log("\n══ 1) Unit — parser CSV/Excel + taxonomía (código real) ══");
// ============================================================================

// Delimitador auto: coma, punto y coma y tabulador
check(
  "parseCsv: delimitador coma",
  parseCsv("Nombre,Posición\nLuis,CM")[1].join("|") === "Luis|CM",
);
const csvSemis = parseCsv("Nombre;Posición\r\nAitor;Central\r\n");
check("parseCsv: delimitador ; auto + CRLF", csvSemis[0][1] === "Posición" && csvSemis[1][1] === "Central");
const csvTab = parseCsv("Nombre\tPosición\nLuis\tCM");
check("parseCsv: delimitador tab auto", csvTab[1][1] === "CM");
check(
  "parseCsv: comillas RFC-4180 con comilla escapada",
  parseCsv('"Nombre","Nota"\n"Luis","Dijo ""míster"""')[1][1] === 'Dijo "míster"',
);
check(
  "parseCsv: coma dentro de comillas no parte campo",
  parseCsv('Nombre,Nota\nLuis,"una, dos"')[1][1] === "una, dos",
);
check("parseCsv: BOM UTF-8 eliminado", parseCsv("\uFEFFNombre,Pos\nLuis,CM")[0][0] === "Nombre");
check("parseCsv: filas vacías descartadas", parseCsv("a,b\n\n\nx,y").length === 2);

// Cabeceras flexibles + coincidencia EXACTA (evita "nota"→dorsal "no")
const colMap = buildColumnMap(["Nombre y Apellidos", "Posición", "Dorsal", "Nota"]);
check(
  "buildColumnMap: alias castellanos mapeados (nombre completo)",
  colMap.fullName === 0 && colMap.position === 1 && colMap.shirtNumber === 2 && colMap.note === 3,
  JSON.stringify(colMap),
);
const colTrap = buildColumnMap(["Nota", "Dorsal"]);
check("buildColumnMap: 'nota' NO colisiona con dorsal 'no'", colTrap.note === 0 && colTrap.shirtNumber === 1);
check("buildColumnMap: 'Nombre' → firstName", buildColumnMap(["Nombre", "Posición"]).firstName === 0);

// Saneado de valores
check("clampRating: 0 → 1 (suelo)", clampRating("0") === 1);
check("clampRating: 9 → 5 (techo)", clampRating("9") === 5);
check("clampRating: coma decimal '3,5' → 4", clampRating("3,5") === 4);
check("clampRating: texto basura → null", clampRating("n/a") === null);
check("clampRating: vacío → null", clampRating("") === null);
check("parseShirt: '10' → 10", parseShirt("10") === 10);
check("parseShirt: 'sin' → null", parseShirt("sin") === null);
check("parseStatus: 'Lesionado' → INJURED", parseStatus("Lesionado") === "INJURED");
check("parseStatus: 'SANCIONADO' → SUSPENDED", parseStatus("SANCIONADO") === "SUSPENDED");
check("parseStatus: desconocido → AVAILABLE", parseStatus("volando") === "AVAILABLE");
check(
  "parseSecondary: split multi-separador + filtra demarcación principal",
  JSON.stringify(parseSecondary("MC y LI; RB, CM", "CB")) === JSON.stringify(["CM", "LB", "RB"]),
);

// Taxonomía de posiciones (castellano de cantera → enum internacional)
check("normalizePosition: 'central' → CB", normalizePosition("Central") === "CB");
check("normalizePosition: 'MCO' → AM", normalizePosition("MCO") === "AM");
check("normalizePosition: 'Delantero Centro' → CF", normalizePosition("Delantero Centro") === "CF");
check("normalizePosition: 'pivote' → DM", normalizePosition("pivote") === "DM");
check("normalizePosition: desconocida → null", normalizePosition("delantero raro") === null);
check("normalizeName: acentos/caso/espacios", normalizeName(" Íker  Méndez ") === "iker mendez");

// ============================================================================
console.log("\n══ 2) Persistencia — importación masiva REAL (Tenant Guard) ══");
// ============================================================================
const demoSeason = await raw.season.findFirstOrThrow({ where: { clubId: clubA.id } });
const testTeam = await raw.team.create({
  data: { clubId: clubA.id, seasonId: demoSeason.id, name: "Equipo Plantilla TEST", category: "Test" },
});

// Jugador preexistente (para el camino "updated" por matching de nombre)
const preExisting = await dbA.player.create({
  data: { teamId: testTeam.id, firstName: "Iker", lastName: "Mendoza", shirtNumber: 20, primaryPosition: "RW", isActive: true },
});

// CSV mixto (columna "Jugador" = nombre completo): 2 nuevos + 1 existente
// (con acentos en el original) + 2 filas inválidas
const CSV_MIXTO = [
  "Jugador;Posición;Dorsal;Secundarias;Técnico;Táctico;Físico;Estado;Nota",
  "Aitor Etxeberria;Central;4;MC y LI;3,5;4;2;Disponible;",
  "Markel Ubina;Portero;1;;4;;5;;Sin problemas",
  "Iker Mendoza;Extremo Izquierdo;11;ED;5;3;3;Lesionado;Molestias tobillo izq.",
  "Dorsal Duplicado;Medio Centro;4;;2;2;2;;",
  "Posición Rara;Delantero Raro;9;;2;2;2;;",
].join("\r\n");

const summary1 = await applySquadImport(dbA, testTeam, parseCsv(CSV_MIXTO));
check(
  "import CSV: 2 creados + 1 actualizado + 2 errores",
  summary1.created === 2 && summary1.updated === 1 && summary1.errors === 2 && summary1.ok === false,
  JSON.stringify({ c: summary1.created, u: summary1.updated, e: summary1.errors }),
);
check(
  "error de dorsal duplicado identifica al dueño",
  summary1.rows.some((r) => /El dorsal 4 ya lo tiene Aitor Etxeberria/.test(r.error ?? "")),
  JSON.stringify(summary1.rows.filter((r) => r.action === "error")),
);
check(
  "error de posición no reconocida es legible",
  summary1.rows.some((r) => /Posición "Delantero Raro" no reconocida/.test(r.error ?? "")),
);

// Metadatos físicos persistidos (ratings clamp + polivalencias + estado + nota)
const aitor = await dbA.player.findFirstOrThrow({ where: { teamId: testTeam.id, firstName: "Aitor" } });
check(
  "metadata: posición principal CB + secundarias [CM, LB] (array nativo)",
  aitor.primaryPosition === "CB" && JSON.stringify(aitor.secondaryPositions) === JSON.stringify(["CM", "LB"]),
  JSON.stringify({ m: aitor.primaryPosition, s: aitor.secondaryPositions }),
);
check("metadata: rating técnico clamped '3,5' → 4", aitor.technicalRating === 4 && aitor.tacticalRating === 4 && aitor.physicalRating === 2);
check("metadata: dorsal 4 asignado", aitor.shirtNumber === 4);

const markel = await dbA.player.findFirstOrThrow({ where: { teamId: testTeam.id, firstName: "Markel" } });
check("metadata: portero GK con nota 'Sin problemas'", markel.primaryPosition === "GK" && markel.statusNote === "Sin problemas");

const iker = await dbA.player.findFirstOrThrow({ where: { id: preExisting.id } });
check(
  "actualización: RW → LW, dorsal 20 → 11, estado INJURED con nota",
  iker.primaryPosition === "LW" && iker.shirtNumber === 11 && iker.status === "INJURED" && iker.statusNote === "Molestias tobillo izq.",
  JSON.stringify({ p: iker.primaryPosition, d: iker.shirtNumber, st: iker.status }),
);
check("actualización: ratings sobrescritos 5/3/3", iker.technicalRating === 5 && iker.tacticalRating === 3 && iker.physicalRating === 3);

// Idempotencia: reimportar el MISMO CSV → todo "updated", cero duplicados
const summary2 = await applySquadImport(dbA, testTeam, parseCsv(CSV_MIXTO));
check(
  "reimportación idempotente: 0 creados, 3 actualizados, mismos 2 errores",
  summary2.created === 0 && summary2.updated === 3 && summary2.errors === 2,
  JSON.stringify({ c: summary2.created, u: summary2.updated, e: summary2.errors }),
);
const squadCount = await dbA.player.count({ where: { teamId: testTeam.id } });
check("sin duplicados en BD tras reimportar", squadCount === 3, `got ${squadCount}`);

// Camino de dos columnas (Nombre + Apellidos) con delimitador coma
const CSV_DOS_COL = "Nombre,Apellidos,Posición,Dorsal\nXavi,Guardiola,DM,6";
const summaryCols = await applySquadImport(dbA, testTeam, parseCsv(CSV_DOS_COL));
check("import 2 columnas: nombre y apellidos separados", summaryCols.created === 1 && summaryCols.errors === 0, JSON.stringify(summaryCols.rows));
const xavi = await dbA.player.findFirstOrThrow({ where: { teamId: testTeam.id, firstName: "Xavi" } });
check("import 2 columnas: lastName 'Guardiola' + pivote DM", xavi.lastName === "Guardiola" && xavi.primaryPosition === "DM");

// Importación XLSX real (buffer → File → fileToMatrix → applySquadImport)
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ["Player", "Position", "Number"],
    ["Unai Excel", "Goalkeeper", 13],
  ]),
  "Plantilla",
);
const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
const xlsxFile = new File([new Uint8Array(xlsxBuffer)], "plantilla.xlsx");
const parsedXlsx = await fileToMatrix(xlsxFile);
check("fileToMatrix: lee .xlsx real (no .csv)", "matrix" in parsedXlsx && parsedXlsx.matrix.length === 2);
if (!("matrix" in parsedXlsx)) throw new Error(parsedXlsx.error);
const summaryX = await applySquadImport(dbA, testTeam, parsedXlsx.matrix);
check("import XLSX: jugador creado con alias ingleses", summaryX.created === 1 && summaryX.errors === 0, JSON.stringify(summaryX.rows));
const unai = await dbA.player.findFirstOrThrow({ where: { teamId: testTeam.id, firstName: "Unai" } });
check("import XLSX: GK con dorsal 13 persistido", unai.primaryPosition === "GK" && unai.shirtNumber === 13);

const csvFile = new File([new TextEncoder().encode(CSV_MIXTO)], "plantilla.csv");
check("fileToMatrix: acepta .csv con BOM", "matrix" in (await fileToMatrix(new File([new Uint8Array([0xef, 0xbb, 0xbf]), new TextEncoder().encode("Nombre,Posición\nX,CM")], "a.csv"))));
const badFile = new File(["bins"], "plantilla.pdf");
check("fileToMatrix: formato no soportado → error claro", "error" in (await fileToMatrix(badFile)));

// Disponibilidad (pulso de plantilla): conteos por estado tras la importación
const availability = {
  available: await dbA.player.count({ where: { teamId: testTeam.id, status: "AVAILABLE", isActive: true } }),
  injured: await dbA.player.count({ where: { teamId: testTeam.id, status: "INJURED", isActive: true } }),
};
check(
  "disponibilidad calculada de la plantilla: 4 disponibles + 1 lesionado",
  availability.available === 4 && availability.injured === 1,
  JSON.stringify(availability),
);

// ---------- Tenant Guard sobre Player ----------
const clubB = await raw.club.create({
  data: { name: "Club Intruso P2 (test)", slug: "zz-intruso-p2" },
});
const intruderTeam = await raw.team.create({
  data: { clubId: clubB.id, seasonId: (await raw.season.create({ data: { clubId: clubB.id, name: "S1", startDate: new Date(), endDate: new Date() } })).id, name: "Intruso" },
});
const intruderPlayer = await raw.player.create({
  data: { clubId: clubB.id, teamId: intruderTeam.id, firstName: "Espía", lastName: "Intruso", primaryPosition: "CM", isActive: true },
});

const visible = await dbA.player.findMany();
check("club A NO ve jugadores del intruso", !visible.some((p: any) => p.clubId === clubB.id));

let blocked = false;
try {
  await dbA.player.create({ data: { clubId: clubB.id, teamId: intruderTeam.id, firstName: "hack", lastName: "hack", primaryPosition: "CM" } as any });
} catch (e: any) {
  blocked = /Tenant Guard/.test(e?.message ?? "");
}
check("Tenant Guard bloquea create de jugador cross-tenant", blocked);

let injected = false;
const injectedPlayer = await dbA.player.create({ data: { teamId: testTeam.id, firstName: "Auto", lastName: "Club", primaryPosition: "CM" } as any });
injected = injectedPlayer.clubId === clubA.id;
check("create de jugador sin clubId → inyecta clubId del tenant", injected);

let updateBlocked = false;
try {
  await dbA.player.update({ where: { id: intruderPlayer.id }, data: { firstName: "HACKED" } });
} catch {
  updateBlocked = true;
}
const spyAfter = await raw.player.findUniqueOrThrow({ where: { id: intruderPlayer.id } });
check("update de jugador del intruso falla y no muta nada", updateBlocked && spyAfter.firstName === "Espía");

// ============================================================================
console.log("\n══ 3) TeamPulse — fatiga, disponibilidad y racha de resultados ══");
// ============================================================================
const today = new Date();

// Unique (teamId, date): un pulso por equipo y día
const pulse1 = await dbA.teamPulse.create({
  data: { teamId: testTeam.id, date: today, moraleScore: 6, fatigueScore: 5, capturedById: coach.id, notes: "pulso inicial" },
});
let dupBlocked = false;
try {
  await dbA.teamPulse.create({ data: { teamId: testTeam.id, date: today, moraleScore: 9, fatigueScore: 2 } });
} catch (e: any) {
  dupBlocked = String(e?.code ?? "") === "P2002" || /Unique constraint/.test(e?.message ?? "");
}
check("TeamPulse: unique (teamId, date) rechaza segundo pulso del día", dupBlocked);

// Edición exprés: la fatiga se actualiza (no se duplica) y persiste
await dbA.teamPulse.update({ where: { id: pulse1.id }, data: { fatigueScore: 8, moraleScore: 3, notes: "tras doble sesión" } });
const pulseEdited = await raw.teamPulse.findUniqueOrThrow({ where: { id: pulse1.id } });
check("TeamPulse: fatiga 5 → 8 y ánimo 6 → 3 persistidos (edición, no duplicado)", pulseEdited.fatigueScore === 8 && pulseEdited.moraleScore === 3);

// El motor lee SIEMPRE el pulso más reciente del equipo
const weekStart = new Date();
const inputs = await collectInputs(dbA, testTeam.id, weekStart);
check("collectInputs: devuelve el pulso más reciente (fatiga 8)", inputs.pulse?.id === pulse1.id && inputs.pulse?.fatigueScore === 8);

// El pulso alimenta el diagnóstico: fatiga ≥7 → hallazgo FÍSICO; ánimo ≤4 → ANÍMICO
const drafts = await buildIssueDrafts(dbA, testTeam.id, inputs);
const physical = drafts.find((d) => d.kind === "PHYSICAL");
const morale = drafts.find((d) => d.kind === "MORALE");
check("pulso fatiga 8/10 → hallazgo FÍSICO con evidencia legible", !!physical && /Fatiga grupal acumulada 8\/10/.test(physical.evidence), JSON.stringify(drafts.map((d) => d.kind)));
check("pulso ánimo 3/10 → hallazgo ANÍMICO (éxito temprano)", !!morale && morale.severity === 3 && /Inercia anímica baja \(3\/10\)/.test(morale.evidence));

// Racha de resultados: +victorias / -derrotas / 0 empates
const mkMatch = (o: string, gf: number, ga: number, daysAgo: number) =>
  raw.match.create({
    data: {
      clubId: clubA.id, teamId: testTeam.id, opponent: o, isHome: true,
      kickoffAt: new Date(today.getTime() - daysAgo * 86400000), status: "PLAYED", goalsFor: gf, goalsAgainst: ga,
    },
  });
const mOld = await mkMatch("Rival Viejo", 0, 1, 21); // derrota (semana pasada)
const mMid = await mkMatch("Rival Medio", 2, 0, 14); // victoria
const mNew = await mkMatch("Rival Nuevo", 3, 1, 7);  // victoria (la más reciente)

check("racha: 2 victorias seguidas → +2", (await computeResultsStreak(dbA as any, testTeam.id)) === 2);
await raw.match.update({ where: { id: mNew.id }, data: { goalsFor: 1, goalsAgainst: 1 } }); // empate lo más reciente
check("racha: empate lo más reciente → 0", (await computeResultsStreak(dbA as any, testTeam.id)) === 0);
await raw.match.update({ where: { id: mNew.id }, data: { goalsFor: 0, goalsAgainst: 2 } }); // derrota lo más reciente
check("racha: derrota lo más reciente → -1", (await computeResultsStreak(dbA as any, testTeam.id)) === -1);

// La racha se cachea en el Pulso (como hace el hook real de la ingesta)
const monday = mondayOf(new Date()); // lunes-Madrid canónico (misma convención que collectInputs)
await dbA.teamPulse.upsert({
  where: { teamId_date: { teamId: testTeam.id, date: monday } },
  update: { resultsStreak: -1 },
  create: { clubId: clubA.id, teamId: testTeam.id, date: monday, moraleScore: 5, fatigueScore: 4, resultsStreak: -1, capturedById: coach.id },
});
const pulseWithStreak = await raw.teamPulse.findUniqueOrThrow({
  where: { teamId_date: { teamId: testTeam.id, date: monday } },
});
check("racha cacheada en TeamPulse.resultsStreak del lunes", pulseWithStreak.resultsStreak === -1);

// ---------- Tenant Guard sobre TeamPulse ----------
const intruderPulse = await raw.teamPulse.create({
  data: { clubId: clubB.id, teamId: intruderTeam.id, date: today, moraleScore: 1, fatigueScore: 1 },
});
const pulsesVisible = await dbA.teamPulse.findMany();
check("club A NO ve pulsos del intruso", !pulsesVisible.some((p: any) => p.clubId === clubB.id));
let pulseUpdateBlocked = false;
try {
  await dbA.teamPulse.update({ where: { id: intruderPulse.id }, data: { fatigueScore: 10 } });
} catch {
  pulseUpdateBlocked = true;
}
check("update de pulso del intruso bloqueado por scope", pulseUpdateBlocked);

// ============================================================================
console.log("\n══ 4) HTTP — /dashboard/players por rol (NextAuth) ══");
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
  const players = await GET("/dashboard/players", coachSession);
  check("COACH_ADMIN: /dashboard/players 200", players.status === 200);
  check("COACH_ADMIN: vista Plantilla con stats de disponibilidad", players.html.includes(">Plantilla<") && players.html.includes("DISPONIBLES"));
  check("COACH_ADMIN: acceso a importación CSV/Excel", players.html.includes("Importar plantilla desde CSV o Excel"));
  const hoy = await GET("/dashboard/today", coachSession);
  check("COACH_ADMIN: /dashboard/today 200 (pulso visible si existe)", hoy.status === 200);
}

const analystSession = await login("analista@cfmetodo.es", "metodo2025");
check("login ANALYST obtiene session-token", !!analystSession);
if (analystSession) {
  const players = await GET("/dashboard/players", analystSession);
  check("ANALYST: /dashboard/players 200 (la ingesta es su trabajo)", players.status === 200);
}

const anonPlayers = await GET("/dashboard/players");
check("anónimo: /dashboard/players → redirect a /", anonPlayers.status >= 300 && anonPlayers.status < 400);

// ============================================================================
console.log("\n══ 🧹 Limpieza del material de prueba ══");
// ============================================================================
await purgeTestData();
console.log("  material sintético eliminado (equipos, jugadores, pulsos, partidos, club intruso)");

await raw.$disconnect();

await writeResults(2, "Plantilla y Pulso (Pilar 2)", total, failures, t0, checkLog);

console.log(
  `\n${failures === 0 ? "🎉 TODO OK — Pilar 2 validado (plantilla + importación masiva + pulso + tenant guard)" : `💥 ${failures} fallos`}`,
);
process.exit(failures === 0 ? 0 : 1);
