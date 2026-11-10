"use client";

// ============================================================================
// PILAR 3 — INGESTA POST-PARTIDO EXPRÉS /dashboard/match?g=<id>
// ----------------------------------------------------------------------------
// Mock del míster "Partidos Limpios": la pizarra SALE del detalle del partido
// (ahora es la pestaña global Pizarra Táctica) y el detalle se compone de 3
// sub-pestañas al mismo nivel:
//   · Resumen & Semáforo → marcador, semáforo global (1 toque), métricas de
//     carga (sliders), estadísticas REALES del encuentro (hechos sellados en
//     la pizarra en directo) y evaluación del cuerpo técnico.
//   · Vestuario (Notas)  → cuaderno individual: semáforo por jugador + nota.
//   · Guardar Datos      → resumen de lo consolidado y botón único que guarda
//                          TODO (submitMatchReport) y muestra la evidencia
//                          del motor (Pilar 4) en la misma pestaña.
// Server Component padre: /dashboard/match/page.tsx (carga partido + plantilla
// + ingesta previa + telemetría en directo). searchParams (?g=<id>) por
// robustez de rutas; el enlace se firma desde la página Partidos.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  Minus,
  Plus,
  Radio,
  Save,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { submitMatchReport, type EventInput, type NoteInput, type SubmitResult } from "@/app/dashboard/match/actions";
import { ACTION_PRESETS } from "@/lib/pilar3";
import { SEMAPHORE_META } from "@/lib/taxonomy";
import { useToast } from "@/hooks/use-toast";

// ---------- Tipos ----------

export type IngestMatchData = {
  id: string;
  opponent: string;
  competition: string | null;
  isHome: boolean;
  kickoffAt: string;
  status: string;
  goalsFor: number | null;
  goalsAgainst: number | null;
};

export type IngestPlayerData = {
  id: string;
  firstName: string;
  lastName: string;
  shirtNumber: number | null;
  primaryPosition: string;
};

export type IngestReportData = {
  sensation: "GREEN" | "AMBER" | "RED";
  perceivedLoad: number;
  collectiveAttitude: number;
  tacticalExecution: number;
  notes: string | null;
  events: Array<{ x: number; y: number; type: string; playerId: string | null; minute: number | null }>;
  playerNotes: Array<{ playerId: string; flag: string; note: string | null }>;
};

type PlayerNoteState = { flag: string | null; note: string };

type TabKey = "summary" | "locker" | "data" | "done";

const TABS: Array<{ id: Exclude<TabKey, "done">; label: string }> = [
  { id: "summary", label: "Resumen & Semáforo" },
  { id: "locker", label: "Vestuario (Notas)" },
  { id: "data", label: "Guardar Datos" },
];

const SENSATIONS: Array<"GREEN" | "AMBER" | "RED"> = ["GREEN", "AMBER", "RED"];

const ACTION_TONE_TEXT: Record<string, string> = {
  positive: "text-brand-600",
  negative: "text-[#b4232a]",
  neutral: "text-peel",
};

// ---------- Sub-componentes ----------

