// ============================================================================
// PILAR 3 — TABLÓN EN DIRECTO /dashboard/match/live?g=<id>
// ----------------------------------------------------------------------------
// Server Component: carga el partido (con sus evaluaciones y tags previos) y
// la plantilla activa. Toda la interacción vive en <LiveMatchBoard> (cliente):
// pizarra con titulares, banqueta y ficha 1-clic por jugador. Igual que la
// ingesta, la ruta se firma desde Partidos con ?g=<id> para máxima robustez.
// ============================================================================
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Radio } from "lucide-react";
import { AppShell } from "@/components/dashboard/app-shell";
import {
  LiveMatchBoard,
  type LiveEvaluationData,
  type LivePlayerData,
} from "@/components/match/live-match-board";
import { requireTenantContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LiveMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>;
}) {
  const { g } = await searchParams;
  const { db, team, user } = await requireTenantContext();

  if (!g) notFound();

  const match = await db.match.findUnique({
    where: { id: g },
    include: { liveEvaluations: { include: { tags: true } } },
  });
  if (!match || match.teamId !== team.id) notFound();

  const players = await db.player.findMany({
    where: { teamId: team.id, isActive: true },
    orderBy: [{ shirtNumber: "asc" }, { lastName: "asc" }],
  });

  const playerData: LivePlayerData[] = players.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    shirtNumber: p.shirtNumber,
    mainPosition: p.mainPosition,
    secondaryPositions: p.secondaryPositions,
    currentRpe: p.currentRpe,
    injuryHistory: p.injuryHistory,
    academicConstraints: p.academicConstraints,
    strength: p.strength,
    status: p.status,
    statusNote: p.statusNote,
  }));

  const evaluationData: LiveEvaluationData[] = match.liveEvaluations.map((e) => ({
    playerId: e.playerId,
    isStarter: e.isStarter,
    fatigueFlag: e.fatigueFlag,
    clinicalFlag: e.clinicalFlag,
    tacticalFlag: e.tacticalFlag,
    statusUpdatedAt: e.statusUpdatedAt?.toISOString() ?? null,
    tags: e.tags.map((t) => ({
      id: t.id,
      code: t.code,
      type: t.type,
      createdAt: t.createdAt.toISOString(),
    })),
  }));

  return (
    <AppShell active="matches" userName={user.name} role={user.role}>
    <main className="min-h-screen bg-[#0a1a10] pb-28">
      <header className="sticky top-0 z-20 border-b border-[#1c3a26] bg-[#071509]/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <Link
            href="/dashboard/matches"
            className="inline-flex items-center gap-1.5 text-xs text-[#8aa28d] hover:text-[#c3d2c2] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Partidos
          </Link>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-[#8aa28d] leading-tight truncate">
                {format(match.kickoffAt, "EEE d MMM · HH:mm'h'", { locale: es })}
                {match.competition ? ` · ${match.competition}` : ""}
              </p>
              <h1 className="text-2xl font-black text-cream leading-tight truncate">
                {match.isHome ? "vs" : "@"} {match.opponent}
              </h1>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-brand-600/50 bg-brand-600/10 px-3 py-1 text-xs font-bold text-brand-400">
              <Radio className="w-3.5 h-3.5 animate-pulse" aria-hidden /> Directo
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-5">
        <LiveMatchBoard
          matchId={match.id}
          players={playerData}
          initialEvaluations={evaluationData}
        />
        <p className="mt-3 text-xs text-[#6d8070] px-1">
          Cada toque se guarda al instante. Tras el pitido, registra la ingesta
          completa desde Partidos para alimentar al motor.
        </p>
      </div>

    </main>
    </AppShell>
  );
}
