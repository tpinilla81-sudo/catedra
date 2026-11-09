// ============================================================================
// VALIDACIÓN E2E — PILAR 3 EN DIRECTO (tablón de evaluación 1-clic + ficha rápida)
// ----------------------------------------------------------------------------
// Suite standalone (NO altera los totales canónicos de la batería 261):
// 1) Unit: TACTICAL_TAG_META cubre exactamente el enum TagCode (9 códigos,
//    5 positivos + 4 correctivos), POSITION_SHORT cubre todas las Position y
//    los 3 metas de la FICHA RÁPIDA cubren FatigueFlag (3) / ClinicalFlag (2)
//    / TacticalFlag (2) + niveles RPE (Pilar 2).
// 2) HTTP+Auth: POST /api/matches/:id/evaluations con NextAuth — 401 anónimo,
//    tag 1-clic crea evaluación+tag, segundo tag acumula (misma evaluación),
//    toggle isStarter sin tagCode, ESTADO de la ficha rápida (fatiga/clínico/
//    táctico): fijar, sustituir (último toque gana), apagar con null,
//    valor inválido → 400, tag desconocido → 400, jugador inexistente
//    → 404, jugador de otro equipo → 400, partido de otro club → 404 (guard).
// 3) GET restaura el estado (evaluaciones+tags+flags) del tablón.
// 4) Páginas: /dashboard/match/live?g= propio → 200 con banqueta; ajeno → 404;
//    sin ?g= → 404; /dashboard/matches firma el enlace "Pizarra en directo".
// Idempotente: limpia restos de ejecuciones interrumpidas antes de empezar.
// Ejecutar: bun scripts/validate-live.ts  (dev server :3000, PG :5432)
// ============================================================================
import { PrismaClient, ClinicalFlag, FatigueFlag, TacticalFlag, TagCode } from "@prisma/client";
import { subHours, addDays } from "date-fns";
import {
  ALL_POSITIONS,
  CLINICAL_FLAG_META,
  FATIGUE_FLAG_META,
  POSITION_SHORT,
  RPE_LOAD_META,
  TACTICAL_FLAG_META,
  TACTICAL_TAG_META,
  rpeLoadLevel,
} from "../src/lib/taxonomy";

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

// ---------- Contexto ----------
const clubA = await raw.club.findUniqueOrThrow({ where: { slug: "cf-metodo" } });
const coach = await raw.user.findUniqueOrThrow({ where: { email: "mister@cfmetodo.es" } });

// ============================================================================
console.log("\n══ 0) Limpieza de restos de ejecuciones interrumpidas ══");
// ============================================================================
async function purgeTestData() {
  for (const name of ["Equipo Directo TEST", "Equipo Vecino Directo TEST"]) {
    const leftover = await raw.team.findMany({
      where: { clubId: clubA.id, name },
    });
    for (const t of leftover) {
      await raw.match.deleteMany({ where: { teamId: t.id } }); // cascada evaluaciones+tags
      await raw.player.deleteMany({ where: { teamId: t.id } });
      await raw.team.delete({ where: { id: t.id } });
    }
  }
  const intruder = await raw.club.findUnique({ where: { slug: "zz-intruso-live" } });
  if (intruder) await raw.club.delete({ where: { id: intruder.id } }); // cascada total
}
await purgeTestData();
console.log("  sin restos previos — arranque limpio");

// ============================================================================
console.log("\n══ 1) Unit — vocabulario canónico del tablón ══");
// ============================================================================
const enumCodes = Object.values(TagCode) as string[];
const metaCodes = Object.keys(TACTICAL_TAG_META);
check(
  "TACTICAL_TAG_META cubre exactamente el enum TagCode (9 códigos)",
  enumCodes.length === 9 &&
    metaCodes.length === 9 &&
    enumCodes.every((c) => metaCodes.includes(c)),
  `enum=[${enumCodes.join(",")}] meta=[${metaCodes.join(",")}]`,
);
const positives = Object.values(TACTICAL_TAG_META).filter((m) => m.type === "POSITIVE");
const correctives = Object.values(TACTICAL_TAG_META).filter((m) => m.type === "CORRECTIVE");
check("5 aspectos positivos y 4 correctivos", positives.length === 5 && correctives.length === 4, `${positives.length}/${correctives.length}`);
check("POSITION_SHORT cubre las 15 demarcaciones", ALL_POSITIONS.every((p) => p in POSITION_SHORT));
check("sin etiquetas vacías en el vocabulario", Object.values(TACTICAL_TAG_META).every((m) => m.label.trim().length > 0));

