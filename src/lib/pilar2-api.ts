// ============================================================================
// API PILAR 2 — TAREAS TÁCTICAS (/api/pilar2/tasks) · helpers compartidos
// ----------------------------------------------------------------------------
// Misma lógica de acceso y validación que los Server Actions de la biblioteca
// (src/lib/library-access.ts), pero respondiendo JSON (401/403/404/400) en
// lugar de redirigir. Sirve tanto a la creación (POST) como a la lectura y
// actualización de una tarea (GET/PUT /api/pilar2/tasks/[id]).
//
// Semántica PUT (parcial, pensada para el editor de pizarra):
//   · Solo se actualizan los campos presentes en el body.
//   · animationData ausente → SIN CAMBIO (un PUT de título no borra la pizarra).
//   · animationData null → borrar pizarra · objeto → validar y reemplazar.
//   · recipes presente → reemplazo atómico de recetas (como el editor).
// ============================================================================

import { NextResponse } from "next/server";
import type { PrismaClient, Task, User } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { createTenantClient } from "@/lib/tenant";
import { db as dbBase } from "@/lib/db";
import {
  INTENSITIES,
  PHASES,
  cleanStr,
  createGuard,
  optInt,
  optStr,
  reqInt,
  strList,
  writeGuard,
} from "@/lib/library-access";
import { ANIM_LIMITES, parseAnimacionGuardada } from "@/lib/animacion-guardada";
import { FIELD_ZONE_DEFAULT, FIELD_ZONE_VALUES } from "@/lib/field-zone";

type DbT = ReturnType<typeof createTenantClient>;

type TaskWithRecipes = Task & {
  subPrinciples?: Array<{ subPrincipleId: string; relevance: number; usageNote: string | null }>;
};

export type ApiContext =
  | { ok: true; user: { id: string; role: User["role"]; clubId: string | null }; clubId: string | null; db: DbT | PrismaClient }
  | { ok: false; res: NextResponse };

const MSG_NO_SESSION = "Sesión no válida.";
const MSG_NO_CLUB = "Tu cuenta no está asociada a ningún club.";

/** Contexto de escritura/lectura con los mismos guards que la biblioteca. */
export async function resolveApiContext(): Promise<ApiContext> {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: MSG_NO_SESSION }, { status: 401 }),
    };
  }

  // Plataforma: gestiona el contenido GLOBAL de la Cátedra (clubId = null).
  if (sessionUser.role === "PLATFORM_ADMIN") {
    const user = await dbBase.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || user.role !== "PLATFORM_ADMIN") {
      return {
        ok: false,
        res: NextResponse.json({ ok: false, error: MSG_NO_SESSION }, { status: 401 }),
      };
    }
    return {
      ok: true,
      user: { id: user.id, role: user.role, clubId: null },
      clubId: null,
      db: dbBase,
    };
  }

  if (!sessionUser.clubId) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: MSG_NO_CLUB }, { status: 403 }),
    };
  }
  const dbT = createTenantClient(sessionUser.clubId);
  const user = await dbT.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: MSG_NO_SESSION }, { status: 401 }),
    };
  }
  return {
    ok: true,
    user: { id: user.id, role: user.role, clubId: sessionUser.clubId },
    clubId: sessionUser.clubId,
    db: dbT,
  };
}

