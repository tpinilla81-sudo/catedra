"use client";

// ============================================================================
// PILAR 3 · PIZARRA ESPACIAL CAUSA→EFECTO — tap & arrastre, táctil primero
// ----------------------------------------------------------------------------
// Diseño del míster: pulsa donde se PIERDE el balón (causa) y ARRASTRA hasta
// la consecuencia (efecto). Al soltar aparece la botonera flotante con las 3
// salidas. Cada gesto = 1 evento de telemetría ACTION con vector completo:
//   · coordinatesX/Y  = origen (donde se pierde)
//   · coordinatesX2/Y2 = fin (dónde acaba la consecuencia)
// y su marcador de vídeo (auto-clip -3s/+2s alrededor del instante de la
// CAUSA, capturado al iniciar el gesto) si la sesión tiene vídeo sincronizado.
//
// Soporte táctil real: Pointer Events + setPointerCapture + touch-action:none
// — el mismo gesto funciona con dedo (móvil a pie de campo), ratón y lápiz.
// ============================================================================

import React, { useCallback, useRef, useState } from "react";
import {
  SPATIAL_OUTCOMES,
  actionMeta,
  formatClock,
  videoSecondsForEvent,
  type MatchSessionDTO,
  type TelemetryEventDTO,
} from "@/lib/pilar3";

export type SpatialSaveInput = {
  startX: number; /// origen del vector (causa), 0-100
  startY: number;
  endX: number; /// fin del vector (consecuencia), 0-100
  endY: number;
  outcome: string; /// SHOT_AGAINST · COUNTER_ATTACK · RECOVERED_BALL
  videoSeconds: number | null; /// segundo de vídeo del instante de la causa
};

type SpatialWhiteboardProps = {
  session: MatchSessionDTO | null;
  elapsedSeconds: number; /// reloj del partido (del tablón, autoritativo)
  events: TelemetryEventDTO[]; /// ya filtrados: solo vectores causa→efecto
  saving: boolean;
  onSaveEvent: (input: SpatialSaveInput) => Promise<void>;
};

type Pt = { x: number; y: number };
type MenuState = { origin: Pt; end: Pt; videoSeconds: number | null };

const TONE_CLASSES: Record<string, string> = {
  negative: "bg-red-600/85 hover:bg-red-600",
  neutral: "bg-amber-600/85 hover:bg-amber-600",
  positive: "bg-emerald-600/85 hover:bg-emerald-600",
} as const;

