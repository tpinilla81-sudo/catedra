// ============================================================================
// VALIDACIÓN E2E — PILAR 1 (Biblioteca de Sabiduría) + RBAC
// ----------------------------------------------------------------------------
// 1) Unit: jerarquía de permisos (hasPermission + helpers de dominio).
// 2) Persistencia: Tenant Guard sobre modelos LIBRARY_SCOPED (visibilidad
//    propio + Cátedra global, bloqueo cross-tenant en escritura).
// 3) HTTP: flujo NextAuth por rol → /dashboard/library, /dashboard/catedra.
// Ejecutar: bun scripts/validate-pilar1.ts  (con dev server en :3000)
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { hasPermission, canWriteClubContent, canWriteCatedra, isReadOnlyRole } from "../src/utils/permissions";
import { createTenantClient } from "../src/lib/tenant";
import { writeResults } from "./validation-output";

const PG = "postgresql://postgres:postgres@localhost:5432/metodo";
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

// ---------- 1) RBAC unit ----------
console.log("\n══ 1) RBAC — jerarquía de roles (utils/permissions) ══");
const mk = (role: any, clubId: string | null = "c1") => ({ id: "u", email: "e", name: "n", role, clubId });

check("ANALYST no pasa guard COACH_ADMIN", !hasPermission(mk("ANALYST"), "COACH_ADMIN"));
check("COACH_ADMIN pasa guard COACH_ADMIN", hasPermission(mk("COACH_ADMIN"), "COACH_ADMIN"));
check("COACH_ADMIN pasa guard ANALYST", hasPermission(mk("COACH_ADMIN"), "ANALYST"));
check("PLATFORM_ADMIN pasa guard COACH_ADMIN", hasPermission(mk("PLATFORM_ADMIN"), "COACH_ADMIN"));
check("null no pasa nada", !hasPermission(null, "ANALYST"));
check("ANALYST no escribe contenido de club", !canWriteClubContent(mk("ANALYST")));
check("COACH_ADMIN escribe contenido de club", canWriteClubContent(mk("COACH_ADMIN")));
check("PLATFORM_ADMIN NO escribe contenido de club", !canWriteClubContent(mk("PLATFORM_ADMIN")));
check("PLATFORM_ADMIN escribe Cátedra", canWriteCatedra(mk("PLATFORM_ADMIN", null)));
check("COACH_ADMIN NO escribe Cátedra", !canWriteCatedra(mk("COACH_ADMIN")));
check("ANALYST es solo lectura", isReadOnlyRole(mk("ANALYST")));
check("COACH_ADMIN no es solo lectura", !isReadOnlyRole(mk("COACH_ADMIN")));
check("helpers aceptan rol suelto", canWriteCatedra("PLATFORM_ADMIN") && canWriteClubContent("COACH_ADMIN"));

// ---------- 2) Tenant Guard sobre Biblioteca ----------
console.log("\n══ 2) Tenant Guard — LIBRARY_SCOPED (Task / SubPrinciple) ══");
const raw = new PrismaClient({ datasources: { db: { url: PG } } });

// Club demo (seed) + club intruso efímero
const clubA = await raw.club.findUniqueOrThrow({ where: { slug: "cf-metodo" } });
const clubB = await raw.club.upsert({
  where: { slug: "zz-intruso-test" },
  update: {},
  create: { name: "Club Intruso (test)", slug: "zz-intruso-test" },
});
const intruderSP = await raw.subPrinciple.create({
  data: { clubId: clubB.id, phase: "OFFENSIVE", name: "SP INTRUSO test", order: 999 },
});

const dbA: any = createTenantClient(clubA.id);

const visibleSPs = await dbA.subPrinciple.findMany();
check(
  "club A ve su contenido",
  visibleSPs.some((s: any) => s.clubId === clubA.id),
);
check(
  "club A ve contenido global Cátedra (clubId=null)",
  visibleSPs.some((s: any) => s.clubId === null),
);
check(
  "club A NO ve contenido de club intruso",
  !visibleSPs.some((s: any) => s.clubId === clubB.id),
  `(${visibleSPs.filter((s: any) => s.clubId === clubB.id).length} filtradas mal)`,
);

const intruderTask = await raw.task.create({
  data: { clubId: clubB.id, title: "TASK INTRUSA test", objective: "intrusion", phases: ["OFFENSIVE"], playersMin: 1, durationMin: 10 },
});
const visibleTasks = await dbA.task.findMany();
check("club A NO ve tareas del intruso", !visibleTasks.some((t: any) => t.clubId === clubB.id));

