"use client";

// ============================================================================
// PILAR 3 — TABLÓN DE EVALUACIÓN TÁCTICA EN DIRECTO (Modo Vestuario)
// ----------------------------------------------------------------------------
// Pizarra viva durante el partido: los titulares colocados sobre el terreno
// según su demarcación (sin solapes, el último toque manda), la banqueta al
// lado y la FICHA RÁPIDA 1-toque por jugador:
//   · Semáforo de fatiga   🟢 Fresco · 🟡 Cargado · 🔴 Fundido (pide cambio)
//   · Aviso clínico        ⚠️ Molestia leve · ❌ Golpe fuerte (cambio forzado)
//   · Lectura táctica      ⭐ Explotando su fortaleza · ⚠️ Sufriendo
//   · Anotaciones tácticas (tags acumulativos POSITIVE/CORRECTIVE)
// Cada toque guarda al instante vía POST /api/matches/:id/evaluations —
// sin botón "guardar", el partido no espera (actualización optimista con
// reversión si falla la red). Los 3 ejes de estado son ESTADO (el último
// toque gana, repetirlo apaga); los tags son HECHOS que se acumulan.
// La ficha muestra además el bloque pre-partido del Pilar 2 (RPE reciente,
// precaución médica, carga académica y fortaleza principal) para que el
// cuerpo técnico decida mirando una sola tarjeta.
// El estado previo (titulares, flags y tags) llega del servidor (SSR) para
// sobrevivir a una recarga.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Radio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  CLINICAL_FLAG_META,
  FATIGUE_FLAG_META,
  PLAYER_STATUS_META,
  POSITION_LABEL,
  POSITION_SHORT,
  RPE_LOAD_META,
  TACTICAL_FLAG_META,
  TACTICAL_TAG_META,
  rpeLoadLevel,
} from "@/lib/taxonomy";

// ---------- Tipos ----------

export type LivePlayerData = {
  id: string;
  firstName: string;
  lastName: string;
  shirtNumber: number | null;
  mainPosition: string;
  /// Perfil pre-partido (Pilar 2) — la ficha del día en la tarjeta rápida
  secondaryPositions: string[];
  currentRpe: number | null;
  injuryHistory: string | null;
  academicConstraints: string | null;
  strength: string | null;
  status: string;
  statusNote: string | null;
};

export type LiveTagData = {
  id: string;
  code: string;
  type: string;
  createdAt: string;
};

export type LiveEvaluationData = {
  playerId: string;
  isStarter: boolean;
  fatigueFlag: string | null;
  clinicalFlag: string | null;
  tacticalFlag: string | null;
  statusUpdatedAt: string | null;
  tags: LiveTagData[];
};

type PlayerStatuses = {
  fatigueFlag: string | null;
  clinicalFlag: string | null;
  tacticalFlag: string | null;
  statusUpdatedAt: string | null;
};

const EMPTY_STATUSES: PlayerStatuses = {
  fatigueFlag: null,
  clinicalFlag: null,
  tacticalFlag: null,
  statusUpdatedAt: null,
};

type PostEvalPayload = {
  playerId: string;
  isStarter?: boolean;
  tagCode?: string;
  fatigueFlag?: string | null;
  clinicalFlag?: string | null;
  tacticalFlag?: string | null;
};

type EvalApiResponse = {
  ok: boolean;
  error?: string;
  evaluation?: {
    id: string;
    playerId: string;
    isStarter: boolean;
    totalTags: number;
    fatigueFlag: string | null;
    clinicalFlag: string | null;
    tacticalFlag: string | null;
    statusUpdatedAt: string | null;
  };
};

type StatusAxis = "fatigueFlag" | "clinicalFlag" | "tacticalFlag";

const POSITIVE_CODES = Object.entries(TACTICAL_TAG_META)
  .filter(([, m]) => m.type === "POSITIVE")
  .map(([code, m]) => ({ code, label: m.label }));
const CORRECTIVE_CODES = Object.entries(TACTICAL_TAG_META)
  .filter(([, m]) => m.type === "CORRECTIVE")
  .map(([code, m]) => ({ code, label: m.label }));

// ---------- Colocación sobre el campo (funciones puras) ----------

