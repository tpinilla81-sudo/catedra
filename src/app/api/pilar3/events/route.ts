// ============================================================================
// API — PILAR 3: TELEMETRÍA EN DIRECTO · eventos 1-toque + reloj autoritativo
// ----------------------------------------------------------------------------
//   POST /api/pilar3/events
//     { matchId, events?: [...], action?: "START"|"PAUSE"|"RESUME"|"FINISH"|"SET_VIDEO",
//       videoUrl?, videoOffsetSeconds? }
//
//   · Reloj: el cronómetro de verdad vive en el servidor (MatchSession).
//     START crea la sesión; PAUSE/RESUME/FINISH congelan y reanudan; SET_VIDEO
//     guarda el vídeo y el offset de sincronía. Repetir una acción es
//     idempotente (nunca rompe el reloj si ya está en ese estado).
//   · Eventos: 1..MAX_BATCH_EVENTS por llamada. Cada evento se valida fila a
//     fila (sanitizeEventInput) y se minute-stampa con el reloj de la sesión
//     si el cliente no manda minute. Si no hay sesión y llegan eventos, se
//     auto-arranca (cero fricción el día de partido).
//   · Estado: los ejes FATIGUE / CLINICAL / TACTICAL actualizan a la vez la
//     ficha del tablón (LiveMatchEvaluation, el "estado activo" del jugador);
//     ACTION son hechos que se acumulan y no tocan la ficha.
//
// Multi-tenant: clubId SIEMPRE de la sesión JWT; Match y Player se leen con
// el Tenant Guard (un id de otro club → 404). La sesión y los eventos se
// escriben solo con ids ya validados contra el club.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { MatchSession } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { createTenantClient } from "@/lib/tenant";
import {
  CLOCK_ACTIONS,
  FLAG_AXIS_BY_TYPE,
  MAX_BATCH_EVENTS,
  MAX_URL_LENGTH,
  minuteOfElapsed,
  sanitizeEventInput,
  sessionElapsedSeconds,
  type MatchSessionDTO,
  type TelemetryEventDTO,
} from "@/lib/pilar3";

type Body = {
  matchId?: string;
  action?: string;
  videoUrl?: string | null;
  videoOffsetSeconds?: number | null;
  events?: unknown;
};