// Vocabulario de la FICHA RÁPIDA (estado en directo): los metas cubren
// EXACTAMENTE los enums nuevos (fuente de verdad servidor + cliente).
const fatigueEnum = Object.values(FatigueFlag) as string[];
check(
  "FATIGUE_FLAG_META cubre exactamente FatigueFlag (3 niveles)",
  fatigueEnum.length === 3 &&
    Object.keys(FATIGUE_FLAG_META).length === 3 &&
    fatigueEnum.every((c) => c in FATIGUE_FLAG_META),
  `enum=[${fatigueEnum.join(",")}]`,
);
const clinicalEnum = Object.values(ClinicalFlag) as string[];
check(
  "CLINICAL_FLAG_META cubre exactamente ClinicalFlag (2 avisos)",
  clinicalEnum.length === 2 &&
    Object.keys(CLINICAL_FLAG_META).length === 2 &&
    clinicalEnum.every((c) => c in CLINICAL_FLAG_META),
);
const tacticalEnum = Object.values(TacticalFlag) as string[];
check(
  "TACTICAL_FLAG_META cubre exactamente TacticalFlag (2 lecturas)",
  tacticalEnum.length === 2 &&
    Object.keys(TACTICAL_FLAG_META).length === 2 &&
    tacticalEnum.every((c) => c in TACTICAL_FLAG_META),
);
check(
  "RPE_LOAD_META cubre los 3 niveles de carga con etiqueta",
  Object.keys(RPE_LOAD_META).length === 3 &&
    (Object.values(RPE_LOAD_META) as Array<{ label: string }>).every((m) => m.label.trim().length > 0) &&
    rpeLoadLevel(10) === "FATIGUED" &&
    rpeLoadLevel(null) === null,
);

// ============================================================================
console.log("\n══ 2) Material de prueba (club A + intruso club B) ══");
// ============================================================================
const seasonA = await raw.season.findFirstOrThrow({
  where: { clubId: clubA.id, isActive: true },
  orderBy: { createdAt: "asc" },
});

const testTeam = await raw.team.create({
  data: { clubId: clubA.id, seasonId: seasonA.id, name: "Equipo Directo TEST" },
});
const neighborTeam = await raw.team.create({
  data: { clubId: clubA.id, seasonId: seasonA.id, name: "Equipo Vecino Directo TEST" },
});

const mkPlayer = (firstName: string, lastName: string, shirtNumber: number, primaryPosition: string, teamId: string) =>
  raw.player.create({
    data: { clubId: clubA.id, teamId, firstName, lastName, shirtNumber, primaryPosition: primaryPosition as never },
  });

const [p9, p10, p11, pRival] = await Promise.all([
  mkPlayer("Iker", "Campos", 9, "CF", testTeam.id),
  mkPlayer("Marco", "Ruiz", 10, "AM", testTeam.id),
  mkPlayer("Leo", "Vega", 11, "LW", testTeam.id),
  mkPlayer("Vecino", "Ajeno", 77, "CB", neighborTeam.id), // mismo club, otro equipo
]);

const testMatch = await raw.match.create({
  data: {
    clubId: clubA.id,
    teamId: testTeam.id,
    opponent: "Rival Directo",
    kickoffAt: subHours(new Date(), 1), // ya rueda: pestaña pendiente + directo
    isHome: true,
  },
});
const upcomingMatch = await raw.match.create({
  data: {
    clubId: clubA.id,
    teamId: testTeam.id,
    opponent: "Rival Próximo",
    kickoffAt: addDays(new Date(), 3),
    isHome: false,
  },
});

