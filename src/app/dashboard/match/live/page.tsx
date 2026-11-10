// ============================================================================
// PILAR 3 — TABLÓN EN DIRECTO /dashboard/match/live?g=<id>
// ----------------------------------------------------------------------------
// Server Component: carga el partido (evaluaciones y tags previos), la
// plantilla activa, la SESIÓN EN DIRECTO (reloj autoritativo del servidor) y
// los eventos de telemetría ya grabados. Toda la interacción vive en
// <LiveMatchBoard> (cliente): reloj de partido, pizarra con titulares,
// banqueta, ficha 1-toque por jugador, hechos de juego y sync de vídeo.
// La ruta se firma desde Partidos con ?g=<id> para máxima robustez.
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
import {
  sessionElapsedSeconds,
  type MatchSessionDTO,
  type TelemetryEventDTO,
} from "@/lib/pilar3";
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

  const [players, session, events] = await Promise.all([
    db.player.findMany({
      where: { teamId: team.id, isActive: true },
      orderBy: [{ shirtNumber: "asc" }, { lastName: "asc" }],
    }),
    db.matchSession.findUnique({ where: { matchId: match.id } }),
    db.matchTelemetryEvent.findMany({
      where: { matchId: match.id },
      orderBy: [{ minute: "asc" }, { timestamp: "asc" }],
      take: 300,
      select: {
        id: true,
        playerId: true,
        minute: true,
        timestamp: true,
        type: true,
        value: true,
        coordinatesX: true,
        coordinatesY: true,
        coordinatesX2: true,
        coordinatesY2: true,
      },
    }),
  ]);

  const playerData: LivePlayerData[] = players.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    shirtNumber: p.shirtNumber,
    primaryPosition: p.primaryPosition,
    secondaryPositions: p.secondaryPositions,
    fatigueRPE: p.fatigueRPE,
    medicalNotes: p.medicalNotes,
    academicStress: p.academicStress,
    tacticalStrength: p.tacticalStrength || null,
    status: p.status,
    statusNote: p.statusNote,
    technicalRating: p.technicalRating,
    tacticalRating: p.tacticalRating,
    physicalRating: p.physicalRating,
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

  const sessionData: MatchSessionDTO | null = session
    ? {
        id: session.id,
        matchId: session.matchId,
        status: session.status,
        clockBaseSeconds: session.clockBaseSeconds,
        clockStartedAt: session.clockStartedAt?.toISOString() ?? null,
        videoUrl: session.videoUrl,
        videoOffsetSeconds: session.videoOffsetSeconds,
        elapsedSeconds: sessionElapsedSeconds(session),
      }
    : null;

  const eventData: TelemetryEventDTO[] = events.map((e) => ({
    id: e.id,
    playerId: e.playerId,
    minute: e.minute,
    timestamp: e.timestamp.toISOString(),
    type: e.type,
    value: e.value,
    coordinatesX: e.coordinatesX,
    coordinatesY: e.coordinatesY,
    coordinatesX2: e.coordinatesX2,
    coordinatesY2: e.coordinatesY2,
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
          initialSession={sessionData}
          initialEvents={eventData}
        />
        <p className="mt-3 text-xs text-[#6d8070] px-1">
          Cada toque se guarda al instante con el minuto del reloj. Tras el
          pitido, registra la ingesta completa desde Partidos para alimentar al
          motor.
        </p>
      </div>

    </main>
    </AppShell>
  );
}