function GoalStepper({
  label,
  value,
  onChange,
  tone,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  tone: "ours" | "theirs";
}) {
  return (
    <div className={`rounded-2xl border p-3 flex flex-col items-center gap-2 ${tone === "ours" ? "border-emerald-500/40 bg-brand-600/5" : "border-cream-border bg-white"}`}>
      <p className="text-[10px] font-black tracking-widest text-[#5d7263] truncate max-w-full">{label}</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-2xl border-cream-border-strong bg-cream text-[#2a4630] hover:bg-cream-dark"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`Restar gol ${label}`}
        >
          <Minus className="w-4 h-4" aria-hidden />
        </Button>
        <span className="w-12 text-center text-3xl font-black text-peel" aria-live="polite">
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-2xl border-cream-border-strong bg-cream text-[#2a4630] hover:bg-cream-dark"
          onClick={() => onChange(Math.min(20, value + 1))}
          aria-label={`Sumar gol ${label}`}
        >
          <Plus className="w-4 h-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  onChange,
  invert,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  invert?: boolean;
  hint: string;
}) {
  const colorCls = invert
    ? value >= 7
      ? "bg-[#c62f32]/20 border-rose-500/50 text-[#b4232a]"
      : value >= 4
        ? "bg-amber-500/20 border-amber-500/50 text-[#8a6206]"
        : "bg-brand-600/20 border-emerald-500/50 text-brand-600"
    : value <= 4
      ? "bg-[#c62f32]/20 border-rose-500/50 text-[#b4232a]"
      : value <= 6
        ? "bg-amber-500/20 border-amber-500/50 text-[#8a6206]"
        : "bg-brand-600/20 border-emerald-500/50 text-brand-600";

  return (
    <div className="rounded-2xl bg-white border border-cream-border px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-peel">{label}</p>
          <p className="text-[11px] text-[#6c8070] truncate">{hint}</p>
        </div>
        <span className={`min-w-[48px] text-center rounded-xl border px-2 py-0.5 text-lg font-black ${colorCls}`} aria-live="polite">
          {value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={1}
        max={10}
        step={1}
        onValueChange={(v) => onChange(v[0] ?? value)}
        className="mt-2"
        aria-label={label}
      />
    </div>
  );
}

function StatRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="flex justify-between items-center bg-cream/70 border border-cream-border px-3 py-1.5 rounded-xl text-[13px]">
      <span className="text-[#5d7263]">{label}</span>
      <span className={`font-black ${ACTION_TONE_TEXT[tone]}`}>{value}</span>
    </div>
  );
}

// ---------- Flujo principal ----------

export function IngestFlow({
  match,
  players,
  initialReport,
  initialTab = "summary",
  actionCounts = {},
  telemetryTotal = 0,
}: {
  match: IngestMatchData;
  players: IngestPlayerData[];
  initialReport: IngestReportData | null;
  /** Sub-pestaña inicial (deep-link ?tab= del Server Component) */
  initialTab?: Exclude<TabKey, "done">;
  /** Hechos de juego sellados en la pizarra en directo (value → count) */
  actionCounts?: Record<string, number>;
  /** Total de hechos de juego en directo registrados */
  telemetryTotal?: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [saving, startTransition] = useTransition();

  // Resumen & Semáforo
  const [goalsFor, setGoalsFor] = useState(match.goalsFor ?? 0);
  const [goalsAgainst, setGoalsAgainst] = useState(match.goalsAgainst ?? 0);
  const [sensation, setSensation] = useState<string | null>(initialReport?.sensation ?? null);
  const [load, setLoad] = useState(initialReport?.perceivedLoad ?? 5);
  const [attitude, setAttitude] = useState(initialReport?.collectiveAttitude ?? 5);
  const [execution, setExecution] = useState(initialReport?.tacticalExecution ?? 5);
  const [globalNotes, setGlobalNotes] = useState(initialReport?.notes ?? "");

  // Eventos de la ingesta previa: se PRESERVAN tal cual al guardar (el
  // marcado vivo vive ahora en la pizarra en directo / pizarra global).
  const events: EventInput[] = useMemo(() => initialReport?.events ?? [], [initialReport]);

  // Vestuario (notas)
  const [notes, setNotes] = useState<Record<string, PlayerNoteState>>(() => {
    const base: Record<string, PlayerNoteState> = {};
    for (const pn of initialReport?.playerNotes ?? []) {
      base[pn.playerId] = { flag: pn.flag, note: pn.note ?? "" };
    }
    return base;
  });

  const [result, setResult] = useState<SubmitResult | null>(null);

  const notesFilled = useMemo(
    () => Object.values(notes).filter((n) => n.flag !== null || n.note.trim() !== "").length,
    [notes],
  );

  function save() {
    const playerNotes: NoteInput[] = [];
    for (const [playerId, n] of Object.entries(notes)) {
      if (n.flag !== null || n.note.trim() !== "") {
        playerNotes.push({ playerId, flag: n.flag ?? "GREEN", note: n.note.trim() || null });
      }
    }
    startTransition(async () => {
      const res = await submitMatchReport({
        gameId: match.id,
        goalsFor,
        goalsAgainst,
        sensation: sensation ?? "AMBER",
        perceivedLoad: load,
        collectiveAttitude: attitude,
        tacticalExecution: execution,
        notes: globalNotes.trim() || null,
        events,
        playerNotes,
      });
      if (res.ok) {
        setResult(res);
        setTab("done");
        router.refresh();
      } else {
        toast({ title: "No se pudo guardar", description: res.error, variant: "destructive", duration: 5000 });
      }
    });
  }

  const kickoffLabel = format(new Date(match.kickoffAt), "EEE d MMM · HH:mm'h'", { locale: es });
  const sensationMeta = sensation ? SEMAPHORE_META[sensation as "GREEN" | "AMBER" | "RED"] : null;

  const statsRows = ACTION_PRESETS.filter((p) => (actionCounts[p.value] ?? 0) > 0);

  return (
    <div>
      {/* ---------- Cabecera FIJA del partido (sticky master) ---------- */}
      <header className="sticky top-0 z-20 border-b border-cream-border bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href="/dashboard/matches" className="inline-flex items-center gap-1 text-xs text-[#6c8070] hover:text-[#3d5844] min-h-[36px]">
              ← Partidos
            </Link>
            <h1 className="text-lg font-black text-peel leading-tight truncate">
              {match.isHome ? "vs" : "@"} {match.opponent}
            </h1>
            <p className="text-[11px] text-[#6c8070]">
              {kickoffLabel}
              {match.competition ? ` · ${match.competition}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {/* Análisis en directo: vídeo de la grabación + voz 🎙️ + pizarra viva.
              Siempre visible desde cualquier sub-pestaña del partido. */}
            <Link
              href={`/dashboard/match/live?g=${match.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-600/50 bg-brand-600/10 px-3 py-1.5 text-[11px] font-black text-brand-600 transition hover:bg-brand-600/20 active:scale-[0.98]"
              title="Pizarra en directo de este partido: vídeo de la grabación, dictado por voz y hechos sellados al minuto"
            >
              <Radio className="w-3.5 h-3.5" aria-hidden />
              <span className="hidden sm:inline">Análisis en directo · Vídeo + Voz</span>
              <span className="sm:hidden">Directo</span>
            </Link>
            <span
              className="rounded-xl border border-cream-border-strong bg-cream px-3 py-1 font-mono text-lg font-black text-peel leading-none"
              aria-label={`Resultado ${goalsFor}-${goalsAgainst}`}
            >
              {goalsFor} - {goalsAgainst}
            </span>
            {sensationMeta ? (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-black ${sensationMeta.border} ${sensationMeta.bg} ${sensationMeta.text}`}>
                <span className={`w-2 h-2 rounded-full ${sensationMeta.dot}`} aria-hidden />
                Semáforo {sensationMeta.label}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cream-border bg-white px-2 py-0.5 text-[10px] font-bold text-[#8a9a8d]">
                Semáforo pendiente
              </span>
            )}
            {match.status === "ANALYZED" && (
              <Badge variant="outline" className="rounded-full bg-cream-dark text-[#3d5844] border-cream-border-strong shrink-0 text-[10px]">
                Editando ingesta
              </Badge>
            )}
          </div>
        </div>
        {/* Sub-pestañas del partido (mock: 3 botones a partes iguales) */}
        <div className="mx-auto max-w-5xl px-4 pb-3">
          <div className="flex gap-1">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex-1 min-h-[40px] py-1.5 px-2 rounded-xl text-[11px] sm:text-xs font-bold transition ${
                    active
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-white border border-cream-border text-[#5d7263] hover:text-peel"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-4 pb-8">
        {/* ============================================================ */}
        {/* PESTAÑA 1 — RESUMEN & SEMÁFORO                               */}
        {/* ============================================================ */}
        {tab === "summary" && (
          <section aria-label="Resumen y semáforo del partido" className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <GoalStepper label="NOSOTROS" value={goalsFor} onChange={setGoalsFor} tone="ours" />
              <GoalStepper label={match.opponent.toUpperCase()} value={goalsAgainst} onChange={setGoalsAgainst} tone="theirs" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {SENSATIONS.map((s) => {
                const meta = SEMAPHORE_META[s];
                const selected = sensation === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSensation(s)}
                    aria-pressed={selected}
                    className={`min-h-[64px] rounded-2xl border px-2 py-2 flex flex-col items-center justify-center gap-1 transition ${selected ? meta.btn : "bg-white border-cream-border text-[#5d7263]"}`}
                  >
                    <span className={`w-4 h-4 rounded-full ${meta.dot}`} aria-hidden />
                    <span className="text-xs font-black">{meta.label}</span>
                    <span className="text-[10px] text-[#6c8070] text-center leading-tight">{meta.hint}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Métricas y carga grupal */}
              <div className="rounded-2xl border border-cream-border bg-white/70 p-3 space-y-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#5d7263] block">
                  Métricas y Carga Grupal
                </span>
                <div className="space-y-2">
                  <SliderRow label="Carga percibida" hint="Cuánto pesó el partido al grupo" value={load} onChange={setLoad} invert />
                  <SliderRow label="Actitud colectiva" hint="Compromiso y energía del vestuario" value={attitude} onChange={setAttitude} />
                  <SliderRow label="Ejecución táctica" hint="Cuánto de lo planificado salió" value={execution} onChange={setExecution} />
                </div>
              </div>

              {/* Estadísticas del encuentro (telemetría real en directo) */}
              <div className="rounded-2xl border border-cream-border bg-white/70 p-3 space-y-2 flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#5d7263] block">
                  Estadísticas del Encuentro
                </span>
                {telemetryTotal > 0 && statsRows.length > 0 ? (
                  <div className="space-y-1.5 flex-1">
                    {statsRows.map((p) => (
                      <StatRow
                        key={p.value}
                        label={`${p.emoji} ${p.label}`}
                        value={String(actionCounts[p.value] ?? 0)}
                        tone={p.tone}
                      />
                    ))}
                    <StatRow label="Hechos sellados en directo" value={String(telemetryTotal)} />
                    <Link
                      href={`/dashboard/match/live?g=${match.id}`}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-brand-600/50 bg-brand-600/10 px-3 py-2 text-[11px] font-black text-brand-600 transition hover:bg-brand-600/20 active:scale-[0.98]"
                    >
                      <Radio className="w-3.5 h-3.5" aria-hidden /> Abrir análisis en directo (vídeo + voz)
                    </Link>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-cream-border px-3 py-5 text-center">
                    <Radio className="w-4 h-4 text-[#8a9a8d]" aria-hidden />
                    <p className="text-[11px] text-[#6c8070] leading-snug">
                      Sin hechos sellados en directo todavía. Regístralos con vídeo y voz en la{" "}
                      <Link href={`/dashboard/match/live?g=${match.id}`} className="font-bold text-brand-600 hover:underline">
                        pizarra en directo de este partido
                      </Link>
                      .
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Evaluación del cuerpo técnico */}
            <div className="rounded-2xl border border-cream-border bg-white/70 p-3">
              <span className="text-[11px] font-black uppercase tracking-widest text-[#5d7263] block mb-2">
                Evaluación del Cuerpo Técnico
              </span>
              <Input
                className="min-h-[48px] rounded-xl bg-cream border-cream-border text-peel placeholder:text-[#8a9a8d]"
                placeholder="Partido controlado, objetivos defensivos cumplidos, contexto de bajas…"
                maxLength={500}
                value={globalNotes}
                onChange={(e) => setGlobalNotes(e.target.value)}
              />
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* PESTAÑA 2 — VESTUARIO (NOTAS)                               */}
        {/* ============================================================ */}
        {tab === "locker" && (
          <section aria-label="Vestuario: notas individuales post-partido" className="space-y-3">
            <p className="text-sm text-[#5d7263]">
              Un semáforo por jugador y, si quieres, un apunte corto.{" "}
              <span className="font-bold text-[#2a4630]">
                {notesFilled} de {players.length} anotados
              </span>
            </p>

            <div className="space-y-2 max-h-[56vh] overflow-y-auto rounded-2xl border border-cream-border p-2">
              {players.map((p) => {
                const st = notes[p.id] ?? { flag: null, note: "" };
                return (
                  <div key={p.id} className="rounded-2xl bg-white border border-cream-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="font-bold text-peel text-sm flex items-center gap-2">
                        <span className="text-[#6c8070] font-black">{p.shirtNumber ?? "–"}</span>
                        {p.firstName} {p.lastName}
                        <span className="text-[10px] font-bold bg-cream-dark text-[#5d7263] rounded px-1.5 py-0.5">
                          {p.primaryPosition}
                        </span>
                      </p>
                      <div className="flex gap-1.5">
                        {SENSATIONS.map((s) => {
                          const meta = SEMAPHORE_META[s];
                          const selected = st.flag === s;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() =>
                                setNotes((prev) => ({
                                  ...prev,
                                  [p.id]: { ...st, flag: selected ? null : s },
                                }))
                              }
                              aria-pressed={selected}
                              aria-label={`${p.firstName} ${p.lastName}: ${meta.label}`}
                              className={`h-11 w-11 rounded-xl border flex items-center justify-center transition ${selected ? meta.btn : "bg-cream-dark/70 border-cream-border"}`}
                            >
                              <span className={`w-4 h-4 rounded-full ${selected ? meta.dot : "bg-[#b9b49c]"}`} aria-hidden />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <Input
                      className="min-h-[44px] rounded-xl bg-cream border-cream-border text-peel text-sm placeholder:text-[#8a9a8d]"
                      placeholder="Añadir nota de rendimiento…"
                      maxLength={140}
                      value={st.note}
                      onChange={(e) =>
                        setNotes((prev) => ({
                          ...prev,
                          [p.id]: { ...st, note: e.target.value },
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* PESTAÑA 3 — GUARDAR DATOS                                    */}
        {/* ============================================================ */}
        {tab === "data" && (
          <section aria-label="Guardar datos del partido" className="space-y-3">
            <div className="rounded-2xl border border-cream-border bg-white/70 p-4 space-y-3">
              <span className="text-[11px] font-black uppercase tracking-widest text-[#5d7263] flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" aria-hidden />
                Sincronización y guardado de datos
              </span>
              <p className="text-sm text-[#5d7263] leading-snug">
                Los hechos sellados en directo, las notas del vestuario y las métricas de carga
                de este partido están listos para consolidarse en una sola ingesta.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <StatRow
                  label="Semáforo global"
                  value={sensationMeta ? sensationMeta.label : "Pendiente (ámbar al guardar)"}
                  tone={sensation === "RED" ? "negative" : sensation === "GREEN" ? "positive" : "neutral"}
                />
                <StatRow label="Marcador" value={`${goalsFor} - ${goalsAgainst}`} />
                <StatRow label="Hechos en directo" value={String(telemetryTotal)} />
                <StatRow label="Notas del vestuario" value={`${notesFilled} / ${players.length}`} />
                <StatRow label="Carga · Actitud · Ejecución" value={`${load} · ${attitude} · ${execution}`} />
                <StatRow label="Eventos previos en la pizarra" value={String(events.length)} />
              </div>
            </div>

            <Button
              onClick={save}
              disabled={saving}
              className="w-full min-h-[60px] rounded-2xl bg-brand-600 hover:bg-brand text-white font-black text-base"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> Guardando…
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" aria-hidden /> Guardar Datos del Partido ✓
                </>
              )}
            </Button>
            <p className="text-center text-xs text-[#8a9a8d] flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" aria-hidden />
              Al guardar, el motor cocinará el diagnóstico del microciclo con estos datos.
            </p>
          </section>
        )}

        {/* ============================================================ */}
        {/* CONFIRMACIÓN + FEEDBACK DEL MOTOR                            */}
        {/* ============================================================ */}
        {tab === "done" && result?.ok && (
          <section aria-label="Ingesta guardada" className="space-y-5">
            <div className="rounded-2xl border border-emerald-500/40 bg-brand-600/10 p-6 text-center space-y-2">
              <CheckCircle2 className="w-12 h-12 text-brand-600 mx-auto" aria-hidden />
              <p className="text-xl font-black text-brand-600">Datos guardados</p>
              <p className="text-sm text-brand/90">
                {result.eventsSaved} eventos en la pizarra · {result.notesSaved} notas del vestuario
              </p>
            </div>

            <div className="rounded-2xl border border-cream-border bg-white p-5 space-y-3">
              <p className="text-sm font-black uppercase tracking-widest text-[#5d7263] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#8a6206]" aria-hidden /> El motor ya está cocinando
              </p>
              {result.engineEvidence.length > 0 ? (
                <ul className="space-y-2">
                  {result.engineEvidence.map((ev, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[#3d5844]">
                      <TriangleAlert className="w-4 h-4 text-[#8a6206] shrink-0 mt-0.5" aria-hidden />
                      {ev}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#6c8070]">Sin señales de alarma — consolidación de estructuras.</p>
              )}
              {result.refreshedWeeks.length > 0 && (
                <p className="text-xs text-brand-600/90">
                  Propuesta semanal actualizada con la evidencia nueva (semana{" "}
                  {result.refreshedWeeks.join(" y semana ")}).
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                href="/dashboard/today"
                className="flex items-center justify-center gap-2 min-h-[60px] rounded-2xl bg-brand-600 hover:bg-brand text-white font-black text-base transition"
              >
                Ver propuesta de la semana
              </Link>
              <Link
                href="/dashboard/matches"
                className="flex items-center justify-center gap-2 min-h-[60px] rounded-2xl border border-cream-border-strong bg-white hover:bg-cream-dark text-[#2a4630] font-black text-base transition"
              >
                Volver a partidos
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
