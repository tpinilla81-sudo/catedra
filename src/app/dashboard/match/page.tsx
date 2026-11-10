// ============================================================================
// PILAR 3 — INGESTA POST-PARTIDO EXPRÉS /dashboard/match?g=<id>
// ----------------------------------------------------------------------------
// Server Component: carga el partido, la plantilla, (si existe) la ingesta
// previa para edición y los HECHOS DE JUEGO sellados en la pizarra en directo
// (telemetría ACTION). Toda la interacción vive en <IngestFlow> (cliente):
// sub-pestañas Resumen & Semáforo · Vestuario (Notas) · Guardar Datos — la
// pizarra vive globalmente en /dashboard/pizarra (mock del míster).
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
  searchParams: Promise<{ g?: string; tab?: string }>;
}) {
  const { g, tab } = await searchParams;
  const { db, team } = await requireTenantContext();

  if (!g) notFound();

  // Deep-link de sub-pestaña (?tab=locker|data); cualquier otra cosa → resumen
  const initialTab =
    tab === "locker" || tab === "data" ? tab : ("summary" as const);

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

  // Estadísticas REALES del encuentro: hechos de juego (ACTION) sellados en
  // la pizarra en directo / telemetría de la sesión.
  const actionEvents = await db.matchTelemetryEvent.findMany({
    where: { matchId: match.id, type: "ACTION" },
    select: { value: true },
  });
  const actionCounts = actionEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.value] = (acc[e.value] ?? 0) + 1;
    return acc;
  }, {});

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
    <main className="min-h-full bg-cream pb-6">
      <IngestFlow
        match={matchData}
        players={playerData}
        initialReport={initialReport}
        initialTab={initialTab}
        actionCounts={actionCounts}
        telemetryTotal={actionEvents.length}
      />
    </main>
  );
}