/** Carril vertical de cada demarcación: y = profundidad (%), win = ventana horizontal */
const PITCH_LANES: Record<string, { y: number; win: [number, number]; gap: number }> = {
  GK: { y: 88, win: [26, 74], gap: 26 },
  DEF: { y: 72, win: [7, 93], gap: 15 },
  PIV: { y: 56, win: [26, 74], gap: 22 },
  MID: { y: 41, win: [9, 91], gap: 15 },
  ATT: { y: 19, win: [9, 91], gap: 15 },
};

const LANE_OF: Record<string, keyof typeof PITCH_LANES> = {
  GK: "GK",
  CB: "DEF",
  LB: "DEF",
  RB: "DEF",
  LWB: "DEF",
  RWB: "DEF",
  DM: "PIV",
  CM: "MID",
  AM: "MID",
  LM: "MID",
  RM: "MID",
  LW: "ATT",
  RW: "ATT",
  SS: "ATT",
  CF: "ATT",
};

/** X natural de cada demarcación (lado del campo, %) — ordena y desempata */
const BASE_X: Record<string, number> = {
  GK: 50,
  LWB: 6,
  LB: 16,
  CB: 50,
  RB: 84,
  RWB: 94,
  DM: 50,
  LM: 15,
  CM: 50,
  RM: 85,
  AM: 50,
  LW: 14,
  SS: 50,
  CF: 50,
  RW: 86,
};

export type PitchSlot = { x: number; y: number };

/**
 * Coloca a los titulares sobre el campo, agrupados por carril (GK / DEF /
 * PIV / MID / ATT). Determinista y sin solapes: dentro de cada carril se
 * ordenan por su X natural (lateralidad) y se resuelven colisiones con un
 * gap mínimo, centrando el grupo si sobra margen. Puro — testeable.
 */
export function computePitchSlots(players: LivePlayerData[]): Map<string, PitchSlot> {
  const slots = new Map<string, PitchSlot>();
  const lanes = new Map<string, LivePlayerData[]>();
  for (const p of players) {
    const lane = LANE_OF[p.mainPosition] ?? "MID";
    if (!lanes.has(lane)) lanes.set(lane, []);
    lanes.get(lane)!.push(p);
  }
  for (const [lane, group] of lanes) {
    const { y, win, gap } = PITCH_LANES[lane];
    const ordered = [...group].sort((a, b) => {
      const dx = (BASE_X[a.mainPosition] ?? 50) - (BASE_X[b.mainPosition] ?? 50);
      if (dx !== 0) return dx;
      return (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99);
    });
    const n = ordered.length;
    if (n === 1) {
      slots.set(ordered[0].id, { x: BASE_X[ordered[0].mainPosition] ?? 50, y });
      continue;
    }
    // Resuelve colisiones de izquierda a derecha con el gap del carril
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const base = BASE_X[ordered[i].mainPosition] ?? 50;
      xs.push(i === 0 ? base : Math.max(base, xs[i - 1] + gap));
    }
    // Si se sale por la derecha, desplaza el grupo hacia la izquierda
    const overflow = xs[n - 1] - win[1];
    if (overflow > 0) {
      for (let i = 0; i < n; i++) xs[i] -= overflow;
    }
    // Centra el grupo dentro de su ventana sin romper los bordes
    const groupCenter = (xs[0] + xs[n - 1]) / 2;
    const winCenter = (win[0] + win[1]) / 2;
    const shift = winCenter - groupCenter;
    if (shift !== 0) {
      const left = xs[0] + shift;
      const right = xs[n - 1] + shift;
      if (left >= win[0] - 0.01 && right <= win[1] + 0.01) {
        for (let i = 0; i < n; i++) xs[i] += shift;
      }
    }
    ordered.forEach((p, i) => slots.set(p.id, { x: Math.round(xs[i] * 10) / 10, y }));
  }
  return slots;
}

// ---------- Subcomponentes ----------

/** Puntos de estado (fatiga · clínico · táctico) bajo el dorsal del jugador */
function StatusDots({ s, size = "sm" }: { s?: PlayerStatuses; size?: "sm" | "xs" }) {
  if (!s) return null;
  const dotClasses = [
    s.fatigueFlag ? FATIGUE_FLAG_META[s.fatigueFlag]?.dot : null,
    s.clinicalFlag ? CLINICAL_FLAG_META[s.clinicalFlag]?.dot : null,
    s.tacticalFlag ? TACTICAL_FLAG_META[s.tacticalFlag]?.dot : null,
  ].filter(Boolean) as string[];
  if (dotClasses.length === 0) return null;
  const dim = size === "sm" ? "w-1.5 h-1.5" : "w-1 h-1";
  return (
    <span className={`flex ${size === "sm" ? "gap-0.5 mt-0.5" : "gap-0.5"}`} aria-label="estado en directo">
      {dotClasses.map((c, i) => (
        <span key={i} className={`${dim} rounded-full ${c}`} />
      ))}
    </span>
  );
}