export function json400(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

// ---------- Normalización del payload de tarea ----------

export type NormalizedTask = {
  data: Record<string, unknown>; // campos para prisma.task.create/update
  recipes: Array<{ subPrincipleId: string; relevance: number; usageNote: string | null }>;
  recipesProvided: boolean;
};

/**
 * Normaliza y valida el body de una tarea.
 *  · partial=false (POST): todos los campos con defaults sensatos — basta
 *    title + description/category para crear (cero fricción en el API).
 *  · partial=true (PUT): solo los campos presentes en el body.
 * Devuelve { error: Response } o el payload normalizado.
 */
export function normalizeTaskPayload(
  body: Record<string, unknown>,
  opts: { partial: boolean },
): { error: NextResponse } | { value: NormalizedTask } {
  const partial = opts.partial;
  const data: Record<string, unknown> = {};

  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  // ---------- Título / objetivo (alias API: description → objective) ----------
  if (!partial || has("title")) {
    const title = cleanStr(body.title, 120);
    if (title.length < 3) {
      return { error: json400("El título de la tarea necesita al menos 3 caracteres.") };
    }
    data.title = title;
  }
  if (!partial || has("objective") || has("description")) {
    const objective = cleanStr(body.objective ?? body.description, 600);
    if (objective.length < 5) {
      return { error: json400("Describe el objetivo de la tarea (mínimo 5 caracteres).") };
    }
    data.objective = objective;
  }

  // ---------- Fases (alias API: category → phases) ----------
  if (!partial || has("phases") || has("category")) {
    const rawPhases = body.phases ?? body.category;
    const list = Array.isArray(rawPhases)
      ? rawPhases
      : typeof rawPhases === "string"
        ? [rawPhases]
        : [];
    const phases = [...new Set(list.filter((p): p is string => PHASES.includes(p)))];
    if (phases.length === 0) {
      return {
        error: json400(
          `Marca al menos una fase del juego válida: ${PHASES.join(", ")}.`,
        ),
      };
    }
    data.phases = phases;
  }

  // ---------- Espacio ----------
  if (!partial || has("spaceLengthM")) data.spaceLengthM = optInt(body.spaceLengthM, 3, 140);
  if (!partial || has("spaceWidthM")) data.spaceWidthM = optInt(body.spaceWidthM, 3, 140);
  if (!partial || has("spaceNote")) data.spaceNote = optStr(body.spaceNote, 200);

  // ---------- Zona del campo + vídeo real (petición del míster) ----------
  if (!partial || has("fieldZoneLabel")) {
    const rawZone = body.fieldZoneLabel;
    if (rawZone === undefined || rawZone === null || rawZone === "") {
      data.fieldZoneLabel = partial ? null : FIELD_ZONE_DEFAULT;
    } else {
      const zone = cleanStr(rawZone, 40);
      if (!FIELD_ZONE_VALUES.includes(zone)) {
        return {
          error: json400(`Zona del campo no válida. Usa una de: ${FIELD_ZONE_VALUES.join(", ")}.`),
        };
      }
      data.fieldZoneLabel = zone;
    }
  }
  if (!partial || has("fieldZoneX")) data.fieldZoneX = optInt(body.fieldZoneX, 0, 100);
  if (!partial || has("fieldZoneY")) data.fieldZoneY = optInt(body.fieldZoneY, 0, 100);
  if (!partial || has("videoUrl")) {
    const videoUrl = optStr(body.videoUrl, 300);
    if (videoUrl && !/^https?:\/\//i.test(videoUrl)) {
      return { error: json400("La URL del vídeo debe empezar por http:// o https://") };
    }
    data.videoUrl = videoUrl;
  }

  // ---------- Carga (con defaults sensatos en creación: cero fricción) ----------
  if (!partial || has("playersMin")) {
    const playersMin = body.playersMin === undefined ? 10 : reqInt(body.playersMin, 1, 40);
    if (playersMin === null) {
      return { error: json400("Indica el número mínimo de jugadores (1-40).") };
    }
    data.playersMin = playersMin;
  }
  if (!partial || has("playersMax")) {
    const playersMax = optInt(body.playersMax, 1, 40);
    const min = (data.playersMin as number | undefined) ?? playersMax ?? 0;
    if (playersMax !== null && playersMax < min) {
      return { error: json400("El máximo de jugadores no puede ser menor que el mínimo.") };
    }
    data.playersMax = playersMax;
  }
  if (!partial || has("durationMin")) {
    const durationMin = body.durationMin === undefined ? 20 : reqInt(body.durationMin, 1, 180);
    if (durationMin === null) {
      return { error: json400("Indica la duración sugerida en minutos (1-180).") };
    }
    data.durationMin = durationMin;
  }
  if (!partial || has("repetitions")) data.repetitions = optStr(body.repetitions, 80);

  // ---------- Intensidad ----------
  if (!partial || has("intensity")) {
    const intensity = cleanStr(body.intensity ?? "MEDIUM", 20);
    if (!INTENSITIES.includes(intensity)) {
      return { error: json400("Intensidad no válida (LOW, MEDIUM o HIGH).") };
    }
    data.intensity = intensity;
  }

  // ---------- Listas de conocimiento (POST: ausente → [] — cero fricción) ----------
  if (!partial || has("rulesOfProvocation")) {
    const rules = has("rulesOfProvocation") ? strList(body.rulesOfProvocation, 12) : [];
    if (!rules) return { error: json400("La lista de reglas de provocación no es válida.") };
    data.rulesOfProvocation = rules;
  }
  if (!partial || has("coachingPoints")) {
    const points = has("coachingPoints") ? strList(body.coachingPoints, 12) : [];
    if (!points) return { error: json400("La lista de puntos de co-achéo no es válida.") };
    data.coachingPoints = points;
  }
  if (!partial || has("materials")) {
    const materials = has("materials") ? strList(body.materials, 16) : [];
    if (!materials) return { error: json400("La lista de materiales no es válida.") };
    data.materials = materials;
  }
  if (!partial || has("diagramUrl")) {
    const diagramUrl = optStr(body.diagramUrl, 300);
    if (diagramUrl && !/^https?:\/\//i.test(diagramUrl)) {
      return { error: json400("La URL del diagrama debe empezar por http:// o https://") };
    }
    data.diagramUrl = diagramUrl;
  }

  // ---------- Pizarra animada (Json? — la clave del Pilar 2) ----------
  // PUT: ausente → sin cambio · null → borrar · objeto → validar y reemplazar.
  // POST: ausente/null → NULL (la tarea usa la plantilla determinista).
  if (has("animationData")) {
    if (body.animationData === null) {
      data.animationData = null;
    } else {
      const anim = parseAnimacionGuardada(body.animationData);
      if (!anim) {
        return {
          error: json400(
            `La pizarra animada no es válida (máx. ${ANIM_LIMITES.fotogramas} fotogramas × ${ANIM_LIMITES.fichas} fichas, coordenadas 105×68).`,
          ),
        };
      }
      data.animationData = anim;
    }
  }

  // ---------- Recetas (reemplazo completo si vienen) ----------
  let recipes: NormalizedTask["recipes"] = [];
  const recipesProvided = has("recipes") && body.recipes !== undefined;
  if (recipesProvided) {
    if (!Array.isArray(body.recipes)) {
      return { error: json400("La lista de recetas no es válida.") };
    }
    for (const r of body.recipes.slice(0, 12)) {
      const spId = cleanStr((r as Record<string, unknown>)?.subPrincipleId, 64);
      const relevance = Math.round(Number((r as Record<string, unknown>)?.relevance));
      if (!spId) continue;
      if (!Number.isFinite(relevance) || relevance < 1 || relevance > 3) {
        return {
          error: json400("La relevancia de cada receta debe estar entre 1 (apoyo) y 3 (núcleo)."),
        };
      }
      recipes.push({
        subPrincipleId: spId,
        relevance: Math.min(3, Math.max(1, relevance)),
        usageNote: optStr((r as Record<string, unknown>)?.usageNote, 200),
      });
    }
  }

  return { value: { data, recipes, recipesProvided } };
}

// ---------- Lectura con visibilidad de biblioteca ----------

/**
 * Busca una tarea visible para el contexto:
 *  · Club → Tenant Guard (propia + Cátedra global; un id ajeno → 404).
 *  · Plataforma → solo contenido global de la Cátedra.
 */
export async function findVisibleTask(
  db: DbT | PrismaClient,
  id: string,
  clubId: string | null,
): Promise<TaskWithRecipes | null> {
  const row = await (db as PrismaClient).task.findUnique({
    where: { id },
    include: { subPrinciples: true },
  });
  if (!row) return null;
  if (clubId === null && row.clubId !== null) return null; // plataforma solo global
  return row;
}

/** Lista visible: club → propia + Cátedra (Tenant Guard) · plataforma → solo Cátedra global. */
export async function findVisibleTaskList(
  db: DbT | PrismaClient,
  clubId: string | null,
  limit: number,
): Promise<Task[]> {
  return (db as PrismaClient).task.findMany({
    where: clubId === null ? { clubId: null } : undefined,
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

// ---------- Serializer ----------

export function taskJSON(row: TaskWithRecipes) {
  return {
    id: row.id,
    clubId: row.clubId,
    title: row.title,
    objective: row.objective,
    description: row.objective, // alias API (entrada y salida simétricas)
    phases: row.phases,
    category: row.phases[0] ?? null,
    spaceLengthM: row.spaceLengthM,
    spaceWidthM: row.spaceWidthM,
    spaceNote: row.spaceNote,
    fieldZoneLabel: row.fieldZoneLabel,
    fieldZoneX: row.fieldZoneX,
    fieldZoneY: row.fieldZoneY,
    videoUrl: row.videoUrl,
    playersMin: row.playersMin,
    playersMax: row.playersMax,
    durationMin: row.durationMin,
    repetitions: row.repetitions,
    intensity: row.intensity,
    rulesOfProvocation: row.rulesOfProvocation,
    coachingPoints: row.coachingPoints,
    materials: row.materials,
    diagramUrl: row.diagramUrl,
    animationData: row.animationData ?? null,
    subPrinciples: row.subPrinciples?.map((r) => ({
      subPrincipleId: r.subPrincipleId,
      relevance: r.relevance,
      usageNote: r.usageNote,
    })) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------- Guard de RBAC para rutas ----------

export function guardOr(
  guard: string | null,
): NextResponse | null {
  return guard ? NextResponse.json({ ok: false, error: guard }, { status: 403 }) : null;
}
