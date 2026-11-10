// ============================================================================
// MODO COMPACTO & NO-SCROLL — /dashboard/compacto
// ----------------------------------------------------------------------------
// Vista de banquillo (mock del míster): oscura, tipo terminal, sin scroll de
// página. Server Component: carga datos VIVOS de los tres pilares (catálogo
// de tareas con zona/vídeo, plantilla por posición, calendario de partidos)
// y los pasa al cliente. Sin escrituras aquí: los botones "+" llevan a las
// páginas completas (Biblioteca / Plantilla / Partidos).
// ============================================================================
import { CompactoView, type CompactoData } from "@/components/compacto/compacto-view";
import { requireTenantContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CompactoPage() {
  const { db, team } = await requireTenantContext();

  const [tasks, players, matches] = await Promise.all([
    // Catálogo visible: propio + Cátedra global (el Tenant Guard inyecta el OR)
    db.task.findMany({
      orderBy: [{ title: "asc" }],
      select: {
        id: true,
        title: true,
        objective: true,
        phases: true,
        playersMin: true,
        playersMax: true,
        durationMin: true,
        intensity: true,
        fieldZoneLabel: true,
        videoUrl: true,
        spaceLengthM: true,
        spaceWidthM: true,
        clubId: true,
      },
    }),
    db.player.findMany({
      where: { teamId: team.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        shirtNumber: true,
        primaryPosition: true,
      },
    }),
    db.match.findMany({
      where: { teamId: team.id },
      orderBy: [{ kickoffAt: "desc" }],
      take: 30,
      select: {
        id: true,
        opponent: true,
        competition: true,
        isHome: true,
        kickoffAt: true,
        goalsFor: true,
        goalsAgainst: true,
        status: true,
      },
    }),
  ]);

  const data: CompactoData = {
    teamName: team.name,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      objective: t.objective,
      phases: t.phases,
      playersMin: t.playersMin,
      playersMax: t.playersMax,
      durationMin: t.durationMin,
      intensity: t.intensity,
      fieldZoneLabel: t.fieldZoneLabel,
      videoUrl: t.videoUrl,
      spaceLengthM: t.spaceLengthM,
      spaceWidthM: t.spaceWidthM,
      isCatedra: t.clubId === null,
    })),
    players: players
      .map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        number: p.shirtNumber,
        position: p.primaryPosition,
      }))
      // Dorsales primero; los sin dorsal al final por nombre
      .sort(
        (a, b) =>
          (a.number ?? 99) - (b.number ?? 99) || a.name.localeCompare(b.name),
      ),
    matches: matches.map((m) => ({
      id: m.id,
      opponent: m.opponent,
      competition: m.competition,
      isHome: m.isHome,
      kickoffAt: m.kickoffAt.toISOString(),
      goalsFor: m.goalsFor,
      goalsAgainst: m.goalsAgainst,
      played: m.status !== "SCHEDULED",
    })),
  };

  return (
    <main className="min-h-screen bg-slate-950">
      <CompactoView data={data} />
    </main>
  );
}