// Club intruso con su propio partido (cross-tenant)
const clubB = await raw.club.create({ data: { name: "CD Intruso Live", slug: "zz-intruso-live" } });
const seasonB = await raw.season.create({
  data: {
    clubId: clubB.id,
    name: "T TEST",
    startDate: new Date(2026, 0, 1),
    endDate: new Date(2026, 11, 31),
  },
});
const teamB = await raw.team.create({
  data: { clubId: clubB.id, seasonId: seasonB.id, name: "Intruso Live" },
});
const matchB = await raw.match.create({
  data: { clubId: clubB.id, teamId: teamB.id, opponent: "Rival Intruso", kickoffAt: new Date(), isHome: true },
});

console.log(`  club A equipo ${testTeam.name} · ${matchB.opponent} en club B listo`);

// ============================================================================
console.log("\n══ 3) HTTP+Auth — API de evaluaciones en directo ══");
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

async function http(
  method: "GET" | "POST",
  path: string,
  session?: string,
  body?: unknown,
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(session ? { cookie: session } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML u otro */
  }
  return { status: res.status, json, text };
}

const EVALS = (matchId: string) => `/api/matches/${matchId}/evaluations`;

const anonPost = await http("POST", EVALS(testMatch.id), undefined, { playerId: p9.id, tagCode: "GOOD_UNMARKED" });
check("anónimo: POST evaluación → 401", anonPost.status === 401, `status=${anonPost.status}`);

const anonGet = await http("GET", EVALS(testMatch.id));
check("anónimo: GET evaluaciones → 401", anonGet.status === 401, `status=${anonGet.status}`);

const coachSession = await login("mister@cfmetodo.es", "metodo2025");
check("login COACH_ADMIN obtiene session-token", !!coachSession);