/** Chip de una línea del bloque pre-partido (Pilar 2) en la ficha rápida */
function PreMatchChip({ label, text, chipClass }: { label: string; text: string; chipClass?: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] leading-tight ${
        chipClass ?? "bg-zinc-800/70 border-zinc-700 text-zinc-200"
      }`}
      title={text}
    >
      <span className="font-bold uppercase tracking-wide opacity-80 shrink-0">{label}</span>
      <span className="truncate">{text}</span>
    </span>
  );
}

// ---------- Componente ----------

export function LiveMatchBoard({
  matchId,
  players,
  initialEvaluations,
}: {
  matchId: string;
  players: LivePlayerData[];
  initialEvaluations: LiveEvaluationData[];
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<LivePlayerData | null>(null);
  const [starterIds, setStarterIds] = useState<Set<string>>(
    () => new Set(initialEvaluations.filter((e) => e.isStarter).map((e) => e.playerId)),
  );
  const [tagCounts, setTagCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const e of initialEvaluations) counts[e.playerId] = e.tags.length;
    return counts;
  });
  const [statuses, setStatuses] = useState<Record<string, PlayerStatuses>>(() => {
    const map: Record<string, PlayerStatuses> = {};
    for (const e of initialEvaluations) {
      map[e.playerId] = {
        fatigueFlag: e.fatigueFlag,
        clinicalFlag: e.clinicalFlag,
        tacticalFlag: e.tacticalFlag,
        statusUpdatedAt: e.statusUpdatedAt,
      };
    }
    return map;
  });
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [savingLineup, setSavingLineup] = useState(false);

  const { starters, bench } = useMemo(() => {
    const ordered = [...players].sort(
      (a, b) => (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99),
    );
    return {
      starters: ordered.filter((p) => starterIds.has(p.id)),
      bench: ordered.filter((p) => !starterIds.has(p.id)),
    };
  }, [players, starterIds]);

  // Colocación de los titulares por demarcación (recalcula al cambiar la once)
  const slots = useMemo(() => computePitchSlots(starters), [starters]);

  // Cerrar la ficha con Escape (el míster tiene las manos ocupadas)
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const postEvaluation = useCallback(
    async (payload: PostEvalPayload) => {
      const res = await fetch(`/api/matches/${matchId}/evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as EvalApiResponse | null;
      if (!res.ok || !data?.ok || !data.evaluation) {
        throw new Error(data?.error ?? "No se pudo guardar la anotación.");
      }
      return data.evaluation;
    },
    [matchId],
  );

  /** Estado de la ficha rápida: 1 toque = guarda ya (optimista, revierte si falla) */
  const handleSetStatus = async (
    playerId: string,
    axis: StatusAxis,
    value: string | null,
    label: string,
  ) => {
    const prev = statuses[playerId] ?? EMPTY_STATUSES;
    const optimistic: PlayerStatuses = { ...prev, [axis]: value, statusUpdatedAt: new Date().toISOString() };
    setPendingKey(`${axis}:${value ?? "off"}`);
    setStatuses((m) => ({ ...m, [playerId]: optimistic }));
    const payload: PostEvalPayload = { playerId, isStarter: starterIds.has(playerId) };
    payload[axis] = value;
    try {
      const evaluation = await postEvaluation(payload);
      setStatuses((m) => ({
        ...m,
        [playerId]: {
          fatigueFlag: evaluation.fatigueFlag,
          clinicalFlag: evaluation.clinicalFlag,
          tacticalFlag: evaluation.tacticalFlag,
          statusUpdatedAt: evaluation.statusUpdatedAt,
        },
      }));
    } catch (err) {
      console.error("Error guardando estado en directo:", err);
      setStatuses((m) => ({ ...m, [playerId]: prev }));
      toast({
        title: "No se pudo actualizar el estado",
        description: err instanceof Error ? err.message : `${label}: inténtalo de nuevo.`,
        variant: "destructive",
      });
    } finally {
      setPendingKey(null);
    }
  };

  const handleAddTag = async (player: LivePlayerData, code: string, label: string) => {
    setPendingKey(`tag:${code}`);
    try {
      const evaluation = await postEvaluation({
        playerId: player.id,
        isStarter: starterIds.has(player.id),
        tagCode: code,
      });
      setTagCounts((prev) => ({ ...prev, [player.id]: evaluation.totalTags }));
    } catch (err) {
      console.error("Error guardando tag táctico:", err);
      toast({
        title: "No se pudo anotar",
        description: err instanceof Error ? err.message : `${label}: inténtalo de nuevo.`,
        variant: "destructive",
      });
    } finally {
      setPendingKey(null);
    }
  };

  const handleToggleStarter = async (player: LivePlayerData) => {
    const next = !starterIds.has(player.id);
    setSavingLineup(true);
    try {
      await postEvaluation({ playerId: player.id, isStarter: next });
      setStarterIds((prev) => {
        const set = new Set(prev);
        if (next) set.add(player.id);
        else set.delete(player.id);
        return set;
      });
      setSelected(null);
    } catch (err) {
      console.error("Error actualizando la alineación:", err);
      toast({
        title: "No se pudo actualizar la alineación",
        description: err instanceof Error ? err.message : "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setSavingLineup(false);
    }
  };

  const chipBadge = (p: LivePlayerData) =>
    p.shirtNumber ?? POSITION_SHORT[p.mainPosition] ?? "·";

  const currentStatuses = selected ? statuses[selected.id] ?? EMPTY_STATUSES : null;

  /** Grupo de botones de estado de la ficha rápida (1 toque, toggle) */
  const renderStatusGroup = (
    title: string,
    accent: string,
    axis: StatusAxis,
    meta: Record<string, { label: string; hint: string; emoji: string; btn: string }>,
    codes: string[],
  ) => {
    const active = currentStatuses ? currentStatuses[axis] : null;
    return (
      <div>
        <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${accent}`}>{title}</p>
        <div className="grid grid-cols-1 gap-2">
          {codes.map((code) => {
            const m = meta[code];
            const isActive = active === code;
            const key = `${axis}:${code}`;
            return (
              <button
                key={code}
                disabled={pendingKey !== null}
                onClick={() => selected && handleSetStatus(selected.id, axis, isActive ? null : code, m.label)}
                className={`flex items-center justify-between gap-2 min-h-[46px] px-3 rounded-xl border text-left transition-all active:scale-[0.97] disabled:opacity-60 ${
                  isActive ? `${m.btn} border-2 font-bold shadow-md` : "bg-zinc-800/60 border-zinc-700/80 text-zinc-300 hover:bg-zinc-800"
                }`}
                aria-pressed={isActive}
                aria-label={`${m.label} — ${m.hint}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0" aria-hidden>{m.emoji}</span>
                  <span className="min-w-0">
                    <span className="block text-sm leading-tight truncate">{m.label}</span>
                    <span className="block text-[10px] leading-tight opacity-70 truncate">{m.hint}</span>
                  </span>
                </span>
                <span className="shrink-0 font-black">
                  {pendingKey === key ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : isActive ? (
                    "✓"
                  ) : (
                    "+"
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 rounded-3xl border border-zinc-800 bg-zinc-950">
      {/* ---------- Terreno de juego (titulares colocados por demarcación) ---------- */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-emerald-200 font-bold flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" aria-hidden />
            Terreno de juego · Directo
          </div>
          <span className="text-[11px] text-emerald-200/70">
            {starters.length} titulares · {bench.length} en la banqueta
          </span>
        </div>

        {players.length === 0 ? (
          <div className="rounded-2xl border-4 border-emerald-500/30 bg-emerald-900/40 px-6 py-10 text-center text-sm text-emerald-100/70">
            Aún no hay jugadores en la plantilla. Da de alta al equipo en
            &ldquo;Plantilla&rdquo; para poder evaluar en directo.
          </div>
        ) : (
          <div className="relative w-full max-w-[430px] mx-auto aspect-[2/3] rounded-2xl border-4 border-emerald-500/40 bg-emerald-900/50 overflow-hidden shadow-inner">
            {/* Marcas del campo */}
            <div className="absolute left-0 right-0 top-1/2 border-t-2 border-emerald-200/20" aria-hidden />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[26%] aspect-square rounded-full border-2 border-emerald-200/20"
              aria-hidden
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 top-0 w-[46%] h-[12%] border-x-2 border-b-2 border-emerald-200/20 rounded-b-lg"
              aria-hidden
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[46%] h-[12%] border-x-2 border-t-2 border-emerald-200/20 rounded-t-lg"
              aria-hidden
            />

            {starters.length === 0 ? (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-2xl border border-dashed border-emerald-500/40 bg-zinc-950/60 px-4 py-6 text-center text-xs text-emerald-100/70">
                Toca un jugador de la banqueta y márcalo como titular para sacarlo
                al terreno de juego. Los titulares se colocan solos según su
                demarcación.
              </div>
            ) : (
              starters.map((player) => {
                const slot = slots.get(player.id);
                const s = statuses[player.id];
                return (
                  <button
                    key={player.id}
                    onClick={() => setSelected(player)}
                    style={slot ? { left: `${slot.x}%`, top: `${slot.y}%` } : undefined}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-transform active:scale-90 ${
                      selected?.id === player.id ? "scale-110" : ""
                    }`}
                    aria-label={`${player.firstName} ${player.lastName}, ${POSITION_LABEL[player.mainPosition] ?? player.mainPosition}, ${tagCounts[player.id] ?? 0} anotaciones`}
                  >
                    <span
                      className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-black border-2 shadow-lg transition-colors ${
                        selected?.id === player.id
                          ? "bg-amber-400 border-amber-200 text-zinc-950"
                          : "bg-zinc-950/85 border-emerald-400/70 text-zinc-50"
                      }`}
                    >
                      {chipBadge(player)}
                    </span>
                    <span className="mt-0.5 px-1 rounded bg-zinc-950/80 text-[10px] leading-tight font-semibold text-zinc-100 max-w-[78px] truncate">
                      {player.firstName}
                    </span>
                    <StatusDots s={s} />
                  </button>
                );
              })
            )}
          </div>
        )}

        {players.length > 0 && (
          <p className="mt-2 text-center text-[10px] text-emerald-100/50" aria-hidden>
            🟢 arriba · 🟡 al límite · 🔴 pide cambio · ⚠️/❌ clínico · ⭐ plan claro
          </p>
        )}
      </div>

      {/* ---------- Banqueta de suplentes ---------- */}
      <div className="w-full lg:w-72 bg-zinc-900 p-4 rounded-2xl border border-zinc-800 flex flex-col">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
          Banqueta de suplentes
        </h4>
        <div className="flex flex-wrap lg:flex-col lg:flex-nowrap gap-2 overflow-y-auto max-h-[460px]">
          {bench.map((player) => {
            const s = statuses[player.id];
            return (
              <button
                key={player.id}
                onClick={() => setSelected(player)}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-all ${
                  selected?.id === player.id
                    ? "bg-amber-400 text-zinc-950 font-bold"
                    : "bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200"
                }`}
              >
                <span className="w-8 h-8 rounded-full bg-zinc-700 text-zinc-50 font-bold flex items-center justify-center text-xs shrink-0">
                  {chipBadge(player)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm truncate">
                    {player.firstName} {player.lastName}
                  </span>
                  <span className="block text-[10px] uppercase tracking-wide opacity-60">
                    {POSITION_SHORT[player.mainPosition] ?? player.mainPosition}
                  </span>
                </span>
                <span className="ml-auto flex items-center gap-1.5 shrink-0">
                  <StatusDots s={s} size="xs" />
                  {(tagCounts[player.id] ?? 0) > 0 && (
                    <span className="flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-amber-400 text-zinc-950 text-[10px] font-black">
                      {tagCounts[player.id]}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          {bench.length === 0 && players.length > 0 && (
            <p className="text-xs text-zinc-500 px-1 py-2">
              Todo el equipo está sobre el césped.
            </p>
          )}
        </div>
      </div>

      {/* ---------- Ficha rápida flotante del jugador seleccionado ---------- */}
      {selected && currentStatuses && (
        <div
          className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Evaluar a ${selected.firstName} ${selected.lastName}`}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera de la ficha */}
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-full bg-emerald-500 text-zinc-950 font-black text-lg flex items-center justify-center shrink-0">
                  {chipBadge(selected)}
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-zinc-50 truncate">
                    {selected.firstName} {selected.lastName}
                  </h3>
                  <span className="text-xs text-zinc-400">
                    {POSITION_LABEL[selected.mainPosition] ?? selected.mainPosition} ·{" "}
                    {starterIds.has(selected.id) ? "Titular" : "Suplente"}
                    {currentStatuses.statusUpdatedAt
                      ? ` · estado ${format(new Date(currentStatuses.statusUpdatedAt), "HH:mm'h'")}`
                      : ""}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-zinc-400 hover:text-zinc-50 text-xl font-bold p-1"
                aria-label="Cerrar ficha"
              >
                ✕
              </button>
            </div>

            {/* Ficha de hoy (Pilar 2 · pre-partido) */}
            {(selected.currentRpe !== null ||
              selected.status !== "AVAILABLE" ||
              selected.injuryHistory ||
              selected.academicConstraints ||
              selected.strength) && (
              <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                  Ficha de hoy · antes del pitido
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.currentRpe !== null && rpeLoadLevel(selected.currentRpe) && (
                    <PreMatchChip
                      label={`RPE ${selected.currentRpe}`}
                      text={`Carga reciente: ${RPE_LOAD_META[rpeLoadLevel(selected.currentRpe)!].label}`}
                      chipClass={RPE_LOAD_META[rpeLoadLevel(selected.currentRpe)!].chip}
                    />
                  )}
                  {selected.status !== "AVAILABLE" && PLAYER_STATUS_META[selected.status] && (
                    <PreMatchChip
                      label={PLAYER_STATUS_META[selected.status].label}
                      text={selected.statusNote ?? PLAYER_STATUS_META[selected.status].label}
                      chipClass={PLAYER_STATUS_META[selected.status].chip}
                    />
                  )}
                  {selected.injuryHistory && (
                    <PreMatchChip label="Clínico" text={selected.injuryHistory} />
                  )}
                  {selected.academicConstraints && (
                    <PreMatchChip label="Académico" text={selected.academicConstraints} />
                  )}
                  {selected.strength && (
                    <PreMatchChip
                      label="Fortaleza"
                      text={selected.strength}
                      chipClass="bg-violet-500/15 text-violet-300 border-violet-500/40"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Estado en directo (1 toque — el último toque gana, repetir apaga) */}
            {renderStatusGroup(
              "Semáforo de fatiga",
              "text-emerald-400",
              "fatigueFlag",
              FATIGUE_FLAG_META,
              Object.keys(FATIGUE_FLAG_META),
            )}
            {renderStatusGroup(
              "Aviso clínico",
              "text-amber-400",
              "clinicalFlag",
              CLINICAL_FLAG_META,
              Object.keys(CLINICAL_FLAG_META),
            )}
            {renderStatusGroup(
              "Lectura táctica",
              "text-violet-400",
              "tacticalFlag",
              TACTICAL_FLAG_META,
              Object.keys(TACTICAL_FLAG_META),
            )}

            {/* Anotaciones tácticas acumulativas (tags) */}
            <div className="space-y-4 border-t border-zinc-800 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Anotaciones tácticas · se acumulan
              </p>
              {(["POSITIVE", "CORRECTIVE"] as const).map((tone) => {
                const items = tone === "POSITIVE" ? POSITIVE_CODES : CORRECTIVE_CODES;
                const accent = tone === "POSITIVE" ? "text-emerald-400" : "text-amber-400";
                return (
                  <div key={tone} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {items.map((tag) => (
                      <button
                        key={tag.code}
                        disabled={pendingKey !== null}
                        onClick={() => handleAddTag(selected, tag.code, tag.label)}
                        className={`flex items-center justify-between p-2.5 text-xs rounded-lg transition-all active:scale-95 disabled:opacity-50 ${
                          tone === "POSITIVE"
                            ? "bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 text-emerald-200"
                            : "bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-200"
                        }`}
                      >
                        <span>{tag.label}</span>
                        <span className={`font-bold ${tone === "POSITIVE" ? "text-emerald-400" : "text-amber-400"}`}>
                          {pendingKey === `tag:${tag.code}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                          ) : (
                            tone === "POSITIVE" ? "+" : "!"
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Contadores de la sesión + alineación */}
            <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 flex items-center justify-between gap-3">
              <span>
                Anotaciones en este partido:{" "}
                <span className="font-bold text-zinc-50">{tagCounts[selected.id] ?? 0} registro(s)</span>
              </span>
              <button
                onClick={() => handleToggleStarter(selected)}
                disabled={savingLineup}
                className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                {savingLineup
                  ? "Guardando…"
                  : starterIds.has(selected.id)
                    ? "Pasar al banquillo"
                    : "Marcar como titular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
