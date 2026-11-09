// ============================================================================
// PILAR 3 — INGESTA POST-PARTIDO EXPRÉS /dashboard/match?g=<id>
// ----------------------------------------------------------------------------
// Server Component: carga el partido, la plantilla y (si existe) la ingesta
// previa para edición. Toda la interacción vive en <IngestFlow> (cliente):
// Paso 1 semáforo + sliders · Paso 2 pizarra táctil · Paso 3 cuaderno.
// Nota: usamos searchParams (?g=<id>) en lugar de segmento dinámico [gameId]
// para máxima robustez de rutas; el enlace se firma desde la página Partidos.
// ============================================================================
import { notFound } from "next/navigation";
import {
  IngestFlow,
  type IngestMatchData,
  type IngestPlayerData,
  type IngestReportData,
} from "@/components/match/ingest-flow";
import { requireTenantContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MatchIngestPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>;
}) {
  const { g } = await searchParams;
  const { db, team } = await requireTenantContext();

  if (!g) notFound();

  const match = await db.match.findUnique({
    where: { id: g },
    include: {
      report: {
        include: { events: true, playerNotes: true },
      },
    },
  });
  if (!match || match.teamId !== team.id) notFound();

  const players = await db.player.findMany({
    where: { teamId: team.id, isActive: true },
    orderBy: [{ shirtNumber: "asc" }, { lastName: "asc" }],
  });

  const matchData: IngestMatchData = {
    id: match.id,
    opponent: match.opponent,
    competition: match.competition,
    isHome: match.isHome,
    kickoffAt: match.kickoffAt.toISOString(),
    status: match.status,
    goalsFor: match.goalsFor,
    goalsAgainst: match.goalsAgainst,
  };

  const playerData: IngestPlayerData[] = players.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    shirtNumber: p.shirtNumber,
    primaryPosition: p.primaryPosition,
  }));

  const initialReport: IngestReportData | null = match.report
    ? {
        sensation: match.report.sensation,
        perceivedLoad: match.report.perceivedLoad,
        collectiveAttitude: match.report.collectiveAttitude,
        tacticalExecution: match.report.tacticalExecution,
        notes: match.report.notes,
        events: match.report.events.map((e) => ({
          x: e.x,
          y: e.y,
          type: e.type,
          playerId: e.playerId,
          minute: e.minute,
        })),
        playerNotes: match.report.playerNotes.map((n) => ({
          playerId: n.playerId,
          flag: n.flag,
          note: n.note,
        })),
      }
    : null;

  return (
    <main className="min-h-screen bg-cream pb-6">
      <IngestFlow match={matchData} players={playerData} initialReport={initialReport} />
    </main>
  );
}