if (coachSession) {
  const originalLastTeam = coach.lastTeamId;
  await raw.user.update({ where: { id: coach.id }, data: { lastTeamId: testTeam.id } });

  // --- Tag 1: crea evaluación + tag ---
  const t1 = await http("POST", EVALS(testMatch.id), coachSession, {
    playerId: p9.id,
    isStarter: false,
    tagCode: "GOOD_UNMARKED",
  });
  const t1body = t1.json as { ok?: boolean; evaluation?: { id: string; isStarter: boolean; totalTags: number }; tag?: { code: string; type: string } } | null;
  check("tag 1: POST → 200 ok", t1.status === 200 && t1body?.ok === true, `status=${t1.status} body=${JSON.stringify(t1body)}`);
  check("tag 1: crea evaluación con 1 anotación", t1body?.evaluation?.totalTags === 1);
  check("tag 1: tipo POSITIVE lo decide el servidor", t1body?.tag?.type === "POSITIVE");

  // --- Tag 2: misma evaluación, acumula ---
  const t2 = await http("POST", EVALS(testMatch.id), coachSession, {
    playerId: p9.id,
    tagCode: "NO_PRESS",
  });
  const t2body = t2.json as { evaluation?: { id: string; totalTags: number }; tag?: { type: string } } | null;
  check("tag 2: acumula sobre la MISMA evaluación (1 por jugador/partido)", t2body?.evaluation?.id === t1body?.evaluation?.id && t2body?.evaluation?.totalTags === 2);
  check("tag 2: correctivo tipado CORRECTIVE en servidor", t2body?.tag?.type === "CORRECTIVE");

  // --- Toggle alineación sin tagCode ---
  const t3 = await http("POST", EVALS(testMatch.id), coachSession, {
    playerId: p9.id,
    isStarter: true,
  });
  const t3body = t3.json as { evaluation?: { id: string; isStarter: boolean; totalTags: number } } | null;
  check("toggle titular: isStarter=true sin crear tag", t3body?.evaluation?.isStarter === true && t3body?.evaluation?.totalTags === 2);

  // --- FICHA RÁPIDA: estado en directo (1 toque, último toque gana) ---
  // (la pizarra siempre reenvía isStarter junto al estado, igual que aquí)
  const f1 = await http("POST", EVALS(testMatch.id), coachSession, {
    playerId: p9.id,
    isStarter: true,
    fatigueFlag: "EXHAUSTED",
  });
  const f1body = f1.json as { evaluation?: { fatigueFlag?: string | null; statusUpdatedAt?: string | null } } | null;
  check(
    "ficha rápida: 🔴 EXHAUSTED fija fatiga + marca de tiempo",
    f1.status === 200 && f1body?.evaluation?.fatigueFlag === "EXHAUSTED" && !!f1body?.evaluation?.statusUpdatedAt,
    `status=${f1.status} body=${JSON.stringify(f1body)}`,
  );

  const f2 = await http("POST", EVALS(testMatch.id), coachSession, {
    playerId: p9.id,
    isStarter: true,
    fatigueFlag: "HEAVY",
  });
  const f2body = f2.json as { evaluation?: { fatigueFlag?: string | null } } | null;
  check("ficha rápida: 🟡 sustituye al toque anterior (el último manda)", f2body?.evaluation?.fatigueFlag === "HEAVY");

  const f3 = await http("POST", EVALS(testMatch.id), coachSession, {
    playerId: p9.id,
    isStarter: true,
    fatigueFlag: null,
  });
  const f3body = f3.json as { evaluation?: { fatigueFlag?: string | null } } | null;
  check("ficha rápida: null explícito apaga el semáforo (toggle)", f3body?.evaluation?.fatigueFlag === null);

  const f4 = await http("POST", EVALS(testMatch.id), coachSession, {
    playerId: p9.id,
    fatigueFlag: "MEDIO",
  });
  check("ficha rápida: valor no canónico → 400", f4.status === 400, `status=${f4.status}`);

  // --- Validaciones ---
  const badTag = await http("POST", EVALS(testMatch.id), coachSession, { playerId: p9.id, tagCode: "CEPILLO_DIENTES" });
  check("tag desconocido → 400", badTag.status === 400, `status=${badTag.status}`);
  const noPlayer = await http("POST", EVALS(testMatch.id), coachSession, { tagCode: "GOOD_UNMARKED" });
  check("sin playerId → 400", noPlayer.status === 400);
  const ghostPlayer = await http("POST", EVALS(testMatch.id), coachSession, { playerId: "cuid-fantasma-000", tagCode: "GOOD_UNMARKED" });
  check("jugador inexistente → 404", ghostPlayer.status === 404, `status=${ghostPlayer.status}`);
  const rivalPlayer = await http("POST", EVALS(testMatch.id), coachSession, { playerId: pRival.id, tagCode: "GOOD_UNMARKED" });
  check("jugador de otro equipo (mismo club) → 400", rivalPlayer.status === 400, `status=${rivalPlayer.status}`);
  const foreignMatch = await http("POST", EVALS(matchB.id), coachSession, { playerId: p9.id, tagCode: "GOOD_UNMARKED" });
  check("partido de otro club → 404 (Tenant Guard)", foreignMatch.status === 404, `status=${foreignMatch.status}`);

  // --- GET restaura el estado ---
  const get1 = await http("GET", EVALS(testMatch.id), coachSession);
  const get1body = get1.json as {
    ok?: boolean;
    evaluations?: Array<{
      playerId: string;
      isStarter: boolean;
      fatigueFlag: string | null;
      clinicalFlag: string | null;
      tacticalFlag: string | null;
      tags: Array<{ code: string }>;
    }>;
  } | null;
  check(
    "GET: 1 evaluación con 2 tags y titular restaurado",
    get1.status === 200 &&
      get1body?.ok === true &&
      get1body?.evaluations?.length === 1 &&
      get1body?.evaluations?.[0]?.tags?.length === 2 &&
      get1body?.evaluations?.[0]?.isStarter === true,
  );
  check(
    "GET: la ficha rápida de 9 vuelve vacía tras el toggle (estado restaurado)",
    get1body?.evaluations?.[0]?.fatigueFlag === null &&
      get1body?.evaluations?.[0]?.clinicalFlag === null &&
      get1body?.evaluations?.[0]?.tacticalFlag === null,
  );

  // Dos ejes a la vez en un jugador distinto (clínico + táctico)
  const f5 = await http("POST", EVALS(testMatch.id), coachSession, {
    playerId: p10.id,
    isStarter: true,
    clinicalFlag: "MINOR",
    tacticalFlag: "EXPLOITING",
  });
  const f5body = f5.json as { evaluation?: { clinicalFlag?: string | null; tacticalFlag?: string | null } } | null;
  check(
    "ficha rápida: clínico y táctico se fijan juntos sin pisarse",
    f5body?.evaluation?.clinicalFlag === "MINOR" && f5body?.evaluation?.tacticalFlag === "EXPLOITING",
    `body=${JSON.stringify(f5body)}`,
  );

  // --- Segundo jugador independiente ---
  const p10tag = await http("POST", EVALS(testMatch.id), coachSession, {
    playerId: p10.id,
    isStarter: true,
    tagCode: "FATIGUE_NOTICED",
  });
  const get2 = await http("GET", EVALS(testMatch.id), coachSession);
  const get2body = get2.json as {
    evaluations?: Array<{ playerId: string; tags: unknown[]; clinicalFlag: string | null; tacticalFlag: string | null }>;
  } | null;
  const p10Eval = get2body?.evaluations?.find((e) => e.playerId === p10.id);
  check(
    "segundo jugador: evaluación independiente + sus flags restaurados",
    p10tag.status === 200 && get2body?.evaluations?.length === 2 && p10Eval?.clinicalFlag === "MINOR" && p10Eval?.tacticalFlag === "EXPLOITING",
  );

  await raw.user.update({ where: { id: coach.id }, data: { lastTeamId: originalLastTeam } });
}

