// ============================================================================
// VALIDACIÓN E2E — PILAR 2 · PERFIL PRE-PARTIDO DEL JUGADOR
// ----------------------------------------------------------------------------
// Suite standalone (NO altera los totales canónicos de la batería 261):
// 1) Unit: saneo puro del perfil (RPE acotado 1-10, textos recortados),
//    niveles de carga (FRESH/TIGHT/FATIGUED), parser RPE del CSV y
//    detección de las cabeceras nuevas.
// 2) Import CSV: columnas rpe/lesiones/academico/fortaleza crean y actualizan
//    (RPE fuera de rango se acota sin romper la fila).
// 3) DB: round-trip completo de los 4 campos (create → read → null).
// 4) HTTP: /dashboard/players muestra el bloque de decisión de un vistazo
//    (chips RPE coloreados, precaución médica, carga invisible, fortaleza,
//    contador CARGA ALTA y filtro) y la alta manual.
// Ejecutar: bun scripts/validate-perfil.ts  (dev server :3000, PG :5432)
// ============================================================================
import { PrismaClient } from "@prisma/client";
import {
  buildColumnMap,
  parseRpeValue,
  rpeLoadLevel,
  sanitizePlayerProfilePatch,
  applySquadImport,
} from "../src/lib/squad-import";

const PG = "postgresql://postgres:postgres@localhost:5432/metodo";
const BASE = "http://localhost:3000";
let failures = 0;
let total = 0;
const checkLog: Array<{ name: string; ok: boolean }> = [];

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
console.log("\n══ 1) Unit — saneo puro del perfil pre-partido ══");
// ============================================================================
{
  const a = sanitizePlayerProfilePatch({ currentRpe: null, injuryHistory: "  ", strength: "" });
  check("RPE null → null (borrar marcado)", a.data.currentRpe === null);
  check("texto vacío → null (borrar)", a.data.injuryHistory === null && a.data.strength === null);
  check("campos no enviados quedan fuera del patch", !("academicConstraints" in a.data));

  const b = sanitizePlayerProfilePatch({ currentRpe: 7 });
  check("RPE 7 dentro de rango → 7 sin aviso", b.data.currentRpe === 7 && !b.rpeOutOfRange);

  const c = sanitizePlayerProfilePatch({ currentRpe: 0 });
  check("RPE 0 → acotado a 1 con aviso", c.data.currentRpe === 1 && c.rpeOutOfRange);

  const d = sanitizePlayerProfilePatch({ currentRpe: 15 });
  check("RPE 15 → acotado a 10 con aviso", d.data.currentRpe === 10 && d.rpeOutOfRange);

  const long = "x".repeat(700);
  const e = sanitizePlayerProfilePatch({ injuryHistory: `  ${long}  ` });
  check("texto de 700 → recortado a 500 sin espacios", e.data.injuryHistory?.length === 500);

  check("nivel de carga: 1-4 FRESH", rpeLoadLevel(1) === "FRESH" && rpeLoadLevel(4) === "FRESH");
  check("nivel de carga: 5-7 TIGHT", rpeLoadLevel(5) === "TIGHT" && rpeLoadLevel(7) === "TIGHT");
  check("nivel de carga: 8-10 FATIGUED", rpeLoadLevel(8) === "FATIGUED" && rpeLoadLevel(10) === "FATIGUED");
  check("nivel de carga: null → null", rpeLoadLevel(null) === null);

  check("parser CSV: '7' → 7", parseRpeValue("7") === 7);
  check("parser CSV: '7,5' → 8 (redondeo)", parseRpeValue("7,5") === 8);
  check("parser CSV: 'sin' → null", parseRpeValue("sin") === null);
  check("parser CSV: '0' → 1 (acotado)", parseRpeValue("0") === 1);
  check("parser CSV: '99' → 10 (acotado)", parseRpeValue("99") === 10);

  const colMap = buildColumnMap(["Nombre", "Apellidos", "Posición", "RPE", "Lesiones", "Académico", "Fortaleza", "Estrés académico", "Punto fuerte"]);
  check("cabeceras nuevas detectadas (RPE/Lesiones/Académico/Fortaleza)",
    colMap.rpe !== undefined && colMap.injuries !== undefined && colMap.academic !== undefined && colMap.strength !== undefined);
  check("alias académico alternativo (Estrés académico)", buildColumnMap(["Estrés académico"]).academic !== undefined);
  check("alias fortaleza alternativo (Punto fuerte)", buildColumnMap(["Punto fuerte"]).strength !== undefined);
}