/** DTO del reloj para el cliente (siempre recalculado en servidor) */
function toSessionDTO(s: MatchSession): MatchSessionDTO {
  return {
    id: s.id,
    matchId: s.matchId,
    status: s.status,
    clockBaseSeconds: s.clockBaseSeconds,
    clockStartedAt: s.clockStartedAt?.toISOString() ?? null,
    videoUrl: s.videoUrl,
    videoOffsetSeconds: s.videoOffsetSeconds,
    elapsedSeconds: sessionElapsedSeconds(s),
  };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.clubId) {
    return NextResponse.json(
      { ok: false, error: "Sesión no válida." },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const matchId = typeof body?.matchId === "string" ? body.matchId : "";
  if (!matchId) {
    return NextResponse.json(
      { ok: false, error: "Falta el partido." },
      { status: 400 },
    );
  }

  const action = body?.action;
  if (action !== undefined && action !== null && !(CLOCK_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json(
      { ok: false, error: "Acción del reloj desconocida." },
      { status: 400 },
    );
  }

  // ---------- Eventos del payload: validación total ANTES de escribir ----------
  const rawEvents = body?.events;
  const list: unknown[] = Array.isArray(rawEvents)
    ? rawEvents
    : rawEvents === undefined || rawEvents === null
      ? []
      : [rawEvents];
  if (list.length > MAX_BATCH_EVENTS) {
    return NextResponse.json(
      { ok: false, error: `Demasiados eventos por llamada (máx. ${MAX_BATCH_EVENTS}).` },
      { status: 400 },
    );
  }
  const sanitized = list.map((e, i) => {
    const ev = sanitizeEventInput(e);
    return ev ? { ev, index: i } : null;
  });
  if (sanitized.some((s) => s === null)) {
    return NextResponse.json(
      { ok: false, error: "Evento de telemetría inválido." },
      { status: 400 },
    );
  }
  const events = sanitized.map((s) => s!.ev);

  // ---------- Contexto tenant ----------
  const db = createTenantClient(session.user.clubId);
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { id: true, teamId: true },
  });
  if (!match) {
    return NextResponse.json(
      { ok: false, error: "Partido no encontrado." },
      { status: 404 },
    );
  }

  // Los jugadores del lote deben ser activos de ESTE equipo (1 query para todo el lote)
  const playerIds = [...new Set(events.map((e) => e.playerId).filter((v): v is string => Boolean(v)))];
  if (playerIds.length > 0) {
    const valid = await db.player.findMany({
      where: { id: { in: playerIds }, teamId: match.teamId, isActive: true },
      select: { id: true },
    });
    if (valid.length !== playerIds.length) {
      return NextResponse.json(
        { ok: false, error: "Un jugador del lote no pertenece a este partido." },
        { status: 400 },
      );
    }
  }

  // ---------- Sesión / reloj autoritativo ----------
  let live = await db.matchSession.findUnique({ where: { matchId: match.id } });
  const now = new Date();

  if (action === "START") {
    if (!live) {
      live = await db.matchSession.create({
        data: {
          clubId: session.user.clubId,
          teamId: match.teamId,
          matchId: match.id,
          status: "LIVE",
          clockStartedAt: now,
          ...(typeof body?.videoUrl === "string" && body.videoUrl.trim()
            ? { videoUrl: body.videoUrl.trim().slice(0, MAX_URL_LENGTH) }
            : {}),
          ...(typeof body?.videoOffsetSeconds === "number" &&
          Number.isFinite(body.videoOffsetSeconds)
            ? { videoOffsetSeconds: Math.max(-7200, Math.min(7200, body.videoOffsetSeconds)) }
            : {}),
        },
      });
    } else if (live.status === "PAUSED") {
      live = await db.matchSession.update({
        where: { id: live.id },
        data: { status: "LIVE", clockStartedAt: now },
      });
    }
    // LIVE / FINISHED: idempotente (no se toca)
  } else if (action === "PAUSE" && live) {
    if (live.status === "LIVE") {
      live = await db.matchSession.update({
        where: { id: live.id },
        data: {
          status: "PAUSED",
          clockBaseSeconds: sessionElapsedSeconds(live),
          clockStartedAt: null,
        },
      });
    }
  } else if (action === "RESUME" && live) {
    if (live.status === "PAUSED") {
      live = await db.matchSession.update({
        where: { id: live.id },
        data: { status: "LIVE", clockStartedAt: now },
      });
    }
  } else if (action === "FINISH" && live) {
    if (live.status !== "FINISHED") {
      live = await db.matchSession.update({
        where: { id: live.id },
        data: {
          status: "FINISHED",
          clockBaseSeconds: sessionElapsedSeconds(live),
          clockStartedAt: null,
        },
      });
    }
  } else if (action === "SET_VIDEO") {
    const videoData: {
      videoUrl?: string | null;
      videoOffsetSeconds?: number;
    } = {};
    if (body?.videoUrl !== undefined) {
      const url = body.videoUrl && body.videoUrl.trim() ? body.videoUrl.trim().slice(0, MAX_URL_LENGTH) : null;
      videoData.videoUrl = url;
    }
    if (typeof body?.videoOffsetSeconds === "number" && Number.isFinite(body.videoOffsetSeconds)) {
      videoData.videoOffsetSeconds = Math.max(-7200, Math.min(7200, body.videoOffsetSeconds));
    }
    if (!live) {
      // Vídeo configurado antes de arrancar el reloj: sesión en pausa a 0
      live = await db.matchSession.create({
        data: {
          clubId: session.user.clubId,
          teamId: match.teamId,
          matchId: match.id,
          status: "PAUSED",
          ...videoData,
        },
      });
    } else {
      live = await db.matchSession.update({ where: { id: live.id }, data: videoData });
    }
  } else if (!live && events.length > 0) {
    // Auto-arranque: el primer toque no puede esperar a que nadie pulse START
    live = await db.matchSession.create({
      data: {
        clubId: session.user.clubId,
        teamId: match.teamId,
        matchId: match.id,
        status: "LIVE",
        clockStartedAt: now,
      },
    });
  }

  if (!live && events.length === 0) {
    return NextResponse.json(
      { ok: false, error: "El reloj de este partido aún no ha arrancado." },
      { status: 409 },
    );
  }
  const liveSession = live as MatchSession;

  // ---------- Escritura de eventos ----------
  const created: TelemetryEventDTO[] = [];
  for (const ev of events) {
    const minute =
      ev.minute ?? minuteOfElapsed(sessionElapsedSeconds(liveSession));
    const row = await db.matchTelemetryEvent.create({
      data: {
        clubId: session.user.clubId,
        teamId: match.teamId,
        matchId: match.id,
        matchSessionId: liveSession.id,
        playerId: ev.playerId,
        minute,
        type: ev.type,
        value: ev.value,
        coordinatesX: ev.coordinatesX,
        coordinatesY: ev.coordinatesY,
        coordinatesX2: ev.coordinatesX2,
        coordinatesY2: ev.coordinatesY2,
      },
    });
    created.push({
      id: row.id,
      playerId: row.playerId,
      minute: row.minute,
      timestamp: row.timestamp.toISOString(),
      type: row.type,
      value: row.value,
      coordinatesX: row.coordinatesX,
      coordinatesY: row.coordinatesY,
      coordinatesX2: row.coordinatesX2,
      coordinatesY2: row.coordinatesY2,
    });

    // Los ejes de estado tocan también la ficha del tablón (estado activo)
    if (ev.playerId && ev.type !== "ACTION") {
      const axis = FLAG_AXIS_BY_TYPE[ev.type];
      const statusData = { [axis]: ev.value, statusUpdatedAt: new Date() };
      await db.liveMatchEvaluation.upsert({
        where: {
          matchId_playerId: { matchId: match.id, playerId: ev.playerId },
        },
        create: {
          matchId: match.id,
          playerId: ev.playerId,
          isStarter: true, // un toque en directo sobre un jugador del once
          ...statusData,
        },
        update: statusData,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    session: toSessionDTO(liveSession),
    created,
  });
}