export function SpatialEventWhiteboard({
  session,
  elapsedSeconds,
  events,
  saving,
  onSaveEvent,
}: SpatialWhiteboardProps) {
  const videoUrl = session?.videoUrl ?? null;
  const videoOffset = session?.videoOffsetSeconds ?? 0;

  const videoRef = useRef<HTMLVideoElement>(null);
  const clipStopRef = useRef<((e: Event) => void) | null>(null);

  const [videoTime, setVideoTime] = useState(0);
  const [drag, setDrag] = useState<{ origin: Pt; videoSeconds: number | null } | null>(null);
  const [dragPos, setDragPos] = useState<Pt | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pendingOutcome, setPendingOutcome] = useState<string | null>(null);

  // ---- gesto: origen de la causa -----------------------------------------
  const coordsFromEvent = (e: React.PointerEvent<HTMLDivElement>): Pt => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const c = coordsFromEvent(e);
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // el dedo puede salir del campo
    } catch {
      // navegador sin captura: el gesto sigue dentro del campo
    }
    // El instante de la CAUSA es el que manda para el auto-clip
    const videoSeconds = videoRef.current ? videoRef.current.currentTime : null;
    setDrag({ origin: c, videoSeconds });
    setDragPos(c);
    setMenu(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDragPos(coordsFromEvent(e));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setMenu({ origin: drag.origin, end: coordsFromEvent(e), videoSeconds: drag.videoSeconds });
    setDrag(null);
    setDragPos(null);
  };

  const handlePointerCancel = () => {
    setDrag(null);
    setDragPos(null);
  };

  // ---- confirmación de la consecuencia ------------------------------------
  const handleSelectOutcome = async (outcome: string) => {
    if (!menu || saving || pendingOutcome) return;
    setPendingOutcome(outcome);
    try {
      await onSaveEvent({
        startX: menu.origin.x,
        startY: menu.origin.y,
        endX: menu.end.x,
        endY: menu.end.y,
        outcome,
        videoSeconds: menu.videoSeconds,
      });
      setMenu(null);
    } finally {
      setPendingOutcome(null);
    }
  };

  // ---- reproducción instantánea del auto-clip (-3s / +2s) ------------------
  const playClip = useCallback((start: number, end: number) => {
    const v = videoRef.current;
    if (!v) return;
    if (clipStopRef.current) v.removeEventListener("timeupdate", clipStopRef.current);
    v.currentTime = Math.max(0, start);
    void v.play().catch(() => {
      // autoplay bloqueado: el míster le da a play y el clip continúa
    });
    const stop = () => {
      if (v.currentTime >= end) {
        v.pause();
        v.removeEventListener("timeupdate", stop);
        if (clipStopRef.current === stop) clipStopRef.current = null;
      }
    };
    clipStopRef.current = stop;
    v.addEventListener("timeupdate", stop);
  }, []);

  const busy = saving || pendingOutcome != null;

  return (
    <section
      className="rounded-3xl border border-[#1c3a26] bg-[#0f2317] p-4"
      aria-label="Pizarra espacial causa a efecto"
      data-testid="spatial-board"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#a9bca9]">
          <span aria-hidden>⚽</span> Pizarra espacial · causa → efecto
          {events.length > 0 && (
            <span className="rounded-full border border-[#2a4a34] px-2 py-0.5 text-[10px] font-bold text-[#dfe9d8]">
              {events.length}
            </span>
          )}
        </h4>
        <span className="flex items-center gap-2 text-[10px] text-[#6d8070]">
          {videoUrl ? (
            <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 font-mono text-brand-400">
              vídeo T: {videoTime.toFixed(1)}s
            </span>
          ) : (
            <span className="rounded-full border border-[#2a4a34] px-2 py-0.5 font-mono">
              pizarra pura · {formatClock(elapsedSeconds)}
            </span>
          )}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------- Vídeo sincronizado (si la sesión lo tiene) ---------- */}
        <div className="flex flex-col gap-2">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-[#1c3a26] bg-black">
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                onTimeUpdate={() => setVideoTime(videoRef.current?.currentTime || 0)}
                className="h-full w-full object-contain"
                data-testid="spatial-video"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-xs text-[#6d8070]">
                Sin vídeo sincronizado — Modo pizarra pura: los vectores se sellan
                con el reloj del partido.
              </div>
            )}
          </div>

          {/* ---------- Registros con auto-clip ---------- */}
          <div
            className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-[#1c3a26] bg-[#0a1a10] p-2.5"
            data-testid="spatial-list"
          >
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6d8070]">
              Registros (causa → efecto)
            </span>
            {events.length === 0 ? (
              <p className="text-xs italic text-[#6d8070]">
                Pulsa y arrastra sobre la pizarra para registrar el primer vector.
              </p>
            ) : (
              [...events].reverse().map((ev) => {
                const meta = actionMeta(ev.value);
                return (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between rounded-lg border border-[#1c3a26] bg-[#0f2317] px-2.5 py-1.5 text-xs transition hover:border-[#2a4a34]"
                    data-testid="spatial-row"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-2 h-2 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
                      <span className="truncate font-semibold text-[#dfe9d8]">
                        {meta ? `${meta.emoji} ${meta.label}` : ev.value}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-[#6d8070]">
                        {ev.minute}&prime;
                      </span>
                    </div>
                    {videoUrl && (
                      <button
                        onClick={() =>
                          playClip(
                            Math.max(0, videoSecondsForEvent(ev.minute, videoOffset) - 3),
                            videoSecondsForEvent(ev.minute, videoOffset) + 2,
                          )
                        }
                        className="ml-2 shrink-0 rounded-md bg-brand-600 px-2 py-1 text-[10px] font-bold text-[#0a1a10] transition hover:bg-brand-500"
                        aria-label={`Ver clip del minuto ${ev.minute}`}
                      >
                        ▶ clip −3s/+2s
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ---------- Campo táctil: tap (causa) → arrastre (efecto) ---------- */}
        <div className="flex flex-col gap-2">
          <p className="px-1 text-[11px] text-[#6d8070]">
            Pulsa donde se <strong className="text-[#a9bca9]">pierde el balón</strong> y
            arrastra hasta la <strong className="text-[#a9bca9]">consecuencia</strong>.
          </p>
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            style={{ touchAction: "none" }}
            className="relative aspect-[16/10] w-full cursor-crosshair select-none overflow-hidden rounded-xl border-2 border-emerald-600/40 bg-emerald-950/40 shadow-inner"
            data-testid="spatial-pitch"
            role="application"
            aria-label="Campo para trazar vectores causa a efecto"
          >
            {/* Marcas del terreno */}
            <div className="pointer-events-none absolute inset-3 rounded-lg border border-emerald-500/20" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-500/20" />
            <div className="pointer-events-none absolute left-1/2 top-3 bottom-3 w-px bg-emerald-500/20" />
            <div className="pointer-events-none absolute left-0 top-1/2 h-24 w-12 -translate-y-1/2 border-y border-r border-emerald-500/20" />
            <div className="pointer-events-none absolute right-0 top-1/2 h-24 w-12 -translate-y-1/2 border-y border-l border-emerald-500/20" />

            {/* Vectores históricos causa→efecto */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" data-testid="spatial-svg">
              {events.map((ev) =>
                ev.coordinatesX2 != null && ev.coordinatesY2 != null ? (
                  <g key={ev.id}>
                    <line
                      x1={`${ev.coordinatesX}%`}
                      y1={`${ev.coordinatesY}%`}
                      x2={`${ev.coordinatesX2}%`}
                      y2={`${ev.coordinatesY2}%`}
                      stroke="#ef4444"
                      strokeWidth="2.5"
                      strokeDasharray="5,5"
                    />
                    <circle
                      cx={`${ev.coordinatesX}%`}
                      cy={`${ev.coordinatesY}%`}
                      r="5"
                      fill="#ef4444"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    <circle
                      cx={`${ev.coordinatesX2}%`}
                      cy={`${ev.coordinatesY2}%`}
                      r="4"
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth="1"
                    />
                  </g>
                ) : null,
              )}

              {/* Línea del gesto en curso */}
              {drag && dragPos && (
                <line
                  x1={`${drag.origin.x}%`}
                  y1={`${drag.origin.y}%`}
                  x2={`${dragPos.x}%`}
                  y2={`${dragPos.y}%`}
                  stroke="#7dd3fc"
                  strokeWidth="2"
                  strokeDasharray="3,3"
                />
              )}
            </svg>

            {/* Marcador del origen mientras se arrastra */}
            {drag && (
              <div
                className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-white bg-sky-400"
                style={{ left: `${drag.origin.x}%`, top: `${drag.origin.y}%` }}
              />
            )}

            {/* Botonera flotante: consecuencia instantánea */}
            {menu && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                className="absolute z-30 flex w-56 -translate-x-1/2 -translate-y-1/2 flex-col gap-1.5 rounded-xl border border-[#2a4a34] bg-[#0a1a10]/95 p-2 shadow-2xl backdrop-blur-md"
                style={{
                  left: `${Math.max(18, Math.min(82, menu.end.x))}%`,
                  top: `${Math.max(16, Math.min(84, menu.end.y))}%`,
                }}
                data-testid="spatial-menu"
              >
                <span className="px-1 text-[10px] font-bold uppercase tracking-wider text-[#6d8070]">
                  Consecuencia:
                </span>
                {SPATIAL_OUTCOMES.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => handleSelectOutcome(o.value)}
                    disabled={busy}
                    className={`flex items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50 ${TONE_CLASSES[o.tone]}`}
                    data-testid={`spatial-outcome-${o.value}`}
                  >
                    <span>
                      {o.emoji} {o.label}
                    </span>
                    {pendingOutcome === o.value ? (
                      <span className="text-[10px] opacity-90">guardando…</span>
                    ) : (
                      <span className="text-[10px] opacity-75">{o.hint}</span>
                    )}
                  </button>
                ))}
                <button
                  onClick={() => setMenu(null)}
                  className="mt-1 rounded-md bg-[#1c3a26] py-1 text-center text-[10px] text-[#8aa28d] transition hover:bg-[#2a4a34]"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
