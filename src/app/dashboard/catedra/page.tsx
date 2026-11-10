// ============================================================================
// PILAR 1 — GESTIÓN DE LA CÁTEDRA GLOBAL /dashboard/catedra
// ----------------------------------------------------------------------------
// EXCLUSIVO de PLATFORM_ADMIN (requirePlatformContext: redirect si no lo es).
// Mantiene la biblioteca GLOBAL (clubId = null): la taxonomía oficial y las
// tareas de la Cátedra que todos los clubs ven en modo lectura y personalizan
// vía "Duplicar a mi club".
// Reutiliza LibraryView en modo plataforma: mismo árbol por fases, mismo
// editor de tareas con recetas — pero el alcance de escritura es global.
// ============================================================================
import { LibraryView } from "@/components/library/library-view";
import type { LibraryData, RecipeLink, SPNode, TaskCard } from "@/components/library/types";
import { requirePlatformContext } from "@/lib/session";
import { parseAnimacionGuardada } from "@/lib/animacion-guardada";

export const dynamic = "force-dynamic";

export default async function CatedraPage() {
  const { db, user } = await requirePlatformContext();

  // Solo contenido global: sin mezcla de clubes. El cliente es base (sin
  // guard de tenant) → los filtros clubId = null son la frontera de alcance.
  const [sps, tasks, links] = await Promise.all([
    db.subPrinciple.findMany({
      where: { clubId: null },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
    db.task.findMany({
      where: { clubId: null },
      orderBy: [{ title: "asc" }],
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { sessions: true } },
      },
    }),
    db.taskSubPrinciple.findMany({
      where: { task: { clubId: null }, subPrinciple: { clubId: null } },
      select: {
        taskId: true,
        subPrincipleId: true,
        relevance: true,
        usageNote: true,
        subPrinciple: { select: { id: true, name: true, phase: true, clubId: true } },
      },
    }),
  ]);

  const subprinciples: SPNode[] = sps.map((s) => ({
    id: s.id,
    clubId: s.clubId,
    parentId: s.parentId,
    phase: s.phase,
    name: s.name,
    description: s.description,
    order: s.order,
    // Los hallazgos del motor son por club: la Cátedra global no los pinta.
    issue: null,
  }));

  const recipesByTask = new Map<string, RecipeLink[]>();
  for (const l of links) {
    const list = recipesByTask.get(l.taskId) ?? [];
    list.push({
      subPrincipleId: l.subPrincipleId,
      relevance: l.relevance,
      usageNote: l.usageNote,
      spName: l.subPrinciple.name,
      spPhase: l.subPrinciple.phase,
      spClubId: l.subPrinciple.clubId,
    });
    recipesByTask.set(l.taskId, list);
  }

  const taskData: TaskCard[] = tasks.map((t) => ({
    id: t.id,
    clubId: t.clubId,
    title: t.title,
    objective: t.objective,
    phases: t.phases,
    spaceLengthM: t.spaceLengthM,
    spaceWidthM: t.spaceWidthM,
    spaceNote: t.spaceNote,
    fieldZoneLabel: t.fieldZoneLabel,
    fieldZoneX: t.fieldZoneX,
    fieldZoneY: t.fieldZoneY,
    videoUrl: t.videoUrl,
    playersMin: t.playersMin,
    playersMax: t.playersMax,
    durationMin: t.durationMin,
    repetitions: t.repetitions,
    intensity: t.intensity,
    rulesOfProvocation: t.rulesOfProvocation,
    coachingPoints: t.coachingPoints,
    materials: t.materials,
    diagramUrl: t.diagramUrl,
    animationData: parseAnimacionGuardada(t.animationData),
    createdByName: t.createdBy?.name ?? null,
    usageCount: t._count.sessions,
    recipes: recipesByTask.get(t.id) ?? [],
  }));

  const data: LibraryData = { subprinciples, tasks: taskData };

  return (
    <main className="min-h-full bg-cream pb-6">
      <LibraryView
        data={data}
        role={user.role}
        platform
        userName={user.name}
      />
    </main>
  );
}
