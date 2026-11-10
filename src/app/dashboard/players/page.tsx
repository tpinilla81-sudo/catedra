// ============================================================================
// PILAR 2 — PLANTILLA /dashboard/players
// ----------------------------------------------------------------------------
// Server Component: carga la plantilla del equipo activo (Tenant Guard) y la
// pasa a la vista táctil. Fricción cero: filtros de 1 toque, tarjetas grandes,
// polivalencias visibles de un vistazo, edición rápida en hoja inferior.
// ============================================================================
import { AppShell } from "@/components/dashboard/app-shell";
import { PlayersView, type PlayerCardData } from "@/components/players/players-view";
import { requireTenantContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const { db, team, user } = await requireTenantContext();

  const players = await db.player.findMany({
    where: { teamId: team.id, isActive: true },
    orderBy: [{ shirtNumber: "asc" }, { lastName: "asc" }],
  });

  const data: PlayerCardData[] = players.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    shirtNumber: p.shirtNumber,
    primaryPosition: p.primaryPosition,
    secondaryPositions: p.secondaryPositions,
    technicalRating: p.technicalRating,
    tacticalRating: p.tacticalRating,
    physicalRating: p.physicalRating,
    status: p.status,
    statusNote: p.statusNote,
    // --- Perfil pre-partido (decisión del cuerpo técnico) ---
    fatigueRPE: p.fatigueRPE,
    medicalNotes: p.medicalNotes,
    academicStress: p.academicStress,
    tacticalStrength: p.tacticalStrength,
  }));

  return (
    <AppShell active="players" userName={user.name} role={user.role}>
    <main className="min-h-full bg-cream pb-6">
      <PlayersView teamName={team.name} players={data} />
    </main>
    </AppShell>
  );
}
