// ============================================================================
// API — PILAR 3: SYNC DE VÍDEO · marcador evento ↔ timecode de la grabación
// ----------------------------------------------------------------------------
//   POST /api/pilar3/video-bookmarks
//     { telemetryEventId, videoTimestampSeconds?, videoUrl?, notes? }
//     → upsert (1 marcador por evento). Sin videoTimestampSeconds se calcula
//       con el reloj: (minute · 60) + videoOffsetSeconds de la sesión —
//       sincroniza el vídeo UNA vez y todos los eventos quedan enlazados.
//
// Multi-tenant: clubId de la sesión JWT; el MatchTelemetryEvent se lee con el
// Tenant Guard (un evento de otro club no existe → 404). El bookmark se
// escribe solo con el evento ya validado (hereda club/team/evento).
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createTenantClient } from "@/lib/tenant";
import { MAX_URL_LENGTH, videoSecondsForEvent } from "@/lib/pilar3";

type Body = {
  telemetryEventId?: string;
  videoTimestampSeconds?: number | null;
  videoUrl?: string | null;
  notes?: string | null;
};

const MAX_NOTES = 200;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.clubId) {
    return NextResponse.json(
      { ok: false, error: "Sesión no válida." },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const telemetryEventId =
    typeof body?.telemetryEventId === "string" ? body.telemetryEventId : "";
  if (!telemetryEventId) {
    return NextResponse.json(
      { ok: false, error: "Falta el evento de telemetría." },
      { status: 400 },
    );
  }

  // Segundos de vídeo: manual o calculado con el offset de la sesión
  let seconds: number | null = null;
  if (body?.videoTimestampSeconds !== undefined && body.videoTimestampSeconds !== null) {
    const n = Number(body.videoTimestampSeconds);
    if (!Number.isFinite(n) || n < 0 || n > 60 * 60 * 6) {
      return NextResponse.json(
        { ok: false, error: "Segundo de vídeo fuera de rango." },
        { status: 400 },
      );
    }
    seconds = n;
  }
  let videoUrl: string | null | undefined;
  if (body?.videoUrl !== undefined) {
    videoUrl =
      body.videoUrl && body.videoUrl.trim()
        ? body.videoUrl.trim().slice(0, MAX_URL_LENGTH)
        : null;
  }
  let notes: string | null | undefined;
  if (body?.notes !== undefined) {
    notes = body.notes && body.notes.trim() ? body.notes.trim().slice(0, MAX_NOTES) : null;
  }

  const db = createTenantClient(session.user.clubId);

  // Guard de tenant: un evento de otro club no existe para esta sesión
  const event = await db.matchTelemetryEvent.findUnique({
    where: { id: telemetryEventId },
    select: { id: true, minute: true, teamId: true, matchSessionId: true },
  });
  if (!event) {
    return NextResponse.json(
      { ok: false, error: "Evento no encontrado." },
      { status: 404 },
    );
  }

  if (seconds === null) {
    const live = await db.matchSession.findUnique({
      where: { id: event.matchSessionId },
      select: { videoOffsetSeconds: true },
    });
    seconds = videoSecondsForEvent(event.minute, live?.videoOffsetSeconds ?? 0);
  }

  const bookmarkData = {
    videoTimestampSeconds: seconds,
    ...(videoUrl !== undefined ? { videoUrl } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };

  const bookmark = await db.videoBookmark.upsert({
    where: { telemetryEventId: event.id },
    create: {
      clubId: session.user.clubId,
      teamId: event.teamId,
      telemetryEventId: event.id,
      ...bookmarkData,
    },
    update: bookmarkData,
  });

  return NextResponse.json({
    ok: true,
    bookmark: {
      id: bookmark.id,
      telemetryEventId: bookmark.telemetryEventId,
      videoTimestampSeconds: bookmark.videoTimestampSeconds,
      videoUrl: bookmark.videoUrl,
      notes: bookmark.notes,
    },
  });
}
