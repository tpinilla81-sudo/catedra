// ============================================================================
// PILAR 2 — PLANTILLA /dashboard/players
// ----------------------------------------------------------------------------
// Server Component: carga la plantilla del equipo activo (Tenant Guard) y la
// pasa a la vista táctil. Fricción cero: filtros de 1 toque, tarjetas grandes,
// polivalencias visibles de un vistazo, edición rápida en hoja inferior.
// ============================================================================
import { AppNav } from "@/components/dashboard/app-nav";
import { PlayersView, type PlayerCardData } from "@/components/players/players-view";
import { requireTenantContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const { db, team } = await requireTenantContext();

  const players = await db.player.findMany({
    where: { teamId: team.id, isActive: true },
    orderBy: [{ shirtNumber: "asc" }, { lastName: "asc" }],
  });

  const data: PlayerCardData[] = players.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    shirtNumber: p.shirtNumber,
    mainPosition: p.mainPosition,
    secondaryPositions: p.secondaryPositions,
    technicalRating: p.technicalRating,
    tacticalRating: p.tacticalRating,
    physicalRating: p.physicalRating,
    status: p.status,
    statusNote: p.statusNote,
  }));

  return (
    <main className="min-h-screen bg-zinc-950 pb-28">
      <PlayersView teamName={team.name} players={data} />
      <AppNav active="players" />
    </main>
  );
}
