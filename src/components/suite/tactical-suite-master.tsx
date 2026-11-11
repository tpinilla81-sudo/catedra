"use client";

// ============================================================================
// PILAR 3 — SUITE TÁCTICA MAESTRA // MÉTODO // TACTICAL SUITE MASTER (V3)
// (mock del míster 'MetodoTacticalSuiteMasterApp')
// ----------------------------------------------------------------------------
// Centro de mando en 4 pestañas (navegación superior, EXACTA del mock):
//   ⏱️ Directo & Vídeo   — cronómetro propio de la Suite (▶/⏸/🔄, mm:ss),
//                          MP4 local (blob, nunca se sube), 4 secciones con
//                          20 etiquetas EXACTAS y registro a UN TOQUE con
//                          ▶ Clip (−3s/+2s) en el historial.
//   📚 Biblioteca Taxonomía — acordeones oficiales del mock + enlace a la
//                          Biblioteca Maestra (donde se gestionan tareas).
//   📋 Plantilla & Capacidades — 4 bloques × 6 métricas con las NOTAS REALES
//                          de la Ficha de Rendimiento (jugador seleccionable)
//                          y acceso directo a la Ficha completa.
//   🚩 Módulo A.B.P.     — acciones FAVOR/CONTRA + resultado/franja que
//                          componen un evento ABP y lo registran en el
//                          histórico en directo de la pestaña Directo.
// La libreta de eventos vive en localStorage (sobrevive recargas): la Suite
// es el cronómetro LIBRE del míster — el reloj AUTORITATIVO del partido sigue
// siendo el del tablón (MatchSession), que ya registra con el panel Dinámico.
// Estilo de la casa (crema/verde): NADA del slate oscuro del mock.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  SUITE_EVENT_CATALOGS,
  SUITE_SECTIONS,
  SUITE_TAXONOMY,
  SUITE_CAPACITY_BLOCKS,
  SUITE_ABP_ACTIONS,
  SUITE_ABP_RESULTS,
  composeAbpLabel,
  formatSuiteClock,
  loadSuiteEvents,
  persistSuiteEvents,
  type SuiteEvent,
  type SuiteSectionId,
  type SuiteTab,
} from "@/lib/tactical-suite";

// ---------- tipos que alimenta el servidor (Página Suite) ----------
export type SuitePlayerBlock = {
  key: string;
  title: string;
  accent: string;
  headerClass: string;
  metrics: { label: string; score: number | null }[];
  avg: string | null;
};

export type SuitePlayerData = {
  id: string;
  name: string;
  shirtNumber: number | null;
  position: string | null;
  hasEval: boolean;
  overall: string | null;
  blocks: SuitePlayerBlock[];
};

type Props = { players: SuitePlayerData[] };

const TABS: { id: SuiteTab; label: string }[] = [
  { id: "DIRECTO", label: "⏱️ Directo & Vídeo" },
  { id: "BIBLIOTECA", label: "📚 Biblioteca Taxonomía" },
  { id: "PLANTILLA", label: "📋 Plantilla & Capacidades" },
  { id: "ABP", label: "🚩 Módulo A.B.P." },
];

