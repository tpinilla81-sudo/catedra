"use server";

// ============================================================================
// SERVER ACTIONS — PILAR 1: BIBLIOTECA DE SABIDURÍA (CÁTEDRA)
// ----------------------------------------------------------------------------
// Taxonomía (SubPrinciple) y Catálogo de Tareas (Task) con su motor relacional
// de "recetas" (TaskSubPrinciple, relevancia 1-3).
//
// REGLAS DE ORO (multi-tenant + integridad de la Cátedra):
//   1. El contenido GLOBAL de la Cátedra (clubId = null) es SOLO LECTURA para
//      los clubs. Un usuario de club nunca puede editar/eliminar contenido
//      global — el Tenant Guard solo garantiza VISIBILIDAD (OR: club | null),
//      así que cada mutación valida explícitamente la propiedad del registro.
//   2. "Duplicar a mi club" es la vía oficial para personalizar la Cátedra:
//      crea una copia clubId-scoped con sus recetas/hijos remapeados.
//   3. Una tarea prescrita en microciclos históricos NO se elimina (trazabilidad
//      del motor: SessionTask.prescribedIssueId y el rationale del míster).
//   4. Jerarquía máxima de 2 niveles (subprincipio → detalle) para mantener
//      el árbol legible en tablet y evitar ciclos.
//
// RBAC (jerarquía de roles + propiedad del registro — utils/permissions.ts):
//   • ANALYST        → SOLO LECTURA. Ninguna mutación, ni de club ni global.
//   • COACH_ADMIN    → CRUD completo del contenido PROPIO del club.
//   • PLATFORM_ADMIN → CRUD del contenido GLOBAL de la Cátedra (clubId = null)
//     desde /dashboard/catedra. Nunca toca contenido de un club concreto.
// ============================================================================

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { GamePhase, User } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { createTenantClient } from "@/lib/tenant";
import { db } from "@/lib/db";

// ---------- Tipos públicos ----------

export type RecipeInput = {
  subPrincipleId: string;
  relevance: number; // 1-3
  usageNote: string | null;
};

export type SubPrincipleInput = {
  id?: string; // "" / undefined → crear
  phase: string;
  name: string;
  description: string | null;
  parentId: string | null;
};

export type TaskInput = {
  id?: string; // "" / undefined → crear
  title: string;
  objective: string;
  phases: string[];
  spaceLengthM: number | null;
  spaceWidthM: number | null;
  spaceNote: string | null;
  playersMin: number;
  playersMax: number | null;
  durationMin: number;
  repetitions: string | null;
  intensity: string;
  rulesOfProvocation: string[];
  coachingPoints: string[];
  materials: string[];
  diagramUrl: string | null;
  recipes: RecipeInput[];
};

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

// ---------- Contexto de biblioteca (club o plataforma) ----------

type LibraryContext = {
  user: User;
  /** null → PLATFORM_ADMIN en modo Cátedra (contenido global) */
  clubId: string | null;
  /** Club: cliente con Tenant Guard · Plataforma: cliente base */
  db: ReturnType<typeof createTenantClient>;
};

const MSG_READONLY_ANALYST =
  "Tu rol (Analista) es de solo lectura. Solicita al míster los cambios de la biblioteca.";
const MSG_CATEDRA_READONLY =
  "El contenido oficial de la Cátedra es de solo lectura. Duplica a tu club para personalizarlo.";
const MSG_PLATFORM_NO_CLUB =
  "La Cátedra gestiona contenido global: nunca edita el contenido privado de un club.";

async function requireLibraryContext(): Promise<LibraryContext> {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) redirect("/");

  // Plataforma: PLATFORM_ADMIN gestiona la Cátedra global (sin club).
  if (sessionUser.role === "PLATFORM_ADMIN") {
    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || user.role !== "PLATFORM_ADMIN") redirect("/");
    return { user, clubId: null, db };
  }

  if (!sessionUser.clubId) redirect("/");
  const dbT = createTenantClient(sessionUser.clubId);
  const user = await dbT.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) redirect("/");
  return { user, clubId: sessionUser.clubId, db: dbT };
}