// ============================================================================
console.log("\n══ 2) Material de prueba (club propio + CSV con columnas nuevas) ══");
// ============================================================================
// Club de prueba para la importación (limpieza garantizada por slug)
async function purgeClub() {
  try {
    await raw.club.deleteMany({ where: { slug: { startsWith: "zz-perfil" } } });
  } catch { /* sin datos previos */ }
}
await purgeClub();

const clubA = await raw.club.create({ data: { name: "CD Perfil TEST", slug: "zz-perfil-test" } });
const seasonA = await raw.season.create({
  data: { clubId: clubA.id, name: "T Perfil", startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 31) },
});
const teamA = await raw.team.create({ data: { clubId: clubA.id, seasonId: seasonA.id, name: "Perfil FC" } });

{
  const matrix = [
    ["Nombre", "Apellidos", "Dorsal", "Posición", "RPE", "Lesiones", "Académico", "Fortaleza"],
    ["Kolo", "Perfil", "90", "MC", "6", "Rodilla operada (prueba)", "Tarde de clase (prueba)", "Pase largo (prueba)"],
  ];
  const summary = await applySquadImport(raw, { id: teamA.id, clubId: clubA.id }, matrix);
  check("import CSV: fila creada sin errores", summary.created === 1 && summary.errors === 0, JSON.stringify(summary.rows));
  const kolo = await raw.player.findFirstOrThrow({ where: { teamId: teamA.id, firstName: "Kolo" } });
  check("import CSV: RPE 6 persistido", kolo.currentRpe === 6);
  check("import CSV: lesiones persistidas", kolo.injuryHistory === "Rodilla operada (prueba)");
  check("import CSV: académico persistido", kolo.academicConstraints === "Tarde de clase (prueba)");
  check("import CSV: fortaleza persistida", kolo.strength === "Pase largo (prueba)");

  // Actualización por re-import: RPE fuera de rango se acota, textos cambian
  const matrix2 = [
    ["Nombre", "Apellidos", "Posición", "RPE", "Fortaleza"],
    ["Kolo", "Perfil", "MC", "15", "Centro chroz (prueba)"],
  ];
  const summary2 = await applySquadImport(raw, { id: teamA.id, clubId: clubA.id }, matrix2);
  check("re-import: jugador actualizado (matching por nombre)", summary2.updated === 1 && summary2.errors === 0);
  const kolo2 = await raw.player.findFirstOrThrow({ where: { id: kolo.id } });
  check("re-import: RPE 15 acotado a 10", kolo2.currentRpe === 10);
  check("re-import: fortaleza actualizada", kolo2.strength === "Centro chroz (prueba)");
  check("re-import: campos ausentes intactos", kolo2.injuryHistory === "Rodilla operada (prueba)");
}

// ============================================================================
console.log("\n══ 3) DB — round-trip de los 4 campos pre-partido ══");
// ============================================================================
{
  const p = await raw.player.create({
    data: {
      clubId: clubA.id,
      teamId: teamA.id,
      firstName: "Ronda",
      lastName: "Perfil",
      mainPosition: "CB",
      currentRpe: 8,
      injuryHistory: "Pubalgia leve (prueba)",
      academicConstraints: "Selectividad (prueba)",
      strength: "Juego aéreo (prueba)",
      secondaryPositions: ["LB", "DM"],
    },
  });
  const back = await raw.player.findUniqueOrThrow({ where: { id: p.id } });
  check("create+read: RPE 8", back.currentRpe === 8);
  check("create+read: lesiones", back.injuryHistory === "Pubalgia leve (prueba)");
  check("create+read: académico", back.academicConstraints === "Selectividad (prueba)");
  check("create+read: fortaleza", back.strength === "Juego aéreo (prueba)");
  check("create+read: polivalencias [LB, DM]", back.secondaryPositions.join(",") === "LB,DM");
  await raw.player.update({ where: { id: p.id }, data: { currentRpe: null, injuryHistory: null, academicConstraints: null, strength: null } });
  const cleared = await raw.player.findUniqueOrThrow({ where: { id: p.id } });
  check("update a null: 4 campos borrados", cleared.currentRpe === null && cleared.injuryHistory === null && cleared.academicConstraints === null && cleared.strength === null);
}

