"use client";

// ============================================================================
// PILAR 3 — ANÁLISIS DINÁMICO EN DIRECTO // CRONÓMETRO & SECCIONES RÁPIDAS
// (mock del míster 'LiveChronometerAnalysisView')
// ----------------------------------------------------------------------------
// Registro instantáneo sin soltar el móvil: botonera de 4 secciones tácticas
// (⚽ Ofensiva · 🛡️ Defensiva · 🚩 A.B.P. · ⚡ Transición) con catálogo propio
// de eventos por sección; un toque registra el evento sellado con el minuto
// AUTORITATIVO del reloj del tablón (MatchSession vía POST /api/pilar3/events
// — no se duplica la máquina del reloj) y, si hay vídeo activo, guarda el
// segundo exacto del instante para el auto-clip −3s/+2s. Los eventos
// persisten como ACTION (texto libre ≤140) en MatchTelemetryEvent: aparecen
// en la línea temporal del tablón y los lee la ingesta post-partido.
// El blob local manda sobre la URL de la sesión (mismo criterio que la
// pizarra espacial). Paleta vestuario nocturno de la casa (#0a1a10/#0f2317),
// nada del slate del mock.
// ============================================================================

import { useCallback, useMemo, useRef, useState } from "react";
import { formatClock, type MatchSessionDTO } from "@/lib/pilar3";
import { parseVideoUrl } from "@/lib/video-url";

/// 📂 Vídeo cargado del ordenador del míster (blob local, nunca se sube)
type LocalVideoFile = { src: string; name: string };

export type QuickSaveInput = {
  sectionLabel: string; /// ID de la sección (OFENSIVA · DEFENSIVA · ABP · TRANSICION), como el chip del mock
  eventLabel: string; /// etiqueta EXACTA del catálogo (ACTION, texto libre ≤140)
  videoSeconds: number | null; /// segundo de vídeo del instante del registro
};

export type QuickEventRow = {
  id: string; /// id del MatchTelemetryEvent creado
  minute: number; /// minuto autoritativo del reloj
  clockText: string; /// mm:ss capturado al registrar (formato del mock)
  label: string;
  sectionLabel: string;
  videoSeconds: number | null;
};

type QuickSectionId = "OFENSIVA" | "DEFENSIVA" | "ABP" | "TRANSICION";

const QUICK_SECTIONS: {
  id: QuickSectionId;
  label: string;
  hint: string;
  emoji: string;
  active: string;
  dot: string;
}[] = [
  {
    id: "OFENSIVA",
    label: "Ofensiva",
    hint: "Construcción & Ataque",
    emoji: "⚽",
    active: "bg-brand-600 text-cream border-brand-600 shadow-lg",
    dot: "bg-brand-400",
  },
  {
    id: "DEFENSIVA",
    label: "Defensiva",
    hint: "Pressing & Bloque",
    emoji: "🛡️",
    active: "bg-[#c62f32] text-cream border-[#c62f32] shadow-lg",
    dot: "bg-[#e05252]",
  },
  {
    id: "ABP",
    label: "A.B.P.",
    hint: "Balón Parado",
    emoji: "🚩",
    active: "bg-[#e3a93c] text-[#0a1a10] border-[#e3a93c] shadow-lg",
    dot: "bg-[#e3a93c]",
  },
  {
    id: "TRANSICION",
    label: "Transición",
    hint: "Ataque / Defensa",
    emoji: "⚡",
    active: "bg-[#8b5cf6] text-cream border-[#8b5cf6] shadow-lg",
    dot: "bg-[#a78bfa]",
  },
];

/// Catálogo EXACTO del mock, sección a sección
const QUICK_CATALOGS: Record<QuickSectionId, string[]> = {
  OFENSIVA: [
    "Salida de Balón Bajo Presión",
    "Pase Filtrado / Ruptura de Líneas",
    "Creación en 3/4 de Cancha",
    "Centro Lateral y Remate",
    "Ataque Posicional / Amplitud",
  ],
  DEFENSIVA: [
    "Pressing Alto / Robo en Campo Rival",
    "Bloque Medio / Basculación Correcta",
    "Defensa de Área / Despeje",
    "Duelo Aéreo Defensivo Ganado",
    "Interrupción / Falta Táctica Defensiva",
  ],
  ABP: [
    "Córner a Favor (Primer/Segundo Palo)",
    "Córner en Contra / Despeje",
    "Falta Lateral / Central Directa",
    "Saque de Banda en Largo",
  ],
  TRANSICION: [
    "Reacción Rápida Tras Pérdida (Counter-press)",
    "Contraataque / Transición Ofensiva Veloz",
    "Repliegue Intensivo / Reorganización",
  ],
};