// ---------- Guard de escritura (jerarquía de roles + propiedad) ----------

function writeGuard(
  user: User,
  targetClubId: string | null,
  ctxClubId: string | null,
): string | null {
  // 1) ANALYST: solo lectura en todo el sistema.
  if (user.role === "ANALYST") return MSG_READONLY_ANALYST;
  // 2) Contenido global de la Cátedra: exclusivo de PLATFORM_ADMIN.
  if (targetClubId === null) {
    return user.role === "PLATFORM_ADMIN"
      ? null
      : MSG_CATEDRA_READONLY;
  }
  // 3) Contenido de club: solo el COACH_ADMIN del club dueño.
  if (user.role === "PLATFORM_ADMIN") return MSG_PLATFORM_NO_CLUB;
  return targetClubId === ctxClubId ? null : "No puedes editar contenido de otro club.";
}

function createGuard(user: User, ctxClubId: string | null): string | null {
  // Plataforma: crea contenido global de la Cátedra.
  if (ctxClubId === null) return user.role === "PLATFORM_ADMIN" ? null : MSG_CATEDRA_READONLY;
  // Club: ANALYST no escribe; COACH_ADMIN crea contenido del club.
  if (user.role === "ANALYST") return MSG_READONLY_ANALYST;
  return null;
}

function duplicateGuard(user: User, ctxClubId: string | null): string | null {
  // Duplicar a mi club = crear contenido del club → COACH_ADMIN en contexto club.
  if (ctxClubId === null) return MSG_PLATFORM_NO_CLUB;
  if (user.role === "ANALYST") return MSG_READONLY_ANALYST;
  return null;
}

// ---------- Validadores (mensajes claros en lenguaje de míster) ----------

const PHASES = ["OFFENSIVE", "DEFENSIVE", "OFF_TRANSITION", "DEF_TRANSITION", "SET_PIECE"];
const INTENSITIES = ["LOW", "MEDIUM", "HIGH"];

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function cleanStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function optStr(v: unknown, max: number): string | null {
  const s = cleanStr(v, max);
  return s.length > 0 ? s : null;
}

