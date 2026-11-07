// ============================================================================
// PILAR 1 — BIBLIOTECA DE SABIDURÍA /dashboard/library
// ----------------------------------------------------------------------------
// Server Component: ensambla la taxonomía (SubPrinciple, jerarquía por fase),
// el catálogo de tareas (Task) y el motor de recetas (TaskSubPrinciple) en una
// sola carga. El Tenant Guard garantiza "propio + Cátedra global"; los datos
// anidados se filtran en JS para blindar el aislamiento multi-tenant.
// También marca qué subprincipios tienen hallazgos ABIERTOS del motor esta
// semana → la biblioteca siempre sabe dónde duele al equipo.
// ============================================================================
import { AppNav } from "@/components/dashboard/app-nav";
import { LibraryView } from "@/components/library/library-view";
import type { LibraryData, RecipeLink, SPNode, TaskCard } from "@/components/library/types";
import { requireTenantContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { db, team, user } = await requireTenantContext();

  const [sps, tasks, links, openIssues] = await Promise.all([
    db.subPrinciple.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
    db.task.findMany({
      orderBy: [{ title: "asc" }],
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { sessions: true } },
      },
    }),
    db.taskSubPrinciple.findMany({
      select: {
        taskId: true,
        subPrincipleId: true,
        relevance: true,
        usageNote: true,
        subPrinciple: { select: { id: true, name: true, phase: true, clubId: true } },
      },
    }),
    // Hallazgos abiertos del equipo activo (microciclo vigente, status OPEN)
    db.diagnosisIssue.findMany({
      where: { status: "OPEN", microcycle: { teamId: team.id } },
      select: { subPrincipleId: true, severity: true, evidence: true },
      orderBy: { severity: "desc" },
    }),
  ]);

  // ---------- Blindaje multi-tenant de datos anidados ----------
  const visible = (clubId: string | null) => clubId === null || clubId === team.clubId;

  const issueBySp = new Map<string, { evidence: string; severity: number }>();
  for (const i of openIssues) {
    if (i.subPrincipleId && !issueBySp.has(i.subPrincipleId)) {
      issueBySp.set(i.subPrincipleId, { evidence: i.evidence, severity: i.severity });
    }
  }

  const subprinciples: SPNode[] = sps
    .filter((s) => visible(s.clubId))
    .map((s) => ({
      id: s.id,
      clubId: s.clubId,
      parentId: s.parentId,
      phase: s.phase,
      name: s.name,
      description: s.description,
      order: s.order,
      issue: issueBySp.get(s.id) ?? null,
    }));

  // Recetas con la info del subprincipio denormalizada (y filtrada por tenant)
  const recipesByTask = new Map<string, RecipeLink[]>();
  for (const l of links) {
    if (!visible(l.subPrinciple.clubId)) continue;
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
    playersMin: t.playersMin,
    playersMax: t.playersMax,
    durationMin: t.durationMin,
    repetitions: t.repetitions,
    intensity: t.intensity,
    rulesOfProvocation: t.rulesOfProvocation,
    coachingPoints: t.coachingPoints,
    materials: t.materials,
    diagramUrl: t.diagramUrl,
    createdByName: t.createdBy?.name ?? null,
    usageCount: t._count.sessions,
    recipes: recipesByTask.get(t.id) ?? [],
  }));

  const data: LibraryData = { subprinciples, tasks: taskData };

  return (
    <main className="min-h-screen bg-zinc-950 pb-28">
      {/* RBAC de presentación: los guards autoritativos viven en cada Server Action */}
      <LibraryView data={data} role={user.role} />
      <AppNav active="library" />
    </main>
  );
}