// Escritura cross-tenant debe lanzar
let blocked = false;
try {
  await dbA.task.create({
    data: { clubId: clubB.id, title: "hack", objective: "hack", phases: ["OFFENSIVE"], playersMin: 1, durationMin: 10 } as any,
  });
} catch (e: any) {
  blocked = /Tenant Guard/.test(e?.message ?? "");
}
check("Tenant Guard bloquea create cross-tenant", blocked);

let injected = true;
const created = await dbA.subPrinciple.create({
  data: { phase: "OFFENSIVE", name: "SP club A test" } as any,
});
injected = created.clubId === clubA.id;
check("create sin clubId explícito → inyecta clubId del tenant", injected);

// Relación (TaskSubPrinciple) con scope por relación
const link = await raw.taskSubPrinciple.create({
  data: { taskId: intruderTask.id, subPrincipleId: intruderSP.id, relevance: 3 },
});
const relVisible = await dbA.taskSubPrinciple.findMany({ where: { id: link.id } });
check("TaskSubPrinciple del intruso invisible para club A (scope por relación)", relVisible.length === 0);

// Limpieza del material de prueba
await raw.subPrinciple.delete({ where: { id: created.id } });
await raw.subPrinciple.delete({ where: { id: intruderSP.id } });
await raw.task.delete({ where: { id: intruderTask.id } });
await raw.club.delete({ where: { id: clubB.id } });
console.log("  🧹 material de prueba eliminado");

// ---------- 3) HTTP por rol ----------
console.log("\n══ 3) HTTP — NextAuth + rutas por rol (http://localhost:3000) ══");
const BASE = "http://localhost:3000";

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

const cred = [
  ["COACH_ADMIN", "mister@cfmetodo.es"],
  ["ANALYST", "analista@cfmetodo.es"],
  ["PLATFORM_ADMIN", "plataforma@ecosystem.es"],
] as const;

for (const [label, email] of cred) {
  const session = await login(email, "metodo2025");
  check(`login ${label} obtiene session-token`, !!session);
  if (!session) continue;

  const lib = await GET("/dashboard/library", session);
  const cat = await GET("/dashboard/catedra", session);
  const home = await GET("/", session);

  if (label === "ANALYST") {
    check("ANALYST: /library 200", lib.status === 200);
    check("ANALYST: ve banner 'Solo lectura'", lib.html.includes("Solo lectura"));
    check("ANALYST: NO ve botón '+ Tarea' de cabecera", !lib.html.includes(" Tarea</button>"));
    check("ANALYST: /catedra → redirect a /", cat.status >= 300 && cat.status < 400 && (cat.location ?? "").endsWith("/"));
    check("ANALYST: / 200 (Hoy)", home.status === 200);
  } else if (label === "COACH_ADMIN") {
    check("COACH_ADMIN: /library 200", lib.status === 200);
    check("COACH_ADMIN: ve botón '+ Tarea'", lib.html.includes(" Tarea</button>"));
    check("COACH_ADMIN: /catedra → redirect a /", cat.status >= 300 && cat.status < 400 && (cat.location ?? "").endsWith("/"));
    check("COACH_ADMIN: / 200 (Hoy)", home.status === 200);
    check("COACH_ADMIN: sin banner 'Gestión Plataforma'", !lib.html.includes("Gestión Plataforma"));
  } else {
    check("PLATFORM_ADMIN: / 200 o redirect→/catedra", home.status === 200 || (home.status >= 300 && (home.location ?? "").includes("/dashboard/catedra")));
    check("PLATFORM_ADMIN: /catedra 200", cat.status === 200);
    check("PLATFORM_ADMIN: ve banner 'Gestión Plataforma'", cat.html.includes("Gestión Plataforma"));
    check("PLATFORM_ADMIN: ve botón '+ Tarea'", cat.html.includes(" Tarea</button>"));
    check("PLATFORM_ADMIN: /library → redirect a /", lib.status >= 300 && lib.status < 400 && (lib.location ?? "").endsWith("/"));
  }
}

// Anónimo
const anonLib = await GET("/dashboard/library");
check("anónimo: /library → redirect a /", anonLib.status >= 300 && anonLib.status < 400);
const anonCat = await GET("/dashboard/catedra");
check("anónimo: /catedra → redirect a /", anonCat.status >= 300 && anonCat.status < 400);

await raw.$disconnect();

await writeResults(1, "Biblioteca de Sabiduría + RBAC (Pilar 1)", total, failures, t0, checkLog);

console.log(`\n${failures === 0 ? "🎉 TODO OK — Pilar 1 validado" : `💥 ${failures} fallos`}`);
process.exit(failures === 0 ? 0 : 1);