// ============================================================================
console.log("\n══ 4) Páginas — tablón en directo y entrada desde Partidos ══");
// ============================================================================
const coachSession2 = await login("mister@cfmetodo.es", "metodo2025");
if (coachSession2) {
  const originalLastTeam = coach.lastTeamId;
  await raw.user.update({ where: { id: coach.id }, data: { lastTeamId: testTeam.id } });

  const livePage = await http("GET", `/dashboard/match/live?g=${testMatch.id}`, coachSession2);
  check("COACH: /dashboard/match/live?g= → 200", livePage.status === 200, `status=${livePage.status}`);
  check(
    "tablón: partido, terreno y banqueta en la página",
    livePage.text.includes("Rival Directo") && livePage.text.includes("Banqueta de suplentes") && livePage.text.includes("Terreno de juego"),
  );
  check("tablón: restauración SSR del estado (9 y 10 con anotaciones)", livePage.text.includes("Iker") && livePage.text.includes("Marco"));

  const foreignLive = await http("GET", `/dashboard/match/live?g=${matchB.id}`, coachSession2);
  check("seguridad: tablón del partido del intruso → 404", foreignLive.status === 404, `status=${foreignLive.status}`);

  const noParam = await http("GET", "/dashboard/match/live", coachSession2);
  check("diseño: /dashboard/match/live sin ?g= → 404", noParam.status === 404, `status=${noParam.status}`);

  const matchesPage = await http("GET", "/dashboard/matches", coachSession2);
  check(
    "matches: tarjeta pendiente firma la Pizarra en directo",
    matchesPage.text.includes(`/dashboard/match/live?g=${testMatch.id}`),
  );
  check(
    "matches: tarjeta próxima también firma la Pizarra en directo",
    matchesPage.text.includes(`/dashboard/match/live?g=${upcomingMatch.id}`),
  );
  check("matches: el enlace canónico a la ingesta sigue intacto", matchesPage.text.includes(`/dashboard/match?g=${testMatch.id}`));

  await raw.user.update({ where: { id: coach.id }, data: { lastTeamId: originalLastTeam } });
}

// ============================================================================
console.log("\n══ 🧹 Limpieza del material de prueba ══");
// ============================================================================
await raw.match.deleteMany({ where: { teamId: { in: [testTeam.id, neighborTeam.id] } } });
await raw.player.deleteMany({ where: { teamId: { in: [testTeam.id, neighborTeam.id] } } });
await raw.team.deleteMany({ where: { id: { in: [testTeam.id, neighborTeam.id] } } });
await raw.club.delete({ where: { id: clubB.id } }); // cascada total
console.log("  material de prueba eliminado (cascada completa)");

// ============================================================================
// Suite standalone: NO escribe en scripts/validation-results/pilar*.json para
// no alterar los totales canónicos (261 checks) del panel /dashboard/quality.
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`RESULTADO: ${total - failures}/${total} checks · ${failures} fallidos`);
process.exit(failures === 0 ? 0 : 1);
