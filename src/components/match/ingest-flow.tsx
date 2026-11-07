"use client";

// ============================================================================
// PILAR 3 — FLUJO GUIADO DE INGESTA EXPRÉS (< 3 MINUTOS, Modo Vestuario)
// ----------------------------------------------------------------------------
// Paso 1 · SEMÁFORO   → marcador con steppers, semáforo global (1 toque) y
//                        sliders de carga / actitud / ejecución (1-10).
// Paso 2 · PIZARRA    → campo táctil: eliges tipo de evento + responsable y
//                        TOCAS el campo donde ocurrió (x,y 0-100). Undo/vaciar.
// Paso 3 · VESTUARIO  → cuaderno por jugador: semáforo rápido + nota corta.
// Guardar  → submitMatchReport (Server Action) que dispara el motor (Pilar 4)
//            y devuelve la evidencia detectada para feedback inmediato.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eraser,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  submitMatchReport,
  type EventInput,
  type NoteInput,
  type SubmitResult,
} from "@/app/dashboard/match/actions";
import {
  EVENT_META,
  QUICK_EVENT_TYPES,
  SEMAPHORE_META,
} from "@/lib/taxonomy";
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
  mainPosition: string;
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

const STEPS = [
  { n: 1, label: "Semáforo" },
  { n: 2, label: "Pizarra" },
  { n: 3, label: "Vestuario" },
];

const SENSATIONS: Array<"GREEN" | "AMBER" | "RED"> = ["GREEN", "AMBER", "RED"];

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
    <div className={`rounded-3xl border p-4 flex flex-col items-center gap-2 ${tone === "ours" ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900"}`}>
      <p className="text-xs font-black tracking-widest text-zinc-400">{label}</p>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-2xl border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-800"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`Restar gol ${label}`}
        >
          <Minus className="w-5 h-5" aria-hidden />
        </Button>
        <span className="w-14 text-center text-4xl font-black text-zinc-50" aria-live="polite">
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-2xl border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-800"
          onClick={() => onChange(Math.min(20, value + 1))}
          aria-label={`Sumar gol ${label}`}
        >
          <Plus className="w-5 h-5" aria-hidden />
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
      ? "bg-rose-500/20 border-rose-500/50 text-rose-300"
      : value >= 4
        ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
        : "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
    : value <= 4
      ? "bg-rose-500/20 border-rose-500/50 text-rose-300"
      : value <= 6
        ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
        : "bg-emerald-500/20 border-emerald-500/50 text-emerald-300";

  return (
    <div className="rounded-3xl bg-zinc-900 border border-zinc-800 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-zinc-100">{label}</p>
          <p className="text-xs text-zinc-500">{hint}</p>
        </div>
        <span className={`min-w-[52px] text-center rounded-xl border px-2 py-1 text-lg font-black ${colorCls}`} aria-live="polite">
          {value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={1}
        max={10}
        step={1}
        onValueChange={(v) => onChange(v[0] ?? value)}
        className="mt-3"
        aria-label={label}
      />
    </div>
  );
}

