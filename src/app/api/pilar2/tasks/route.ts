// ============================================================================
// API — PILAR 2: TAREAS TÁCTICAS · colección
// ----------------------------------------------------------------------------
//   POST /api/pilar2/tasks     → crear tarea (título, objetivo/description,
//                                fases/category, pizarra animada, recetas…)
//   GET  /api/pilar2/tasks     → listar tareas visibles (propia + Cátedra;
//                                en modo plataforma, solo Cátedra global)
//
// Mismas reglas que los Server Actions de la biblioteca (RBAC, multi-tenant,
// validación) — implementadas en src/lib/pilar2-api.ts + library-access.ts.
// La pizarra animada viaja como JSON ligero (fotogramas + coordenadas), nunca
// vídeo: el guard `parseAnimacionGuardada` acota tamaño y estructura.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  findVisibleTaskList,
  guardOr,
  json400,
  normalizeTaskPayload,
  resolveApiContext,
  taskJSON,
} from "@/lib/pilar2-api";
import { createGuard } from "@/lib/library-access";

const BODY_BYTES_MAX = 200_000; // el API rechaza payloads absurdos (413)

export async function POST(req: NextRequest) {
  const ctx = await resolveApiContext();
  if (!ctx.ok) return ctx.res;

  const text = await req.text().catch(() => "");
  if (text.length === 0) return json400("Body JSON requerido.");
  if (text.length > BODY_BYTES_MAX) {
    return NextResponse.json(
      { ok: false, error: "Payload demasiado grande." },
      { status: 413 },
    );
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return json400("Body JSON no válido.");
    body = parsed as Record<string, unknown>;
  } catch {
    return json400("Body JSON no válido.");
  }

  // RBAC de creación (ANALYST ❌ · club → propio · plataforma → global)
  const denied = guardOr(createGuard(ctx.user, ctx.clubId));
  if (denied) return denied;

  const norm = normalizeTaskPayload(body, { partial: false });
  if ("error" in norm) return norm.error;

  // Recetas: validar visibilidad de cada subprincipio (como el editor)
  const recipes: Array<{ subPrincipleId: string; relevance: number; usageNote: string | null }> = [];
  for (const r of norm.value.recipes) {
    const sp = await ctx.db.subPrinciple.findUnique({
      where: { id: r.subPrincipleId },
      select: { id: true, clubId: true },
    });
    if (!sp) return json400("Uno de los subprincipios conectados ya no existe.");
    if (sp.clubId !== null && sp.clubId !== ctx.clubId)
      return json400("No puedes conectar la tarea a subprincipios de otro club.");
    if (ctx.clubId === null && sp.clubId !== null)
      return json400("Las tareas de la Cátedra solo se conectan a subprincipios globales.");
    recipes.push(r);
  }

  try {
    const created = await ctx.db.task.create({
      data: {
        ...(norm.value.data as Prisma.TaskUncheckedCreateInput),
        clubId: ctx.clubId, // null → Cátedra global · string → club (guard valida)
        createdById: ctx.user.id,
        ...(recipes.length ? { subPrinciples: { create: recipes } } : {}),
      },
      include: { subPrinciples: true },
    });
    return NextResponse.json({ ok: true, task: taskJSON(created) }, { status: 201 });
  } catch (e) {
    console.error("[api/pilar2/tasks] POST", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo crear la tarea." },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const ctx = await resolveApiContext();
  if (!ctx.ok) return ctx.res;

  const limitRaw = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.round(limitRaw) : 50));

  const rows = await findVisibleTaskList(ctx.db, ctx.clubId, limit);
  return NextResponse.json({ ok: true, count: rows.length, tasks: rows.map(taskJSON) });
}
