// ============================================================================
// API — PILAR 3: TELEMETRÍA EN DIRECTO · foto completa del partido
// ----------------------------------------------------------------------------
//   GET /api/pilar3/matches/:id/telemetry
//     → { match, session, players, evaluations (estado XI + banquillo),
//         events (línea temporal completa), bookmarks, aggregates }
//
//   Es el endpoint de restauración y refresco del tablón: sobrevive a una
//   recarga, a un cambio de dispositivo o a un segundo móvil del cuerpo
//   técnico — todo se reconstruye desde el servidor en una sola llamada.
//
// Multi-tenant: clubId de la sesión JWT; Match con Tenant Guard (un id de
// otro club → 404). La sesión, eventos y marcadores se leen filtrando
// SIEMPRE por el match ya validado.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createTenantClient } from "@/lib/tenant";
import { sessionElapsedSeconds, type MatchSessionDTO } from "@/lib/pilar3";

type RouteParams = { params: Promise<{ id: string }> };

const MAX_EVENTS = 1000;
const MAX_NOTES = 200;

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.clubId) {
    return NextResponse.json(
      { ok: false, error: "Sesión no válida." },
      { status: 401 },
    );
  }

  const { id: matchId } = await params;
  const db = createTenantClient(session.user.clubId);

  const match = await db.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      teamId: true,
      opponent: true,
      competition: true,
      isHome: true,
      kickoffAt: true,
    },
  });
  if (!match) {
    return NextResponse.json(
      { ok: false, error: "Partido no encontrado." },
      { status: 404 },
    );
  }

  // ---- 1 consulta por pieza, todas indexadas ([matchId, minute] etc.) ----
  const [live, players, evaluations, events, bookmarks] = await Promise.all([
    db.matchSession.findUnique({ where: { matchId: match.id } }),
    db.player.findMany({
      where: { teamId: match.teamId, isActive: true },
      orderBy: [{ shirtNumber: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        shirtNumber: true,
        primaryPosition: true,
        secondaryPositions: true,
      },
    }),
    db.liveMatchEvaluation.findMany({ where: { matchId: match.id } }),
    db.matchTelemetryEvent.findMany({
      where: { matchId: match.id },
      orderBy: [{ minute: "asc" }, { timestamp: "asc" }],
      take: MAX_EVENTS,
      select: {
        id: true,
        playerId: true,
        minute: true,
        timestamp: true,
        type: true,
        value: true,
        coordinatesX: true,
        coordinatesY: true,
      },
    }),
    db.videoBookmark.findMany({
      where: { telemetryEvent: { matchId: match.id } },
      select: {
        id: true,
        telemetryEventId: true,
        videoTimestampSeconds: true,
        videoUrl: true,
        notes: true,
      },
    }),
  ]);

  const sessionDTO: MatchSessionDTO | null = live
    ? {
        id: live.id,
        matchId: live.matchId,
        status: live.status,
        clockBaseSeconds: live.clockBaseSeconds,
        clockStartedAt: live.clockStartedAt?.toISOString() ?? null,
        videoUrl: live.videoUrl,
        videoOffsetSeconds: live.videoOffsetSeconds,
        elapsedSeconds: sessionElapsedSeconds(live),
      }
    : null;

  // ---- Agregados ligeros (en memoria, sin N+1) ----
  const byType: Record<string, number> = { FATIGUE: 0, CLINICAL: 0, TACTICAL: 0, ACTION: 0 };
  const byValue: Record<string, number> = {};
  const perPlayer = new Map<string, { total: number; lastMinute: number }>();
  for (const e of events) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    byValue[e.value] = (byValue[e.value] ?? 0) + 1;
    if (e.playerId) {
      const cur = perPlayer.get(e.playerId) ?? { total: 0, lastMinute: 0 };
      cur.total += 1;
      cur.lastMinute = Math.max(cur.lastMinute, e.minute);
      perPlayer.set(e.playerId, cur);
    }
  }

  return NextResponse.json({
    ok: true,
    match: {
      id: match.id,
      opponent: match.opponent,
      competition: match.competition,
      isHome: match.isHome,
      kickoffAt: match.kickoffAt.toISOString(),
    },
    session: sessionDTO,
    players,
    evaluations: evaluations.map((e) => ({
      playerId: e.playerId,
      isStarter: e.isStarter,
      fatigueFlag: e.fatigueFlag,
      clinicalFlag: e.clinicalFlag,
      tacticalFlag: e.tacticalFlag,
      statusUpdatedAt: e.statusUpdatedAt?.toISOString() ?? null,
    })),
    events: events.map((e) => ({
      id: e.id,
      playerId: e.playerId,
      minute: e.minute,
      timestamp: e.timestamp.toISOString(),
      type: e.type,
      value: e.value.slice(0, MAX_NOTES),
      coordinatesX: e.coordinatesX,
      coordinatesY: e.coordinatesY,
    })),
    bookmarks,
    aggregates: {
      total: events.length,
      byType,
      byValue,
      byPlayer: [...perPlayer.entries()].map(([playerId, v]) => ({
        playerId,
        total: v.total,
        lastMinute: v.lastMinute,
      })),
      bookmarks: bookmarks.length,
    },
  });
}
