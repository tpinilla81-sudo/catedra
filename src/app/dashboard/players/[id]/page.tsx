// ============================================================================
// PILAR 2 — FICHA DE RENDIMIENTO COMPLETA /dashboard/players/[id]
// ----------------------------------------------------------------------------
// Server Component: carga el jugador (Tenant Guard por teamId) y su ficha de
// rendimiento vigente (PlayerEvaluation, mock del míster
// 'PlayerProfileEvaluationView'). Si aún no tiene evaluación, la vista abre
// la plantilla en blanco (todo 5) — guardar la crea por upsert.
// Si la ruta no existe o el jugador es de otro equipo/club → notFound().
// ============================================================================
import { notFound } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { PlayerEvaluationView } from "@/components/players/player-evaluation-view";
import { requireTenantContext } from "@/lib/session";
import { normalizeEvaluationData, type PlayerEvaluationData } from "@/lib/player-evaluation";

export const dynamic = "force-dynamic";

export default async function PlayerEvaluationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, team, user } = await requireTenantContext();

  const player = await db.player.findFirst({
    where: { id, teamId: team.id, isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      shirtNumber: true,
      primaryPosition: true,
    },
  });
  if (!player) notFound();

  const evaluation = await db.playerEvaluation.findUnique({
    where: { playerId: player.id },
    select: { data: true, updatedAt: true },
  });

  // La ficha guardada se re-normaliza (RSC): si el JSON antiguo viniera
  // incompleto, la vista abre sobre la plantilla sin romper nada.
  let initialData: PlayerEvaluationData | null = null;
  try {
    initialData = evaluation ? normalizeEvaluationData(evaluation.data) : null;
  } catch {
    initialData = null;
  }

  // RBAC de presentación: el guard autoritativo vive en la Server Action
  // (savePlayerEvaluation exige COACH_ADMIN+; ANALYST es solo lectura).
  const canWrite = user.role === "COACH_ADMIN" || user.role === "PLATFORM_ADMIN";

  return (
    <AppShell active="players" userName={user.name} role={user.role}>
      <main className="h-full bg-cream overflow-hidden">
        <PlayerEvaluationView
          player={{
            id: player.id,
            firstName: player.firstName,
            lastName: player.lastName,
            shirtNumber: player.shirtNumber,
            primaryPosition: player.primaryPosition,
          }}
          initialData={initialData}
          canWrite={canWrite}
          savedAt={evaluation?.updatedAt.toISOString() ?? null}
        />
      </main>
    </AppShell>
  );
}