// ============================================================================
console.log("\n══ 4) HTTP — /dashboard/players con decisión de un vistazo ══");
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

// Jugadores de prueba EN el equipo activo del míster (lo que renderiza la
// página): 91 con todo el perfil + 92 fresco, para chips y contador.
const mister = await raw.user.findFirstOrThrow({
  where: { email: "mister@cfmetodo.es" },
  select: { id: true, clubId: true, lastTeamId: true },
});
const demoTeam = mister.lastTeamId
  ? await raw.team.findFirstOrThrow({ where: { id: mister.lastTeamId } })
  : await raw.team.findFirstOrThrow({ where: { clubId: mister.clubId }, orderBy: { createdAt: "asc" } });

let zicoId: string | null = null;
try {
  const zico = await raw.player.create({
    data: {
      clubId: demoTeam.clubId,
      teamId: demoTeam.id,
      firstName: "Zico",
      lastName: "PerfilQA",
      shirtNumber: 91,
      mainPosition: "AM",
      secondaryPositions: ["CF", "CM"],
      currentRpe: 9,
      injuryHistory: "Esguince de tobillo (QA)",
      academicConstraints: "Exámenes esta semana (QA)",
      strength: "Desmarque al espacio (QA)",
    },
  });
  zicoId = zico.id;
  await raw.player.create({
    data: {
      clubId: demoTeam.clubId,
      teamId: demoTeam.id,
      firstName: "Zinedine",
      lastName: "PerfilQA",
      shirtNumber: 92,
      mainPosition: "CM",
      currentRpe: 3,
    },
  });

  const coachSession = await login("mister@cfmetodo.es", "metodo2025");
  check("login COACH_ADMIN obtiene session-token", !!coachSession);

  const res = await fetch(`${BASE}/dashboard/players`, {
    headers: coachSession ? { cookie: coachSession } : {},
    redirect: "manual",
  });
  const html = await res.text();
  check("GET /dashboard/players → 200", res.status === 200, `status=${res.status}`);
  check("estructura: stats de plantilla intactas", html.includes(">Plantilla<") && html.includes("DISPONIBLES") && html.includes("POLIVALENTES"));
  check("contador CARGA ALTA visible", html.includes("CARGA ALTA"));
  check("filtro de decisión Carga alta (RPE ≥ 8)", html.includes("Carga alta (RPE ≥ 8)"));
  check("alta manual: botón Nuevo jugador presente", html.includes("Añadir jugador nuevo"));
  check("chip RPE 9/10 fatigado en tarjeta", html.includes("RPE 9") && html.includes("/10"));
  check("chip RPE 3/10 fresco en tarjeta", html.includes("RPE 3"));
  check("chip de precaución médica con detalle en title", html.includes("Precaución médica") && html.includes("Esguince de tobillo (QA)"));
  check("chip de carga invisible (académico) con detalle en title", html.includes("Carga invisible") && html.includes("Exámenes esta semana (QA)"));
  check("fortaleza visible en tarjeta", html.includes("Desmarque al espacio (QA)"));
  check("polivalencias visibles (CF y CM)", html.includes("Polivalente:"));
} finally {
  // ─── Limpieza SIEMPRE: jugadores QA + club de prueba ───
  try {
    await raw.player.deleteMany({ where: { lastName: "PerfilQA" } });
    await raw.player.deleteMany({ where: { lastName: "Perfil", clubId: clubA.id } });
    await raw.club.delete({ where: { id: clubA.id } });
    console.log("  🧹 material de prueba eliminado (cascada completa)");
  } catch (e) {
    console.log(`  ⚠️ limpieza: ${e instanceof Error ? e.message.slice(0, 80) : "error"}`);
  }
}

// ============================================================================
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`RESULTADO: ${total - failures}/${total} checks · ${failures} fallidos`);
if (zicoId) console.log(`(zico id limpiado: ${zicoId ? "sí" : "no"})`);
process.exit(failures === 0 ? 0 : 1);