type QuickChronoBoardProps = {
  session: MatchSessionDTO | null;
  elapsedSeconds: number; /// reloj del partido (del tablón, autoritativo)
  saving: boolean;
  rows: QuickEventRow[]; /// historial en directo (más reciente primero)
  onSaveEvent: (input: QuickSaveInput) => Promise<void>;
  localVideo: LocalVideoFile | null;
  /// Dispara el selector de archivos del tablero (un solo picker, un solo estado)
  onPickLocalVideo: () => void;
};

export function QuickChronoBoard({
  session,
  elapsedSeconds,
  saving,
  rows,
  onSaveEvent,
  localVideo,
  onPickLocalVideo,
}: QuickChronoBoardProps) {
  const [activeSection, setActiveSection] = useState<QuickSectionId>("OFENSIVA");

  const videoRef = useRef<HTMLVideoElement>(null);
  const clipStopRef = useRef<((e: Event) => void) | null>(null);

  // ---- vídeo activo: blob local manda; si no, mp4 directo de la sesión ----
  // (YouTube queda para la pizarra espacial: aquí el mock es MP4-first)
  const directUrl = useMemo(() => {
    if (localVideo) return localVideo.src;
    const parsed = parseVideoUrl(session?.videoUrl ?? null);
    return parsed?.kind === "direct" ? parsed.url : null;
  }, [localVideo, session?.videoUrl]);

  const getVideoTime = (): number | null => {
    const v = videoRef.current;
    if (!v || !directUrl || !Number.isFinite(v.currentTime)) return null;
    return Math.round(v.currentTime * 10) / 10;
  };

  // ---- reproducción instantánea del auto-clip (−3s / +2s) ------------------
  const playClip = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    const start = Math.max(0, seconds - 3);
    const end = seconds + 2;
    if (clipStopRef.current) v.removeEventListener("timeupdate", clipStopRef.current);
    v.currentTime = start;
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

  const sectionMeta = QUICK_SECTIONS.find((s) => s.id === activeSection)!;
  const catalog = QUICK_CATALOGS[activeSection];

  const register = async (eventLabel: string) => {
    await onSaveEvent({
      sectionLabel: sectionMeta.id, /// el chip del mock muestra el ID crudo (ABP)
      eventLabel,
      videoSeconds: getVideoTime(),
    });
  };

  return (
    <section
      className="rounded-3xl border border-[#1c3a26] bg-[#0f2317] p-4"
      aria-label="Análisis dinámico en directo"
      data-testid="quick-board"
    >
      {/* cabecera: título + reloj del partido (autoritativo, sin controles duplicados) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-400" aria-hidden />
          <h2 className="text-sm font-bold text-[#dfe9d8]">
            Análisis Dinámico <span className="text-[#8aa28d]">// Cronómetro &amp; Secciones</span>
          </h2>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#1c3a26] bg-[#0a1a10] px-3 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8aa28d]">
            Partido:
          </span>
          <span
            className="font-mono text-sm font-bold tracking-wider text-brand-400"
            data-testid="quick-clock"
          >
            {formatClock(elapsedSeconds)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* ---------- columna izquierda: vídeo + historial ---------- */}
        <div className="flex flex-col gap-3 lg:col-span-5">
          <div className="relative w-full overflow-hidden rounded-xl border border-[#1c3a26] bg-black shadow-inner">
            {directUrl ? (
              <video
                ref={videoRef}
                src={directUrl}
                controls
                playsInline
                className="aspect-video w-full object-contain"
                data-testid="quick-video"
              />
            ) : (
              <div
                className="flex aspect-video w-full flex-col items-center justify-center gap-1 p-4 text-center text-[#8aa28d]"
                data-testid="quick-video-empty"
              >
                <span className="text-xl" aria-hidden>
                  📺
                </span>
                <p className="text-[11px]">
                  Sincroniza con un MP4 o usa solo el cronómetro de partido.
                </p>
              </div>
            )}
          </div>

          <button
            onClick={onPickLocalVideo}
            className="self-start rounded-lg border border-brand-600/60 bg-brand-600/10 px-3 py-1.5 text-xs font-bold text-brand-400 transition-colors hover:bg-brand-600/20 active:scale-95"
            aria-label="Cargar vídeo MP4 desde el ordenador"
            data-testid="btn-local-video-quick"
          >
            📂 {localVideo ? "Cambiar MP4" : "MP4 local"}
          </button>
          {localVideo && (
            <span
              className="max-w-[220px] truncate rounded-lg border border-[#2a4a34] bg-[#0a1a10] px-2 py-1 font-mono text-[10px] text-brand-400"
              data-testid="quick-video-name"
            >
              📁 {localVideo.name}
            </span>
          )}

          {/* historial en directo */}
          <div className="min-h-[120px] flex-1 rounded-xl border border-[#1c3a26] bg-[#0a1a10]/60 p-2">
            <span className="mb-1 block text-[10px] font-semibold text-[#8aa28d]">
              Eventos Registrados con Crono en Marcha
            </span>
            {rows.length === 0 ? (
              <p
                className="px-1 text-[11px] italic text-[#6d8070]"
                data-testid="quick-empty"
              >
                Elige una sección a la derecha y pulsa cualquier evento para
                registrarlo al instante.
              </p>
            ) : (
              <ul className="space-y-1" data-testid="quick-list">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded border border-[#1c3a26] bg-[#0f2317] px-2 py-1.5 text-[11px]"
                    data-testid={`quick-row-${r.id}`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 font-mono font-bold text-brand-400">
                        [{r.clockText}]
                      </span>
                      <span className="truncate font-bold text-[#dfe9d8]">{r.label}</span>
                      <span className="shrink-0 rounded bg-[#1c3a26] px-1 py-0.5 text-[9px] text-[#a9bca9]">
                        {r.sectionLabel}
                      </span>
                    </div>
                    {r.videoSeconds != null && directUrl && (
                      <button
                        onClick={() => playClip(r.videoSeconds!)}
                        className="shrink-0 rounded bg-brand-600 px-2 py-0.5 text-[10px] font-medium text-cream transition-colors hover:bg-brand-400"
                        aria-label="Reproducir el clip del instante registrado"
                        data-testid={`quick-clip-${r.id}`}
                      >
                        ▶ Clip
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ---------- columna derecha: secciones + catálogo instantáneo ---------- */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#1c3a26] bg-[#0a1a10]/40 p-2.5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-[11px] font-bold uppercase text-[#a9bca9]">
              Selección de Sección Táctica en Directo
            </span>
            <span className="text-[10px] text-[#6d8070]">
              Los eventos se filtran automáticamente al tocar la sección
            </span>
          </div>

          {/* botonera de secciones */}
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-[#1c3a26] bg-[#0f2317] p-1.5 sm:grid-cols-4">
            {QUICK_SECTIONS.map((s) => {
              const active = s.id === activeSection;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-[11px] font-bold transition ${
                    active
                      ? s.active
                      : "border-transparent bg-[#0a1a10] text-[#8aa28d] hover:text-[#dfe9d8]"
                  }`}
                  aria-label={`Sección ${s.label}`}
                  data-testid={`quick-cat-${s.id.toLowerCase()}`}
                >
                  <span>
                    <span aria-hidden>{s.emoji}</span> {s.label}
                  </span>
                  <span className="text-[8px] font-normal opacity-80">{s.hint}</span>
                </button>
              );
            })}
          </div>

          {/* bandeja de eventos de la sección activa */}
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-lg border border-[#1c3a26] bg-[#0a1a10]/60 p-2.5">
            <div className="flex items-center justify-between border-b border-[#1c3a26] pb-1.5">
              <span
                className="text-[10px] font-bold uppercase tracking-wider text-brand-400"
                data-testid="quick-catalog-title"
              >
                Eventos disponibles para: [{sectionMeta.id}]
              </span>
              <span className="font-mono text-[10px] text-[#6d8070]">
                Pulsa para registrar al minuto actual
              </span>
            </div>
            <div className="grid grid-cols-1 gap-1.5" data-testid="quick-catalog">
              {catalog.map((eventItem, idx) => (
                <button
                  key={eventItem}
                  onClick={() => void register(eventItem)}
                  disabled={saving}
                  className="group flex w-full items-center justify-between rounded-lg border border-[#1c3a26] bg-[#0f2317] p-2.5 text-left font-semibold text-[#dfe9d8] transition hover:border-brand-400/50 hover:bg-[#1c3a26] disabled:opacity-60"
                  aria-label={`Registrar ${eventItem}`}
                  data-testid={`quick-event-${idx}`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full transition group-hover:scale-125 ${sectionMeta.dot}`}
                      aria-hidden
                    />
                    {eventItem}
                  </span>
                  <span className="shrink-0 rounded border border-[#1c3a26] bg-[#0a1a10] px-2 py-0.5 font-mono text-[10px] text-[#a9bca9] transition group-hover:text-brand-400">
                    Registrar ➔
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