function optInt(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function reqInt(v: unknown, min: number, max: number): number | null {
  return optInt(v, min, max);
}

function strList(v: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    const s = cleanStr(item, 160);
    if (s.length === 0) continue;
    if (out.includes(s)) continue;
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

// ---------- Revalidación común ----------

function revalidateLibrary() {
  revalidatePath("/dashboard/library");
  revalidatePath("/dashboard/catedra");
  revalidatePath("/dashboard/today");
  revalidatePath("/dashboard/match");
}

// ============================================================================
// TAXONOMÍA — SUBPRINCIPIOS
// ============================================================================

export async function saveSubPrinciple(input: SubPrincipleInput): Promise<ActionResult> {
  const { db, clubId, user } = await requireLibraryContext();

  const name = cleanStr(input.name, 120);
  const description = optStr(input.description, 500);
  const phase = cleanStr(input.phase, 40);
  const parentId = optStr(input.parentId, 64);
  const id = optStr(input.id, 64);

  if (name.length < 3) return fail("El nombre del subprincipio necesita al menos 3 caracteres.");
  if (!PHASES.includes(phase)) return fail("Fase del juego no válida.");
  const phaseEnum = phase as GamePhase;

  // Jerarquía: el padre debe ser raíz (2 niveles máximo), de la misma fase,
  // visible y — en modo plataforma — también contenido global de la Cátedra.
  let parent: { id: string; phase: string; clubId: string | null; parentId: string | null } | null = null;
  if (parentId) {
    parent = await db.subPrinciple.findUnique({
      where: { id: parentId },
      select: { id: true, phase: true, clubId: true, parentId: true },
    });
    if (!parent) return fail("El subprincipio padre no existe.");
    if (parent.clubId !== null && parent.clubId !== clubId)
      return fail("No puedes anidar bajo contenido de otro club.");
    if (clubId === null && parent.clubId !== null)
      return fail("La Cátedra solo organiza contenido global: no puedes anidar bajo contenido de un club.");
    if (parent.phase !== phase)
      return fail("El detalle debe pertenecer a la misma fase del juego que su padre.");
    if (parent.parentId)
      return fail("La jerarquía admite solo 2 niveles: subprincipio → detalle.");
    if (id && id === parent.id)
      return fail("Un subprincipio no puede ser su propio padre.");
  }

  const data = { name, description, parentId: parent ? parent.id : null };

  // ---------- EDICIÓN (RBAC: ANALYST ❌ · club solo lo propio · global solo Cátedra) ----------
  if (id) {
    const row = await db.subPrinciple.findUnique({ where: { id } });
    if (!row) return fail("El subprincipio ya no existe.");
    const denied = writeGuard(user, row.clubId, clubId);
    if (denied) return fail(denied);
    if (row.phase !== phase) return fail("La fase de un subprincipio no se puede cambiar al editar.");

    // Si el nodo tiene hijos, no puede convertirse en detalle de otro.
    const childCount = await db.subPrinciple.count({ where: { parentId: row.id } });
    if (childCount > 0 && parent)
      return fail("Este subprincipio tiene detalles propios y no puede anidarse a su vez.");

    await db.subPrinciple.update({ where: { id: row.id }, data });
    revalidateLibrary();
    return { ok: true, id: row.id };
  }

  // ---------- CREACIÓN (RBAC: ANALYST ❌ · club → propio · plataforma → global) ----------
  const denied = createGuard(user, clubId);
  if (denied) return fail(denied);

  const created = await db.subPrinciple.create({
    // clubId: explícito. En club, el Tenant Guard lo valida; en plataforma
    // (cliente base sin guard) queda null = contenido global de la Cátedra.
    data: { ...data, phase: phaseEnum, clubId },
  });
  revalidateLibrary();
  return { ok: true, id: created.id };
}

export async function deleteSubPrinciple(id: string): Promise<ActionResult> {
  const { db, clubId, user } = await requireLibraryContext();

  const row = await db.subPrinciple.findUnique({ where: { id } });
  if (!row) return fail("El subprincipio ya no existe.");
  const denied = writeGuard(user, row.clubId, clubId);
  if (denied) return fail(denied);

  // Los detalles quedan como raíces (parentId SetNull) y las recetas se
  // desconectan en cascada; los DiagnosisIssue conservan su evidencia (SetNull).
  await db.subPrinciple.delete({ where: { id } });

  revalidateLibrary();
  return { ok: true, id };
}

export async function duplicateSubPrincipleToClub(id: string): Promise<ActionResult> {
  const { db, clubId, user } = await requireLibraryContext();

  const denied = duplicateGuard(user, clubId);
  if (denied) return fail(denied);
  if (!clubId) return fail(MSG_PLATFORM_NO_CLUB);

  const row = await db.subPrinciple.findUnique({ where: { id } });
  if (!row) return fail("El subprincipio ya no existe.");
  if (row.clubId === clubId) return fail("Este subprincipio ya es contenido de tu club.");

  const copy = await db.subPrinciple.create({
    data: {
      phase: row.phase,
      name: row.name,
      description: row.description,
      order: row.order,
    },
  });

  // Copiar también sus detalles (hijos) remapeando el parentId.
  const children = await db.subPrinciple.findMany({ where: { parentId: row.id } });
  for (const child of children) {
    await db.subPrinciple.create({
      data: {
        phase: child.phase,
        name: child.name,
        description: child.description,
        order: child.order,
        parentId: copy.id,
      },
    });
  }

  revalidateLibrary();
  return { ok: true, id: copy.id };
}

// ============================================================================
// CATÁLOGO — TAREAS PROFESIONALES + MOTOR DE RECETAS
// ============================================================================

export async function saveTask(input: TaskInput): Promise<ActionResult> {
  const { db, clubId, user } = await requireLibraryContext();

  const title = cleanStr(input.title, 120);
  const objective = cleanStr(input.objective, 600);
  const spaceNote = optStr(input.spaceNote, 200);
  const repetitions = optStr(input.repetitions, 80);
  const diagramUrl = optStr(input.diagramUrl, 300);
  const intensity = cleanStr(input.intensity, 20);

  const phases = Array.isArray(input.phases)
    ? [...new Set(input.phases.filter((p) => PHASES.includes(p)))]
    : [];
  const rules = strList(input.rulesOfProvocation, 12);
  const points = strList(input.coachingPoints, 12);
  const materials = strList(input.materials, 16);

  const playersMin = reqInt(input.playersMin, 1, 40);
  const playersMax = optInt(input.playersMax, 1, 40);
  const durationMin = reqInt(input.durationMin, 1, 180);
  const spaceLengthM = optInt(input.spaceLengthM, 3, 140);
  const spaceWidthM = optInt(input.spaceWidthM, 3, 140);

  if (title.length < 3) return fail("El título de la tarea necesita al menos 3 caracteres.");
  if (objective.length < 5) return fail("Describe el objetivo de la tarea (mínimo 5 caracteres).");
  if (phases.length === 0) return fail("Marca al menos una fase del juego que trabaja la tarea.");
  if (playersMin === null) return fail("Indica el número mínimo de jugadores (1-40).");
  if (durationMin === null) return fail("Indica la duración sugerida en minutos (1-180).");
  if (playersMax !== null && playersMax < playersMin)
    return fail("El máximo de jugadores no puede ser menor que el mínimo.");
  if (!INTENSITIES.includes(intensity)) return fail("Intensidad no válida.");
  if (diagramUrl && !/^https?:\/\//i.test(diagramUrl))
    return fail("La URL del diagrama debe empezar por http:// o https://");
  if (!rules || !points || !materials)
    return fail("Las listas de reglas, puntos y materiales no son válidas.");

  // ---------- Recetas: validar visibilidad, deduplicar y acotar ----------
  const rawRecipes = Array.isArray(input.recipes) ? input.recipes.slice(0, 12) : [];
  const seen = new Set<string>();
  const recipes: Array<{ subPrincipleId: string; relevance: number; usageNote: string | null }> = [];
  for (const r of rawRecipes) {
    const spId = cleanStr(r?.subPrincipleId, 64);
    const relevance = Math.round(Number(r?.relevance));
    if (!spId || seen.has(spId)) continue;
    if (!Number.isFinite(relevance) || relevance < 1 || relevance > 3)
      return fail("La relevancia de cada receta debe estar entre 1 (apoyo) y 3 (núcleo).");
    const sp = await db.subPrinciple.findUnique({
      where: { id: spId },
      select: { id: true, clubId: true },
    });
    if (!sp) return fail("Uno de los subprincipios conectados ya no existe.");
    if (sp.clubId !== null && sp.clubId !== clubId)
      return fail("No puedes conectar la tarea a subprincipios de otro club.");
    if (clubId === null && sp.clubId !== null)
      return fail("Las tareas de la Cátedra solo se conectan a subprincipios globales de la Cátedra.");
    seen.add(spId);
    recipes.push({
      subPrincipleId: spId,
      relevance: Math.min(3, Math.max(1, relevance)),
      usageNote: optStr(r?.usageNote, 200),
    });
  }

  const data = {
    title,
    objective,
    phases: phases as never,
    spaceLengthM,
    spaceWidthM,
    spaceNote,
    playersMin: playersMin!,
    playersMax,
    durationMin: durationMin!,
    repetitions,
    intensity: intensity as never,
    rulesOfProvocation: rules as never,
    coachingPoints: points as never,
    materials: materials as never,
    diagramUrl,
  };

  // ---------- EDICIÓN (RBAC: ANALYST ❌ · club solo lo propio · global solo Cátedra) ----------
  const id = optStr(input.id, 64);
  if (id) {
    const row = await db.task.findUnique({ where: { id } });
    if (!row) return fail("La tarea ya no existe.");
    const denied = writeGuard(user, row.clubId, clubId);
    if (denied) return fail(denied);

    await db.$transaction([
      db.task.update({ where: { id: row.id }, data }),
      // Recetas: reemplazo atómico de la relación tarea ↔ taxonomía
      db.taskSubPrinciple.deleteMany({ where: { taskId: row.id } }),
      ...(recipes.length
        ? [
            db.taskSubPrinciple.createMany({
              data: recipes.map((r) => ({ ...r, taskId: row.id })),
            }),
          ]
        : []),
    ]);

    revalidateLibrary();
    return { ok: true, id: row.id };
  }

  // ---------- CREACIÓN (RBAC: ANALYST ❌ · club → propio · plataforma → global) ----------
  const denied = createGuard(user, clubId);
  if (denied) return fail(denied);

  const created = await db.task.create({
    data: {
      ...data,
      clubId: clubId, // null → Cátedra global (plataforma) · string → club (guard inyecta)
      createdById: user.id,
      subPrinciples: {
        create: recipes.map((r) => ({
          subPrincipleId: r.subPrincipleId,
          relevance: r.relevance,
          usageNote: r.usageNote,
        })),
      },
    },
  });

  revalidateLibrary();
  return { ok: true, id: created.id };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const { db, clubId, user } = await requireLibraryContext();

  const row = await db.task.findUnique({ where: { id } });
  if (!row) return fail("La tarea ya no existe.");
  const denied = writeGuard(user, row.clubId, clubId);
  if (denied) return fail(denied);

  // Trazabilidad del motor: si la tarea se prescribió en algún microciclo,
  // su historia (rationale, issue prescrito) no se destruye.
  const prescriptions = await db.sessionTask.count({ where: { taskId: id } });
  if (prescriptions > 0) {
    return fail(
      `No se puede eliminar: está prescrita en ${prescriptions} sesión${prescriptions > 1 ? "es" : ""} del histórico del motor.`,
    );
  }

  await db.task.delete({ where: { id } });

  revalidateLibrary();
  return { ok: true, id };
}

export async function duplicateTaskToClub(id: string): Promise<ActionResult> {
  const { db, clubId, user } = await requireLibraryContext();

  const denied = duplicateGuard(user, clubId);
  if (denied) return fail(denied);
  if (!clubId) return fail(MSG_PLATFORM_NO_CLUB);

  const row = await db.task.findUnique({
    where: { id },
    include: { subPrinciples: true },
  });
  if (!row) return fail("La tarea ya no existe.");
  if (row.clubId === clubId) return fail("Esta tarea ya es contenido de tu club.");

  const copy = await db.task.create({
    data: {
      title: row.title,
      objective: row.objective,
      phases: row.phases,
      spaceLengthM: row.spaceLengthM,
      spaceWidthM: row.spaceWidthM,
      spaceNote: row.spaceNote,
      playersMin: row.playersMin,
      playersMax: row.playersMax,
      durationMin: row.durationMin,
      repetitions: row.repetitions,
      intensity: row.intensity,
      rulesOfProvocation: row.rulesOfProvocation,
      coachingPoints: row.coachingPoints,
      materials: row.materials,
      diagramUrl: row.diagramUrl,
      createdById: user.id,
      subPrinciples: {
        create: row.subPrinciples.map((r) => ({
          subPrincipleId: r.subPrincipleId,
          relevance: r.relevance,
          usageNote: r.usageNote,
        })),
      },
    },
  });

  revalidateLibrary();
  return { ok: true, id: copy.id };
}