export function TacticalSuiteMaster({ players }: Props) {
  const [activeTab, setActiveTab] = useState<SuiteTab>("DIRECTO");

  // ---- cronómetro de la Suite (libre, no es el reloj del partido) ----
  const [matchSeconds, setMatchSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- vídeo local (blob: nunca se sube) ----
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clipStopRef = useRef<((e: Event) => void) | null>(null);

  // ---- libreta de eventos (localStorage; se hidrata tras montar) ----
  const [events, setEvents] = useState<SuiteEvent[]>([]);
  const [activeSection, setActiveSection] = useState<SuiteSectionId>("OFENSIVA");

  // ---- módulo A.B.P. ----
  const [abpAction, setAbpAction] = useState<string | null>(null);
  const [abpResults, setAbpResults] = useState<string[]>([]);
  const [abpFlash, setAbpFlash] = useState(false);
  const abpFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- pestaña Plantilla: jugador seleccionado ----
  const [playerIdx, setPlayerIdx] = useState(0);

  useEffect(() => {
    setEvents(loadSuiteEvents());
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (abpFlashRef.current) clearTimeout(abpFlashRef.current);
    };
  }, []);

  // persistencia de la libreta (cada cambio)
  useEffect(() => {
    if (events.length === 0) return; // evita borrar la libreta antes de hidratar
    persistSuiteEvents(events);
  }, [events]);

  // ---- control del cronómetro (mock: toggle + reset) ----
  const toggleTimer = useCallback(() => {
    if (isTimerRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setIsTimerRunning(false);
    } else {
      setIsTimerRunning(true);
      timerRef.current = setInterval(() => {
        setMatchSeconds((prev) => prev + 1);
      }, 1000);
    }
  }, [isTimerRunning]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setIsTimerRunning(false);
    setMatchSeconds(0);
  }, []);

  // ---- vídeo ----
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    setVideoSrc(URL.createObjectURL(file));
    setVideoFileName(file.name);
  };

  const pickVideo = () => fileInputRef.current?.click();

  /// ▶ Clip: reproduce −3s/+2s alrededor del segundo registrado (mock)
  const playClip = useCallback((offset: number) => {
    const v = videoRef.current;
    if (!v) return;
    const start = Math.max(0, offset - 3);
    const end = offset + 2;
    if (clipStopRef.current) v.removeEventListener("timeupdate", clipStopRef.current);
    v.currentTime = start;
    void v.play().catch(() => {
      // autoplay bloqueado: el míster pulsa play y el clip continúa
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

  const getVideoTime = (): number | null => {
    const v = videoRef.current;
    if (!v || !videoSrc || !Number.isFinite(v.currentTime)) return null;
    return Math.round(v.currentTime * 10) / 10;
  };

  // ---- registro a UN TOQUE (mock: handleRegisterEvent) ----
  const registerEvent = useCallback(
    (eventLabel: string, section: SuiteSectionId) => {
      const newEvent: SuiteEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: formatSuiteClock(matchSeconds),
        videoOffsetSec: getVideoTime(),
        section,
        eventLabel,
      };
      setEvents((prev) => [newEvent, ...prev]);
    },
    [matchSeconds, videoSrc],
  );

  // ---- A.B.P.: componer y registrar en el histórico en directo ----
  const abpLabel = composeAbpLabel(abpAction, abpResults);

  const registerAbp = () => {
    if (!abpLabel) return;
    registerEvent(abpLabel, "ABP");
    setAbpAction(null);
    setAbpResults([]);
    setAbpFlash(true);
    if (abpFlashRef.current) clearTimeout(abpFlashRef.current);
    abpFlashRef.current = setTimeout(() => setAbpFlash(false), 3500);
  };

  const toggleAbpResult = (r: string) => {
    setAbpResults((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    );
  };

  const selectedPlayer = players[playerIdx] ?? null;
  const sectionMeta = SUITE_SECTIONS.find((s) => s.id === activeSection)!;

  return (
    <div
      className="flex h-full flex-col gap-3 p-3 text-[13px] text-[#17301f] select-none"
      data-testid="suite-root"
    >
      {/* ================= NAV SUPERIOR MAESTRA ================= */}
      <header className="flex-none rounded-2xl border border-cream-border-strong bg-cream-dark px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-400" aria-hidden />
            <h1
              className="text-[13px] font-black uppercase tracking-wide text-brand"
              data-testid="suite-title"
            >
              MÉTODO <span className="font-bold text-[#6c8070]">// Tactical Suite Master</span>
            </h1>
          </div>

          <nav
            aria-label="Pestañas de la Suite"
            className="flex flex-wrap items-center gap-1 rounded-xl border border-cream-border-strong bg-cream p-1"
          >
            {TABS.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  aria-pressed={isActive}
                  data-testid={`suite-tab-${t.id.toLowerCase()}`}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                    isActive
                      ? "bg-brand text-cream shadow"
                      : "text-[#516a58] hover:bg-cream-dark hover:text-brand"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>

          {activeTab === "DIRECTO" && (
            <div
              className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand px-3 py-1.5 text-cream shadow-sm"
              data-testid="suite-crono-box"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-cream/80">
                Crono:
              </span>
              <span
                className="font-mono text-base font-black tracking-wider"
                data-testid="suite-crono"
              >
                {formatSuiteClock(matchSeconds)}
              </span>
              <button
                onClick={toggleTimer}
                data-testid="suite-crono-toggle"
                className={`rounded px-2 py-0.5 text-[10px] font-black transition ${
                  isTimerRunning
                    ? "bg-[#e3a93c] text-[#3a2a05]"
                    : "bg-lime-brand text-brand shadow"
                }`}
              >
                {isTimerRunning ? "⏸ PAUSAR" : "▶ INICIAR"}
              </button>
              <button
                onClick={resetTimer}
                aria-label="Reiniciar cronómetro"
                title="Reiniciar cronómetro"
                data-testid="suite-crono-reset"
                className="rounded px-1.5 py-0.5 text-[10px] text-cream/80 hover:text-cream"
              >
                🔄
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ================= VISTA 1: DIRECTO & VÍDEO ================= */}
      {activeTab === "DIRECTO" && (
        <main
          className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-12 lg:overflow-hidden"
          aria-label="Directo y vídeo"
        >
          {/* ----- izquierda: vídeo + historial (5 col) ----- */}
          <div className="flex flex-col gap-3 lg:col-span-5 lg:h-full lg:overflow-hidden">
            <div className="flex-none">
              <div className="relative w-full overflow-hidden rounded-2xl border border-cream-border-strong bg-[#0a1a10] shadow-inner">
                {videoSrc ? (
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    controls
                    playsInline
                    className="aspect-video w-full object-contain"
                    data-testid="suite-video"
                  />
                ) : (
                  <div
                    className="flex aspect-video w-full flex-col items-center justify-center gap-1 p-4 text-center text-[#8aa28d]"
                    data-testid="suite-video-empty"
                  >
                    <span className="text-xl" aria-hidden>📺</span>
                    <p className="text-[11px]">
                      Sincroniza con un MP4 o usa solo el cronómetro de partido.
                    </p>
                    <button
                      onClick={pickVideo}
                      data-testid="suite-video-pick"
                      className="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-cream shadow"
                    >
                      Cargar MP4
                    </button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="suite-video-input"
                />
              </div>
              {videoFileName && (
                <p
                  className="mt-1 truncate text-[10px] font-semibold text-[#6c8070]"
                  data-testid="suite-video-name"
                >
                  🎞️ {videoFileName}
                </p>
              )}
            </div>

            <div
              className="flex min-h-[180px] flex-1 flex-col rounded-2xl border border-cream-border bg-cream-dark/60 p-2 lg:min-h-0 lg:overflow-y-auto"
              data-testid="suite-history"
            >
              <span className="mb-1 block px-1 text-[10px] font-black uppercase tracking-wider text-[#6c8070]">
                Registro de Eventos en Directo
              </span>
              {events.length === 0 ? (
                <p
                  className="px-1 py-2 text-[11px] italic text-[#8a9a8d]"
                  data-testid="suite-history-empty"
                >
                  Selecciona una sección y pulsa un evento para registrarlo al instante.
                </p>
              ) : (
                <ul className="space-y-1">
                  {events.map((ev, i) => {
                    const chip = SUITE_SECTIONS.find((s) => s.id === ev.section)!;
                    return (
                      <li
                        key={ev.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-cream-border bg-cream px-2 py-1.5"
                        data-testid={`suite-history-row-${i}`}
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span
                            className="font-mono text-[11px] font-black text-brand-600"
                            data-testid={`suite-history-time-${i}`}
                          >
                            [{ev.timestamp}]
                          </span>
                          <span
                            className="text-[11px] font-bold"
                            data-testid={`suite-history-label-${i}`}
                          >
                            {ev.eventLabel}
                          </span>
                          <span
                            className={`rounded border px-1 py-0.5 text-[9px] font-black uppercase ${chip.chip}`}
                            data-testid={`suite-history-section-${i}`}
                          >
                            {ev.section}
                          </span>
                        </div>
                        {videoSrc && (
                          <button
                            onClick={() => playClip(ev.videoOffsetSec ?? 0)}
                            data-testid={`suite-history-clip-${i}`}
                            className="flex-none rounded-lg bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-cream"
                          >
                            ▶ Clip
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* ----- derecha: secciones + catálogo (7 col) ----- */}
          <div className="flex flex-col gap-3 rounded-2xl border border-cream-border bg-cream-dark/40 p-2 lg:col-span-7 lg:h-full lg:overflow-hidden">
            <div className="grid flex-none grid-cols-2 gap-1.5 rounded-xl border border-cream-border-strong bg-cream p-1.5 md:grid-cols-4">
              {SUITE_SECTIONS.map((s) => {
                const isActive = activeSection === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    aria-pressed={isActive}
                    data-testid={`suite-section-${s.id}`}
                    className={`rounded-xl border px-1 py-2 text-[11px] font-black transition ${
                      isActive
                        ? s.active
                        : "border-cream-border-strong bg-cream-dark text-[#516a58] hover:text-brand"
                    }`}
                  >
                    {s.emoji} {s.label}
                    <span className="mt-0.5 block text-[9px] font-semibold opacity-80">
                      {s.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              className="flex min-h-[220px] flex-1 flex-col gap-2 rounded-xl border border-cream-border-strong bg-cream p-2.5 lg:min-h-0 lg:overflow-y-auto"
              data-testid="suite-catalog"
            >
              <span
                className="text-[10px] font-black uppercase tracking-wider"
                style={{ color: sectionMeta.id === "ABP" ? "#7a5a10" : "#1f7a3d" }}
                data-testid="suite-catalog-title"
              >
                Eventos de la Sección: [{activeSection}]
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {SUITE_EVENT_CATALOGS[activeSection].map((eventItem, idx) => (
                  <div
                    key={idx}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-cream-border bg-cream-dark/50 p-2.5 transition hover:border-brand/40 hover:bg-cream-dark"
                    data-testid={`suite-event-row-${idx}`}
                  >
                    <span className="text-[12px] font-bold">{eventItem}</span>
                    <button
                      onClick={() => registerEvent(eventItem, activeSection)}
                      data-testid={`suite-register-${idx}`}
                      className="flex-none rounded-lg bg-brand px-2 py-1 text-[10px] font-black text-cream shadow-sm"
                    >
                      Registrar ➔
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ================= VISTA 2: BIBLIOTECA TAXONOMÍA ================= */}
      {activeTab === "BIBLIOTECA" && (
        <main className="flex-1 space-y-1.5 overflow-y-auto pr-1" aria-label="Biblioteca taxonomía">
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-cream-border bg-cream-dark/60 px-3 py-2">
            <p className="text-[11px] font-semibold text-[#516a58]">
              Taxonomía oficial de tareas — la gestión completa (crear, editar,
              pizarra animada) vive en la Biblioteca.
            </p>
            <Link
              href="/dashboard/library"
              data-testid="suite-bib-open"
              className="flex-none rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold text-cream shadow-sm"
            >
              Abrir Biblioteca Maestra →
            </Link>
          </div>

          {SUITE_TAXONOMY.map((cat) => (
            <SuiteAccordion key={cat.id} cat={cat} />
          ))}
        </main>
      )}

      {/* ================= VISTA 3: PLANTILLA & CAPACIDADES ================= */}
      {activeTab === "PLANTILLA" && (
        <main className="flex-1 space-y-3 overflow-y-auto pr-1" aria-label="Plantilla y capacidades">
          {players.length === 0 ? (
            <p
              className="rounded-2xl border border-cream-border bg-cream-dark/60 px-3 py-4 text-center text-[12px] italic text-[#6c8070]"
              data-testid="suite-players-empty"
            >
              No hay jugadores activos en la plantilla del equipo.
            </p>
          ) : (
            <>
              {/* selector de jugador (chips grandes, 1 toque) */}
              <div
                className="flex gap-1.5 overflow-x-auto rounded-2xl border border-cream-border bg-cream-dark/60 p-2"
                data-testid="suite-player-picker"
              >
                {players.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setPlayerIdx(i)}
                    aria-pressed={i === playerIdx}
                    data-testid={`suite-player-${i}`}
                    className={`flex-none rounded-xl border px-2.5 py-1.5 text-left transition ${
                      i === playerIdx
                        ? "border-brand bg-brand text-cream shadow"
                        : "border-cream-border-strong bg-cream hover:border-brand/40"
                    }`}
                  >
                    <span className="block text-[11px] font-black" data-testid={`suite-player-name-${i}`}>
                      {p.shirtNumber != null ? `${p.shirtNumber} · ` : ""}
                      {p.name}
                    </span>
                    <span
                      className={`block text-[9px] font-semibold ${
                        i === playerIdx ? "text-cream/80" : "text-[#6c8070]"
                      }`}
                    >
                      {p.hasEval ? `Media ${p.overall}/10` : "Sin evaluar"}
                    </span>
                  </button>
                ))}
              </div>

              {selectedPlayer && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] font-bold text-brand" data-testid="suite-player-title">
                      {selectedPlayer.name}
                      {selectedPlayer.position ? (
                        <span className="ml-2 font-semibold text-[#6c8070]">
                          {selectedPlayer.position}
                        </span>
                      ) : null}
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-xl border border-cream-border-strong bg-cream-dark px-2.5 py-1 text-[11px] font-black text-brand"
                        data-testid="suite-overall"
                      >
                        {selectedPlayer.hasEval
                          ? `Media global ${selectedPlayer.overall}/10`
                          : "Sin evaluación vigente"}
                      </span>
                      <Link
                        href={`/dashboard/players/${selectedPlayer.id}`}
                        data-testid={`suite-player-open-${playerIdx}`}
                        className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-bold text-cream shadow-sm"
                      >
                        Evaluación completa · Ficha de Rendimiento →
                      </Link>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {selectedPlayer.blocks.map((b) => (
                      <section
                        key={b.key}
                        className="rounded-2xl border border-cream-border bg-cream-dark/40 p-2"
                        data-testid={`suite-bloque-${b.key}`}
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <span
                            className={`rounded-lg px-2 py-1 text-[11px] font-black ${b.headerClass}`}
                          >
                            {b.title}
                          </span>
                          <span
                            className="rounded-lg border border-cream-border-strong bg-cream px-2 py-0.5 font-mono text-[11px] font-black"
                            style={{ color: b.accent }}
                            data-testid={`suite-avg-${b.key}`}
                          >
                            {b.avg ? `Avg ${b.avg}` : "Avg —"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {b.metrics.map((m, mi) => (
                            <div
                              key={`${b.key}-${mi}`}
                              className="flex items-center justify-between rounded-lg border border-cream-border bg-cream px-2 py-1 text-[10px]"
                              data-testid={`suite-metric-${b.key}-${mi}`}
                            >
                              <span className="truncate pr-1 font-semibold">{m.label}</span>
                              <span
                                className={`flex-none font-mono font-black ${
                                  m.score == null
                                    ? "text-[#9aa89b]"
                                    : m.score >= 8
                                      ? "text-brand-600"
                                      : m.score >= 6
                                        ? "text-[#8a6206]"
                                        : "text-[#8f1f22]"
                                }`}
                              >
                                {m.score == null ? "—" : `${m.score}/10`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      )}

      {/* ================= VISTA 4: MÓDULO A.B.P. ================= */}
      {activeTab === "ABP" && (
        <main className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-3" aria-label="Módulo A.B.P.">
          {/* 1. Acciones A.B.P. */}
          <section className="rounded-2xl border border-cream-border bg-cream-dark/60 p-2">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-[#6c8070]">
              1. Acciones A.B.P.
            </span>
            <div className="space-y-1.5">
              {SUITE_ABP_ACTIONS.map((a) => (
                <div
                  key={a.id}
                  className="grid grid-cols-2 gap-1 rounded-xl border border-cream-border-strong bg-cream p-1"
                  data-testid={`suite-abp-tile-${a.id}`}
                >
                  {a.sides.map((side, si) => {
                    const isActive = abpAction === side;
                    return (
                      <button
                        key={side}
                        onClick={() => setAbpAction(isActive ? null : side)}
                        aria-pressed={isActive}
                        data-testid={`suite-abp-side-${a.id}-${si === 0 ? "favor" : "contra"}`}
                        className={`rounded-lg px-1 py-2 text-center text-[10px] font-black leading-tight transition ${
                          isActive
                            ? "bg-[#e3a93c] text-[#3a2a05] shadow"
                            : "text-[#516a58] hover:bg-cream-dark"
                        }`}
                      >
                        {side}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          {/* 2. Resultado & Franja Temporal */}
          <section className="rounded-2xl border border-cream-border bg-cream-dark/60 p-2">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-[#6c8070]">
              2. Resultado &amp; Franja Temporal
            </span>
            <div className="grid grid-cols-2 gap-1">
              {SUITE_ABP_RESULTS.map((r, i) => {
                const isActive = abpResults.includes(r);
                return (
                  <button
                    key={r}
                    onClick={() => toggleAbpResult(r)}
                    aria-pressed={isActive}
                    data-testid={`suite-abp-result-${i}`}
                    className={`rounded-lg border px-1.5 py-2 text-[10px] font-bold transition ${
                      isActive
                        ? "border-brand bg-brand text-cream shadow"
                        : "border-cream-border-strong bg-cream text-[#516a58] hover:border-brand/40"
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. Zona & Protagonista (estado + registro al histórico) */}
          <section className="flex flex-col rounded-2xl border border-cream-border bg-cream-dark/60 p-2">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-[#6c8070]">
              3. Zona &amp; Protagonista
            </span>
            <div
              className="flex flex-1 flex-col items-center justify-center rounded-xl border border-brand/30 bg-brand/5 p-3 text-center"
              data-testid="suite-abp-state"
            >
              <span className="text-[12px] font-black text-brand">Módulo A.B.P. Activo</span>
              <p className="mt-1 text-[10px] text-[#6c8070]">
                Sincronizado con zonas laterales, central directa y área de portería.
              </p>
              {abpLabel ? (
                <p
                  className="mt-2 break-words rounded-lg border border-cream-border-strong bg-cream px-2 py-1 text-[11px] font-black text-brand"
                  data-testid="suite-abp-compose"
                >
                  {abpLabel}
                </p>
              ) : (
                <p
                  className="mt-2 text-[10px] italic text-[#8a9a8d]"
                  data-testid="suite-abp-compose-empty"
                >
                  Elige acción y resultado para componer el evento.
                </p>
              )}
              <span
                className="mt-2 font-mono text-[10px] font-bold text-[#6c8070]"
                data-testid="suite-abp-clock"
              >
                Sello del crono: {formatSuiteClock(matchSeconds)}
              </span>
            </div>
            <button
              onClick={registerAbp}
              disabled={!abpLabel}
              data-testid="suite-abp-register"
              className={`mt-2 rounded-xl px-3 py-2 text-[11px] font-black transition ${
                abpLabel
                  ? "bg-brand text-cream shadow hover:bg-brand-600"
                  : "cursor-not-allowed bg-cream-border text-[#9aa89b]"
              }`}
            >
              Registrar en Directo ➔
            </button>
            {abpFlash && (
              <p
                className="mt-1 text-center text-[10px] font-bold text-brand-600"
                data-testid="suite-abp-flash"
              >
                ✔ Registrado en el histórico en directo (pestaña Directo)
              </p>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

// ============================================================================
// Acordeón de la taxonomía (mock: plegable con ▲/▼, primera categoría abierta)
// ============================================================================
function SuiteAccordion({ cat }: { cat: (typeof SUITE_TAXONOMY)[number] }) {
  const [open, setOpen] = useState(cat.id === "fisicas");
  return (
    <div className="overflow-hidden rounded-2xl border border-cream-border bg-cream-dark/60">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        data-testid={`suite-bib-acc-${cat.id}`}
        className="flex w-full items-center justify-between gap-2 bg-cream px-3 py-2.5 text-left"
      >
        <span className="text-[12px] font-bold text-[#17301f]">
          {cat.emoji} {cat.title}
        </span>
        <span aria-hidden className="text-[10px] font-black text-[#6c8070]">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div
          className="grid grid-cols-1 gap-1.5 border-t border-cream-border bg-cream-dark/40 p-2 md:grid-cols-2"
          data-testid={`suite-bib-panel-${cat.id}`}
        >
          {cat.cells.map((c, i) => (
            <div
              key={i}
              className="rounded-xl border border-cream-border bg-cream p-2 text-[11px]"
            >
              <b className="text-brand">{c.head}</b>
              {c.detail ? <span className="text-[#516a58]">: {c.detail}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
