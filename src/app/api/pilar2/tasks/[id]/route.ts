// ============================================================================
// API — PILAR 2: TAREAS TÁCTICAS · ficha individual
// ----------------------------------------------------------------------------
//   GET /api/pilar2/tasks/[id]  → leer la tarea (incluye animationData)
//   PUT /api/pilar2/tasks/[id]  → actualizar (PARCIAL: solo campos presentes;
//                                 animationData ausente = sin cambio, null =
//                                 borrar pizarra, objeto = validar y guardar)
//
// Visibilidad: club → propia + Cátedra global (Tenant Guard; id ajeno → 404).
// Escritura: RBAC de la biblioteca (ANALYST ❌ · club solo lo propio ·
// global solo PLATFORM_ADMIN) — writeGuard compartido con los Server Actions.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  findVisibleTask,
  guardOr,
  json400,
  normalizeTaskPayload,
  resolveApiContext,
  taskJSON,
} from "@/lib/pilar2-api";
import { writeGuard } from "@/lib/library-access";

const BODY_BYTES_MAX = 200_000;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await resolveApiContext();
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;

  const row = await findVisibleTask(auth.db, id, auth.clubId);
  if (!row) return NextResponse.json({ ok: false, error: "Tarea no encontrada." }, { status: 404 });

  return NextResponse.json({ ok: true, task: taskJSON(row) });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const auth = await resolveApiContext();
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  const db = auth.db as PrismaClient;

  const row = await findVisibleTask(auth.db, id, auth.clubId);
  if (!row) return NextResponse.json({ ok: false, error: "Tarea no encontrada." }, { status: 404 });

  // RBAC: mismo guard que el Server Action de edición
  const denied = guardOr(writeGuard(auth.user, row.clubId, auth.clubId));
  if (denied) return denied;

  const text = await req.text().catch(() => "");
  if (text.length === 0) return json400("Body JSON requerido.");
  if (text.length > BODY_BYTES_MAX)
    return NextResponse.json(
      { ok: false, error: "Payload demasiado grande." },
      { status: 413 },
    );
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return json400("Body JSON no válido.");
    body = parsed as Record<string, unknown>;
  } catch {
    return json400("Body JSON no válido.");
  }

  const norm = normalizeTaskPayload(body, { partial: true });
  if ("error" in norm) return norm.error;
  const { data, recipes, recipesProvided } = norm.value;

  // Recetas: validar visibilidad antes de tocar nada (como el editor)
  if (recipesProvided) {
    for (const r of recipes) {
      const sp = await db.subPrinciple.findUnique({
        where: { id: r.subPrincipleId },
        select: { id: true, clubId: true },
      });
      if (!sp) return json400("Uno de los subprincipios conectados ya no existe.");
      if (sp.clubId !== null && sp.clubId !== auth.clubId)
        return json400("No puedes conectar la tarea a subprincipios de otro club.");
      if (auth.clubId === null && sp.clubId !== null)
        return json400("Las tareas de la Cátedra solo se conectan a subprincipios globales.");
    }
  }

  const hayCampos = Object.keys(data).length > 0;
  if (!hayCampos && !recipesProvided)
    return json400("Nada que actualizar: manda algún campo de la ficha.");

  try {
    await db.$transaction([
      ...(hayCampos
        ? [db.task.update({ where: { id: row.id }, data: data as Prisma.TaskUncheckedUpdateInput })]
        : []),
      // Recetas: reemplazo atómico (igual que el editor de ficha)
      ...(recipesProvided
        ? [
            db.taskSubPrinciple.deleteMany({ where: { taskId: row.id } }),
            ...(recipes.length
              ? [
                  db.taskSubPrinciple.createMany({
                    data: recipes.map((r) => ({ ...r, taskId: row.id })),
                  }),
                ]
              : []),
          ]
        : []),
    ]);
  } catch (e) {
    console.error("[api/pilar2/tasks/[id]] PUT", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo actualizar la tarea." },
      { status: 500 },
    );
  }

  const fresh = await findVisibleTask(auth.db, id, auth.clubId);
  if (!fresh)
    return NextResponse.json({ ok: false, error: "Tarea no encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true, task: taskJSON(fresh) });
}