function RatingDots({ value }: { value: number | null }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${value && i <= value ? "bg-amber-300" : "bg-zinc-700"}`} />
      ))}
    </span>
  );
}

// ---------- Flujo principal ----------

export function IngestFlow({
  match,
  players,
  initialReport,
}: {
  match: IngestMatchData;
  players: IngestPlayerData[];
  initialReport: IngestReportData | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [saving, startTransition] = useTransition();

  // Paso 1
  const [goalsFor, setGoalsFor] = useState(match.goalsFor ?? 0);
  const [goalsAgainst, setGoalsAgainst] = useState(match.goalsAgainst ?? 0);
  const [sensation, setSensation] = useState<string | null>(initialReport?.sensation ?? null);
  const [load, setLoad] = useState(initialReport?.perceivedLoad ?? 5);
  const [attitude, setAttitude] = useState(initialReport?.collectiveAttitude ?? 5);
  const [execution, setExecution] = useState(initialReport?.tacticalExecution ?? 5);
  const [globalNotes, setGlobalNotes] = useState(initialReport?.notes ?? "");

  // Paso 2 (pizarra)
  const [events, setEvents] = useState<EventInput[]>(initialReport?.events ?? []);
  const [activeType, setActiveType] = useState<string>("BALL_LOSS");
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  // Paso 3 (cuaderno)
  const [notes, setNotes] = useState<Record<string, PlayerNoteState>>(() => {
    const base: Record<string, PlayerNoteState> = {};
    for (const pn of initialReport?.playerNotes ?? []) {
      base[pn.playerId] = { flag: pn.flag, note: pn.note ?? "" };
    }
    return base;
  });

  const [result, setResult] = useState<SubmitResult | null>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) map[e.type] = (map[e.type] ?? 0) + 1;
    return map;
  }, [events]);

  const notesFilled = useMemo(
    () => Object.values(notes).filter((n) => n.flag !== null || n.note.trim() !== "").length,
    [notes],
  );

  function addEvent(x: number, y: number) {
    setEvents((prev) => [
      ...prev,
      { x, y, type: activeType, playerId: activePlayerId, minute: null },
    ]);
  }

  function removeEvent(index: number) {
    setEvents((prev) => prev.filter((_, i) => i !== index));
  }

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
        setStep(4);
        router.refresh();
      } else {
        toast({ title: "No se pudo guardar", description: res.error, variant: "destructive", duration: 5000 });
      }
    });
  }

  const kickoffLabel = format(new Date(match.kickoffAt), "EEE d MMM · HH:mm'h'", { locale: es });

  return (
    <div>
      {/* ---------- Cabecera ---------- */}
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href="/dashboard/matches" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 min-h-[44px]">
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Partidos
            </Link>
            <h1 className="text-xl font-black text-zinc-50 leading-tight truncate">
              {match.isHome ? "vs" : "@"} {match.opponent}
            </h1>
            <p className="text-xs text-zinc-500">
              {kickoffLabel}
              {match.competition ? ` · ${match.competition}` : ""}
            </p>
          </div>
          {match.status === "ANALYZED" && (
            <Badge variant="outline" className="rounded-full bg-zinc-800 text-zinc-300 border-zinc-700 shrink-0">
              Editando ingesta
            </Badge>
          )}
        </div>
        {/* Indicador de pasos */}
        <div className="mx-auto max-w-5xl px-4 pb-3">
          <div className="grid grid-cols-3 gap-2">
            {STEPS.map((s) => {
              const done = step > s.n;
              const active = step === s.n;
              return (
                <div
                  key={s.n}
                  className={`rounded-2xl border px-3 py-2 flex items-center gap-2 transition ${
                    active
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : done
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-zinc-800 bg-zinc-900"
                  }`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${active ? "bg-emerald-500 text-zinc-950" : done ? "bg-emerald-500/30 text-emerald-300" : "bg-zinc-800 text-zinc-500"}`}>
                    {done ? "✓" : s.n}
                  </span>
                  <span className={`text-xs font-bold ${active ? "text-emerald-300" : done ? "text-emerald-400/70" : "text-zinc-500"}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-5">
        {/* ============================================================ */}
        {/* PASO 1 — SEMÁFORO + SLIDERS                                  */}
        {/* ============================================================ */}
        {step === 1 && (
          <section aria-label="Paso 1: semáforo y carga" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <GoalStepper label="NOSOTROS" value={goalsFor} onChange={setGoalsFor} tone="ours" />
              <GoalStepper label={match.opponent.toUpperCase()} value={goalsAgainst} onChange={setGoalsAgainst} tone="theirs" />
            </div>

            <p className="text-sm text-zinc-400">
              ¿Cómo quedó el grupo? <span className="text-zinc-600">Un toque:</span>
            </p>
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
                    className={`min-h-[76px] rounded-3xl border px-3 py-3 flex flex-col items-center justify-center gap-1.5 transition ${selected ? meta.btn : "bg-zinc-900 border-zinc-800 text-zinc-400"}`}
                  >
                    <span className={`w-5 h-5 rounded-full ${meta.dot}`} aria-hidden />
                    <span className="text-sm font-black">{meta.label}</span>
                    <span className="text-[11px] text-zinc-500 text-center leading-tight">{meta.hint}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              <SliderRow label="Carga percibida" hint="Cuánto pesó el partido al grupo" value={load} onChange={setLoad} invert />
              <SliderRow label="Actitud colectiva" hint="Compromiso y energía del vestuario" value={attitude} onChange={setAttitude} />
              <SliderRow label="Ejecución táctica" hint="Cuánto de lo planificado salió" value={execution} onChange={setExecution} />
            </div>

            <Input
              className="min-h-[48px] rounded-2xl bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
              placeholder="Nota global opcional (contexto rival, bajas…)"
              maxLength={500}
              value={globalNotes}
              onChange={(e) => setGlobalNotes(e.target.value)}
            />

            <Button
              onClick={() => setStep(2)}
              disabled={sensation === null}
              className="w-full min-h-[60px] rounded-3xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-base"
            >
              Siguiente: pizarra táctica <ArrowRight className="w-5 h-5" aria-hidden />
            </Button>
            {sensation === null && (
              <p className="text-center text-xs text-zinc-600">Elige el semáforo global para continuar</p>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* PASO 2 — PIZARRA TÁCTIL                                      */}
        {/* ============================================================ */}
        {step === 2 && (
          <section aria-label="Paso 2: pizarra táctica" className="space-y-4">
            <p className="text-sm text-zinc-400">
              Elige el tipo de evento y <span className="font-bold text-zinc-200">toca el campo</span> donde ocurrió.
              Toca un punto para borrarlo.
            </p>

            {/* Paleta de eventos */}
            <div className="grid grid-cols-4 gap-2">
              {QUICK_EVENT_TYPES.map((type) => {
                const meta = EVENT_META[type];
                const Icon = meta.icon;
                const selected = activeType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveType(type)}
                    aria-pressed={selected}
                    className={`relative min-h-[68px] rounded-2xl border px-1.5 py-2 flex flex-col items-center justify-center gap-1 transition ${selected ? meta.btn : "bg-zinc-900 border-zinc-800 text-zinc-400"}`}
                  >
                    <Icon className="w-5 h-5" aria-hidden />
                    <span className="text-[11px] font-bold leading-tight text-center">{meta.label}</span>
                    {(counts[type] ?? 0) > 0 && (
                      <span className={`absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full text-[11px] font-black flex items-center justify-center ${meta.text} bg-zinc-950 border border-zinc-700`}>
                        {counts[type]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Responsable del evento */}
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
                Responsable {activePlayerId ? "(toca «Sin responsable» para quitar)" : "(opcional)"}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setActivePlayerId(null)}
                  aria-pressed={activePlayerId === null}
                  className={`shrink-0 min-h-[44px] px-4 py-2 rounded-full border text-sm font-bold transition ${activePlayerId === null ? "bg-zinc-700 border-zinc-500 text-zinc-100" : "bg-zinc-900 border-zinc-800 text-zinc-400"}`}
                >
                  Sin responsable
                </button>
                {players.map((p) => {
                  const selected = activePlayerId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActivePlayerId(selected ? null : p.id)}
                      aria-pressed={selected}
                      className={`shrink-0 min-h-[44px] px-3.5 py-2 rounded-full border text-sm font-bold transition ${selected ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300" : "bg-zinc-900 border-zinc-800 text-zinc-400"}`}
                    >
                      <span className="font-black mr-1">{p.shirtNumber ?? "–"}</span>
                      {p.lastName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campo táctil */}
            <div
              className="relative rounded-3xl overflow-hidden border border-zinc-800 select-none"
              role="application"
              aria-label="Pizarra táctica: toca para marcar eventos. Campo propio a la izquierda."
            >
              <svg
                viewBox="0 0 150 100"
                preserveAspectRatio="none"
                className="block w-full aspect-[3/2] touch-none"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
                  const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
                  addEvent(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
                }}
              >
                {/* césped */}
                <rect width="150" height="100" fill="#06231a" />
                {/* líneas */}
                <g stroke="#14532d" strokeWidth="0.8" fill="none">
                  <rect x="2" y="2" width="146" height="96" />
                  <line x1="75" y1="2" x2="75" y2="98" />
                  <circle cx="75" cy="50" r="13" />
                  {/* área izquierda */}
                  <rect x="2" y="25" width="18" height="50" />
                  <rect x="2" y="38" width="8" height="24" />
                  <circle cx="13" cy="50" r="0.9" fill="#14532d" />
                  {/* área derecha */}
                  <rect x="130" y="25" width="18" height="50" />
                  <rect x="140" y="38" width="8" height="24" />
                  <circle cx="137" cy="50" r="0.9" fill="#14532d" />
                </g>
                {/* tercios (1/3 propio = x ≤ 35) */}
                <g stroke="#14532d" strokeDasharray="3 3" strokeWidth="0.5" opacity="0.7">
                  <line x1="52.5" y1="2" x2="52.5" y2="98" />
                  <line x1="102.5" y1="2" x2="102.5" y2="98" />
                </g>
                {/* porterías */}
                <rect x="0.5" y="44" width="1.8" height="12" fill="#4ade80" opacity="0.8" />
                <rect x="147.7" y="44" width="1.8" height="12" fill="#f87171" opacity="0.8" />

                {/* puntos de evento */}
                {events.map((e, i) => {
                  const meta = EVENT_META[e.type] ?? EVENT_META.CUSTOM;
                  const big = e.type === "GOAL_FOR" || e.type === "GOAL_AGAINST";
                  return (
                    <g key={`${i}-${e.x}-${e.y}`}>
                      <circle
                        cx={e.x * 1.5}
                        cy={e.y}
                        r={big ? 3.4 : 2.6}
                        fill={meta.dot}
                        stroke="#09090b"
                        strokeWidth="0.7"
                        className="cursor-pointer"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          removeEvent(i);
                        }}
                      />
                      {e.playerId && (
                        <circle
                          cx={e.x * 1.5}
                          cy={e.y}
                          r={big ? 5.2 : 4.4}
                          fill="none"
                          stroke={meta.dot}
                          strokeWidth="0.5"
                          opacity="0.55"
                          className="cursor-pointer"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            removeEvent(i);
                          }}
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="text-zinc-400">
                <span className="font-black text-zinc-100">{events.length}</span> eventos marcados
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEvents((prev) => prev.slice(0, -1))}
                  disabled={events.length === 0}
                  className="min-h-[44px] rounded-2xl border-zinc-700 bg-zinc-900 text-zinc-300"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden /> Deshacer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEvents([])}
                  disabled={events.length === 0}
                  className="min-h-[44px] rounded-2xl border-zinc-700 bg-zinc-900 text-zinc-300"
                >
                  <Eraser className="w-4 h-4" aria-hidden /> Vaciar
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="min-h-[56px] rounded-3xl border-zinc-700 bg-zinc-900 text-zinc-300 px-5"
              >
                <ArrowLeft className="w-5 h-5" aria-hidden /> Atrás
              </Button>
              <Button
                onClick={() => setStep(3)}
                className="min-h-[56px] rounded-3xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-base px-6"
              >
                Siguiente: vestuario <ArrowRight className="w-5 h-5" aria-hidden />
              </Button>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* PASO 3 — CUADERNO INDIVIDUAL                                 */}
        {/* ============================================================ */}
        {step === 3 && (
          <section aria-label="Paso 3: cuaderno del vestuario" className="space-y-4">
            <p className="text-sm text-zinc-400">
              Un semáforo por jugador y, si quieres, un apunte corto.{" "}
              <span className="font-bold text-zinc-200">
                {notesFilled} de {players.length} anotados
              </span>
            </p>

            <div className="space-y-2 max-h-[52vh] overflow-y-auto rounded-3xl border border-zinc-800 p-2">
              {players.map((p) => {
                const st = notes[p.id] ?? { flag: null, note: "" };
                return (
                  <div key={p.id} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="font-bold text-zinc-100 text-sm">
                        <span className="text-zinc-500 font-black mr-1.5">{p.shirtNumber ?? "–"}</span>
                        {p.firstName} {p.lastName}
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
                              className={`h-11 w-11 rounded-xl border flex items-center justify-center transition ${selected ? meta.btn : "bg-zinc-800/60 border-zinc-800"}`}
                            >
                              <span className={`w-4 h-4 rounded-full ${selected ? meta.dot : "bg-zinc-600"}`} aria-hidden />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <Input
                      className="min-h-[44px] rounded-xl bg-zinc-950 border-zinc-800 text-zinc-100 text-sm placeholder:text-zinc-600"
                      placeholder="Apunte corto…"
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

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(2)}
                className="min-h-[56px] rounded-3xl border-zinc-700 bg-zinc-900 text-zinc-300 px-5"
              >
                <ArrowLeft className="w-5 h-5" aria-hidden /> Atrás
              </Button>
              <Button
                onClick={save}
                disabled={saving}
                className="min-h-[56px] rounded-3xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-base px-6"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> Guardando…
                  </>
                ) : (
                  <>💾 Guardar ingesta</>
                )}
              </Button>
            </div>
            <p className="text-center text-xs text-zinc-600 flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" aria-hidden />
              Al guardar, el motor cocinará el diagnóstico del microciclo con estos datos.
            </p>
          </section>
        )}

        {/* ============================================================ */}
        {/* PASO 4 — ÉXITO + FEEDBACK DEL MOTOR                          */}
        {/* ============================================================ */}
        {step === 4 && result?.ok && (
          <section aria-label="Ingesta guardada" className="space-y-5">
            <div className="rounded-3xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center space-y-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" aria-hidden />
              <p className="text-xl font-black text-emerald-300">Ingesta guardada</p>
              <p className="text-sm text-emerald-200/80">
                {result.eventsSaved} eventos en la pizarra · {result.notesSaved} notas del vestuario
              </p>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
              <p className="text-sm font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-300" aria-hidden /> El motor ya está cocinando
              </p>
              {result.engineEvidence.length > 0 ? (
                <ul className="space-y-2">
                  {result.engineEvidence.map((ev, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <TriangleAlert className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" aria-hidden />
                      {ev}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">Sin señales de alarma — consolidación de estructuras.</p>
              )}
              {result.refreshedWeeks.length > 0 && (
                <p className="text-xs text-emerald-300/80">
                  Propuesta semanal actualizada con la evidencia nueva (semana{" "}
                  {result.refreshedWeeks.join(" y semana ")}).
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                href="/dashboard/today"
                className="flex items-center justify-center gap-2 min-h-[60px] rounded-3xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-base transition"
              >
                Ver propuesta de la semana
              </Link>
              <Link
                href="/dashboard/matches"
                className="flex items-center justify-center gap-2 min-h-[60px] rounded-3xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-black text-base transition"
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
