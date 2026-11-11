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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Crosshair,
  Flag,
  Loader2,
  Pause,
  Pin,
  Play,
  Radio,
  Square,
  Video,
  Zap,
} from "lucide-react";
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
import {
  ACTION_PRESETS,
  actionMeta,
  formatClock,
  minuteOfElapsed,
  type MatchSessionDTO,
  type TelemetryEventDTO,
} from "@/lib/pilar3";
import { parseVideoUrl } from "@/lib/video-url";
import {
  SpatialEventWhiteboard,
  type SpatialSaveInput,
} from "@/components/match/spatial-event-whiteboard";
import {
  QuickChronoBoard,
  type QuickEventRow,
  type QuickSaveInput,
} from "@/components/match/quick-chrono-board";

// ---------- Tipos ----------

export type LivePlayerData = {
  id: string;
  firstName: string;
  lastName: string;
  shirtNumber: number | null;
  primaryPosition: string;
  /// Perfil pre-partido (Pilar 2) — la ficha del día en la tarjeta rápida
  secondaryPositions: string[];
  fatigueRPE: number | null;
  medicalNotes: string | null;
  academicStress: string | null;
  tacticalStrength: string | null;
  status: string;
  statusNote: string | null;
  /// Perfiles cualitativos 1-5 (motor del form score del consejero)
  technicalRating?: number | null;
  tacticalRating?: number | null;
  physicalRating?: number | null;
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

/// Presets de hechos de juego con responsable claro (ficha del jugador)
const PLAYER_ACTIONS = ACTION_PRESETS;
/// Hechos colectivos sin responsable (barra rápida bajo el reloj)
const TEAM_ACTION_VALUES = ["GOAL_FOR", "GOAL_AGAINST", "OPP_CHANCE", "CORNER_FOR"] as const;
const TEAM_ACTIONS = TEAM_ACTION_VALUES.map(
  (v) => ACTION_PRESETS.find((a) => a.value === v)!,
);

/// Emoji + tono por valor de evento de estado (para la línea temporal)
const STATE_EMOJI: Record<string, string> = {
  FRESH: "🟢", HEAVY: "🟡", EXHAUSTED: "🔴",
  MINOR: "⚠️", FORCED_SUB: "❌",
  EXPLOITING: "⭐", STRUGGLING: "⚠️",
};

function eventEmoji(e: TelemetryEventDTO): string {
  if (e.type === "ACTION") {
    return actionMeta(e.value)?.emoji ?? "📌";
  }
  return STATE_EMOJI[e.value] ?? "•";
}

function eventLabel(e: TelemetryEventDTO): string {
  if (e.type === "ACTION") {
    return actionMeta(e.value)?.label ?? e.value;
  }
  const metas = {
    FATIGUE: FATIGUE_FLAG_META,
    CLINICAL: CLINICAL_FLAG_META,
    TACTICAL: TACTICAL_FLAG_META,
  } as const;
  return metas[e.type][e.value]?.label ?? e.value;
}

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
 * Form score 0-100 del CONSEJERO DE ALINEACIÓN (mock del míster: "Sugerir
 * Once Óptimo") calculado con datos REALES del perfil, sin inventar nada:
 *   · base = media de perfiles técnico/táctico/físico (1-5, 3 si no hay) → 0-100
 *   · − 12 si el jugador llega como DUDA · − 8 si se está reincorporando
 *   · − 5 por cada punto de RPE por encima de 6 (fatiga reciente)
 * Puro — testeable.
 */
export function computeFormScore(p: {
  technicalRating?: number | null;
  tacticalRating?: number | null;
  physicalRating?: number | null;
  fatigueRPE: number | null;
  status: string;
}): number {
  const base =
    (((p.technicalRating ?? 3) + (p.tacticalRating ?? 3) + (p.physicalRating ?? 3)) / 15) * 100;
  let score = base;
  if (p.status === "DOUBTFUL") score -= 12;
  if (p.status === "RETURNING") score -= 8;
  if ((p.fatigueRPE ?? 0) > 6) score -= ((p.fatigueRPE ?? 0) - 6) * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Once sugerido por el consejero: mejor portero disponible + mejores por form
 * score con equilibrio de líneas (tope por carril). Lesionados y sancionados
 * quedan fuera. Puro — testeable.
 */
export function suggestLineup(players: LivePlayerData[]): Set<string> {
  const elegibles = players.filter(
    (p) => p.status !== "INJURED" && p.status !== "SUSPENDED",
  );
  const byForm = (a: LivePlayerData, b: LivePlayerData) =>
    computeFormScore(b) - computeFormScore(a) ||
    (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99);
  const gks = elegibles.filter((p) => p.primaryPosition === "GK").sort(byForm);
  const resto = elegibles.filter((p) => p.primaryPosition !== "GK").sort(byForm);
  const once: LivePlayerData[] = [];
  if (gks[0]) once.push(gks[0]);
  const caps: Record<string, number> = { DEF: 5, PIV: 2, MID: 4, ATT: 4 };
  const counts: Record<string, number> = { DEF: 0, PIV: 0, MID: 0, ATT: 0 };
  for (const p of resto) {
    if (once.length >= 11) break;
    const lane = LANE_OF[p.primaryPosition] ?? "MID";
    if ((counts[lane] ?? 0) >= (caps[lane] ?? 4)) continue;
    counts[lane] += 1;
    once.push(p);
  }
  // Si los topes dejaron huecos, rellena con los mejores restantes sin tope
  for (const p of resto) {
    if (once.length >= 11) break;
    if (!once.some((q) => q.id === p.id)) once.push(p);
  }
  return new Set(once.map((p) => p.id));
}

/** 4-3-3 rival sobre el campo VERTICAL (ataca hacia abajo: portero arriba) */
const RIVALES_433: [number, number][] = [
  [50, 9], // GK
  [14, 26], [38, 24], [62, 24], [86, 26], // defensa
  [26, 42], [50, 46], [74, 42], // medios
  [20, 80], [50, 83], [80, 80], // delanteros (presionan alto)
];

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
    const lane = LANE_OF[p.primaryPosition] ?? "MID";
    if (!lanes.has(lane)) lanes.set(lane, []);
    lanes.get(lane)!.push(p);
  }
  for (const [lane, group] of lanes) {
    const { y, win, gap } = PITCH_LANES[lane];
    const ordered = [...group].sort((a, b) => {
      const dx = (BASE_X[a.primaryPosition] ?? 50) - (BASE_X[b.primaryPosition] ?? 50);
      if (dx !== 0) return dx;
      return (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99);
    });
    const n = ordered.length;
    if (n === 1) {
      slots.set(ordered[0].id, { x: BASE_X[ordered[0].primaryPosition] ?? 50, y });
      continue;
    }
    // Resuelve colisiones de izquierda a derecha con el gap del carril
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const base = BASE_X[ordered[i].primaryPosition] ?? 50;
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
        chipClass ?? "bg-[#1c3a26]/70 border-[#2a4a34] text-[#dfe9d8]"
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
  initialSession,
  initialEvents,
}: {
  matchId: string;
  players: LivePlayerData[];
  initialEvaluations: LiveEvaluationData[];
  initialSession: MatchSessionDTO | null;
  initialEvents: TelemetryEventDTO[];
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<LivePlayerData | null>(null);

  // ---------- Reloj autoritativo (el servidor manda; el tick solo repinta) ----------
  const [session, setSession] = useState<MatchSessionDTO | null>(initialSession);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsedSeconds = useMemo(() => {
    void tick; // re-calcula cada tick del intervalo
    if (!session) return 0;
    if (session.status !== "LIVE" || !session.clockStartedAt) {
      return session.clockBaseSeconds;
    }
    return (
      session.clockBaseSeconds +
      Math.max(0, (Date.now() - new Date(session.clockStartedAt).getTime()) / 1000)
    );
  }, [session, tick]);
  const currentMinute = minuteOfElapsed(elapsedSeconds);
  const isLive = session?.status === "LIVE";

  // ---------- Telemetría: línea temporal de eventos grabados ----------
  const [events, setEvents] = useState<TelemetryEventDTO[]>(initialEvents);
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [pendingClock, setPendingClock] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  /// 📂 MP4 desde el ordenador (mock del míster): blob local del navegador —
  /// sin subir nada a la nube, se reproduce directo en la pizarra espacial.
  const [localVideo, setLocalVideo] = useState<{ src: string; name: string } | null>(null);
  const localVideoInputRef = useRef<HTMLInputElement>(null);
  /// Liberar el blob anterior al cambiar de archivo y al desmontar (sin fugas)
  useEffect(() => {
    return () => {
      if (localVideo) URL.revokeObjectURL(localVideo.src);
    };
  }, [localVideo]);
  const [spatialOpen, setSpatialOpen] = useState(false);
  const [savingSpatial, setSavingSpatial] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [savingQuick, setSavingQuick] = useState(false);
  const [quickRows, setQuickRows] = useState<QuickEventRow[]>([]);

  const playerName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players) map.set(p.id, `#${p.shirtNumber ?? "·"} ${p.firstName}`);
    return map;
  }, [players]);
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

  // Marca los eventos que ya tienen clip de vídeo (restaurar tras recarga)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/pilar3/matches/${matchId}/telemetry`);
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          bookmarks?: Array<{ telemetryEventId: string }>;
        } | null;
        if (!cancelled && res.ok && data?.ok && data.bookmarks) {
          setBookmarked(new Set(data.bookmarks.map((b) => b.telemetryEventId)));
        }
      } catch {
        // sin marcadores previos: silencio, el tablón ya funciona
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

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

  // ---------- PIZARRA TÁCTIL EN DIRECTO (petición del míster): la alineación
  // titular se vuelca aquí automáticamente y las FICHAS, el BALÓN y los
  // RIVALES se ARRASTRAN con dedo o ratón (Pointer Events + setPointerCapture
  // + touch-action:none, el mismo patrón probado de la pizarra libre y del
  // constructor de animaciones) para explicar de manera táctil. ----------
  type DragTarget =
    | { kind: "starter"; id: string }
    | { kind: "rival"; id: string }
    | { kind: "ball" };
  type RivalFicha = { id: string; num: number; x: number; y: number };

  const [overrides, setOverrides] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [rivals, setRivals] = useState<RivalFicha[]>([]);
  const [ball, setBall] = useState<{ x: number; y: number } | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const suppressClickRef = useRef(false);
  const pitchRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    target: DragTarget;
    offX: number;
    offY: number;
    latest: { x: number; y: number };
    raf: number;
    moved: boolean;
    x0: number;
    y0: number;
  } | null>(null);

  // Posición efectiva de cada titular: slot por demarcación + override del arrastre
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const [id, slot] of slots) map.set(id, slot);
    for (const [id, pos] of overrides) map.set(id, pos);
    return map;
  }, [slots, overrides]);

  const pitchCoords = useCallback((clientX: number, clientY: number) => {
    const rect = pitchRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const commitDrag = useCallback((d: NonNullable<typeof dragRef.current>) => {
    const target = d.target;
    const x = Math.min(98, Math.max(2, d.latest.x));
    const y = Math.min(98, Math.max(2, d.latest.y));
    if (target.kind === "starter") {
      setOverrides((prev) => new Map(prev).set(target.id, { x, y }));
    } else if (target.kind === "rival") {
      setRivals((prev) =>
        prev.map((r) => (r.id === target.id ? { ...r, x, y } : r)),
      );
    } else {
      setBall({ x, y });
    }
  }, []);

  const onPitchPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, target: DragTarget, current: { x: number; y: number }) => {
      const pos = pitchCoords(e.clientX, e.clientY);
      if (!pos) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); // el dedo nunca pierde la ficha
      setDragTarget(target);
      dragRef.current = {
        target,
        offX: pos.x - current.x,
        offY: pos.y - current.y,
        latest: { x: current.x, y: current.y },
        raf: 0,
        moved: false,
        x0: pos.x,
        y0: pos.y,
      };
    },
    [pitchCoords],
  );

  const onPitchPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const pos = pitchCoords(e.clientX, e.clientY);
      if (!pos) return;
      if (!d.moved && Math.hypot(pos.x - d.x0, pos.y - d.y0) > 1.4) d.moved = true;
      d.latest = { x: pos.x - d.offX, y: pos.y - d.offY };
      if (!d.raf) {
        d.raf = requestAnimationFrame(() => {
          d.raf = 0;
          if (dragRef.current === d) commitDrag(d);
        });
      }
    },
    [pitchCoords, commitDrag],
  );

  const onPitchPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.raf) cancelAnimationFrame(d.raf);
      dragRef.current = null;
      setDragTarget(null);
      suppressClickRef.current = d.moved;
      if (d.moved) {
        commitDrag(d);
        // Balón soltado junto a un titular → se coloca a su pie (explicar con el balón)
        if (d.target.kind === "ball") {
          const bx = Math.min(98, Math.max(2, d.latest.x));
          const by = Math.min(98, Math.max(2, d.latest.y));
          let cerca: { x: number; y: number; dist: number } | null = null;
          for (const s of starters) {
            const pos = positions.get(s.id);
            if (!pos) continue;
            const dist = Math.hypot(pos.x - bx, pos.y - by);
            if (dist < 8 && (!cerca || dist < cerca.dist)) cerca = { x: pos.x, y: pos.y, dist };
          }
          if (cerca) {
            const lado = bx <= cerca.x ? -1 : 1;
            setBall({ x: Math.min(97, Math.max(3, cerca.x + lado * 9)), y: cerca.y });
          }
        }
      }
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // el puntero ya no estaba capturado — nada que hacer
      }
    },
    [commitDrag, positions, starters],
  );

  const onPitchPointerCancel = useCallback(() => {
    if (dragRef.current?.raf) cancelAnimationFrame(dragRef.current.raf);
    dragRef.current = null;
    setDragTarget(null);
  }, []);

  const toggleRivales = useCallback(() => {
    setRivals((prev) =>
      prev.length > 0
        ? []
        : RIVALES_433.map((pos, i) => ({
            id: `rival-${i + 1}-${Math.random().toString(36).slice(2, 7)}`,
            num: i + 1,
            x: pos[0],
            y: pos[1],
          })),
    );
  }, []);

  // ---------- CONSEJERO DE ONCE (mock: "Sugerir Once Óptimo ⚡") ----------
  const formScores = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of players) map.set(p.id, computeFormScore(p));
    return map;
  }, [players]);

  const handleConsejero = async () => {
    if (players.length === 0 || savingLineup) return;
    const once = suggestLineup(players);
    const toAdd = [...once].filter((id) => !starterIds.has(id));
    const toRemove = [...starterIds].filter((id) => !once.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) {
      toast({
        title: "El consejero confirma el once actual",
        description: "Nada que cambiar: la alineación ya es la óptima por form score.",
      });
      return;
    }
    setSavingLineup(true);
    try {
      await Promise.all([
        ...toAdd.map((id) => postEvaluation({ playerId: id, isStarter: true })),
        ...toRemove.map((id) => postEvaluation({ playerId: id, isStarter: false })),
      ]);
      setStarterIds((prev) => {
        const set = new Set(prev);
        for (const id of toRemove) set.delete(id);
        for (const id of toAdd) set.add(id);
        return set;
      });
      setOverrides((prev) => {
        const next = new Map(prev);
        for (const id of toRemove) next.delete(id);
        return next;
      });
      toast({
        title: "Consejero: once óptimo propuesto ⚡",
        description: `${toAdd.length} entran · ${toRemove.length} salen · form score = perfiles (1-5) − fatiga RPE − dudas.`,
      });
    } catch (err) {
      console.error("Error aplicando el consejero:", err);
      toast({
        title: "El consejero no pudo aplicar el once",
        description: err instanceof Error ? err.message : "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setSavingLineup(false);
    }
  };

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

  /** Estado de la ficha rápida: 1 toque = guarda ya (optimista, revierte si falla).
   *  Con valor → telemetría (evento minute-stamped + estado del tablón en una
   *  sola llamada). Repetir el mismo valor lo apaga (toggle) sin evento. */
  const handleSetStatus = async (
    playerId: string,
    axis: StatusAxis,
    value: string | null,
    label: string,
  ) => {
    const prev = statuses[playerId] ?? EMPTY_STATUSES;
    setPendingKey(`${axis}:${value ?? "off"}`);
    setStatuses((m) => ({
      ...m,
      [playerId]: { ...prev, [axis]: value, statusUpdatedAt: new Date().toISOString() },
    }));

    if (value !== null) {
      const type =
        axis === "fatigueFlag"
          ? "FATIGUE"
          : axis === "clinicalFlag"
            ? "CLINICAL"
            : "TACTICAL";
      try {
        const data = await postTelemetry({
          events: [{ playerId, type, value }],
        });
        const stamp = data.created?.[0]?.timestamp ?? new Date().toISOString();
        setStatuses((m) => ({
          ...m,
          [playerId]: { ...prev, [axis]: value, statusUpdatedAt: stamp },
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
      return;
    }

    // Toggle OFF (apagar el eje): estado del tablón, sin evento nuevo
    const payload: PostEvalPayload = { playerId, isStarter: starterIds.has(playerId) };
    payload[axis] = null;
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

  // ---------- Telemetría en directo (POST /api/pilar3/events) ----------

  /** Llamada genérica: devuelve el reloj actualizado y los eventos creados */
  const postTelemetry = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/pilar3/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, ...payload }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string; session?: MatchSessionDTO; created?: TelemetryEventDTO[] }
        | null;
      if (!res.ok || !data?.ok || !data.session) {
        throw new Error(data?.error ?? "No se pudo registrar el toque.");
      }
      setSession(data.session);
      if (data.created?.length) {
        setEvents((prev) => [...prev, ...data.created!]);
      }
      return data;
    },
    [matchId],
  );

  /** Control del cronómetro: START / PAUSE / RESUME / FINISH (idempotente) */
  const handleClock = async (action: "START" | "PAUSE" | "RESUME" | "FINISH") => {
    setPendingClock(true);
    try {
      await postTelemetry({ action });
    } catch (err) {
      console.error("Error del reloj en directo:", err);
      toast({
        title: "El reloj no respondió",
        description: err instanceof Error ? err.message : "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setPendingClock(false);
    }
  };

  /** Hecho de juego 1-toque (con o sin responsable) — el minuto lo sella el reloj */
  const handleAction = async (value: string, label: string, playerId?: string) => {
    setPendingAction(value);
    try {
      await postTelemetry({
        events: [{ playerId: playerId ?? null, type: "ACTION", value }],
      });
    } catch (err) {
      console.error("Error registrando el hecho de juego:", err);
      toast({
        title: "No se pudo registrar",
        description: err instanceof Error ? err.message : `${label}: inténtalo de nuevo.`,
        variant: "destructive",
      });
    } finally {
      setPendingAction(null);
    }
  };

  /** Pincha un evento en el vídeo: bookmark automático con el offset de la sesión */
  const handleBookmark = async (telemetryEventId: string) => {
    try {
      const res = await fetch("/api/pilar3/video-bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telemetryEventId }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string; bookmark?: { telemetryEventId: string } }
        | null;
      if (!res.ok || !data?.ok || !data.bookmark) {
        throw new Error(data?.error ?? "No se pudo crear el clip.");
      }
      setBookmarked((prev) => new Set(prev).add(data.bookmark!.telemetryEventId));
      toast({ title: "Clip marcado en el vídeo 🎬" });
    } catch (err) {
      console.error("Error creando el marcador de vídeo:", err);
      toast({
        title: "No se pudo marcar el clip",
        description: err instanceof Error ? err.message : "Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  };

  /** Pizarra espacial: vector causa→efecto + auto-clip en el instante de la causa */
  const handleSpatialSave = async (input: SpatialSaveInput) => {
    setSavingSpatial(true);
    try {
      const data = await postTelemetry({
        events: [
          {
            type: "ACTION",
            value: input.outcome,
            coordinatesX: input.startX,
            coordinatesY: input.startY,
            coordinatesX2: input.endX,
            coordinatesY2: input.endY,
          },
        ],
      });
      const ev = data.created?.[0];
      if (ev && input.videoSeconds != null && session?.videoUrl) {
        const res = await fetch("/api/pilar3/video-bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            telemetryEventId: ev.id,
            videoTimestampSeconds: input.videoSeconds,
          }),
        });
        const bd = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        if (res.ok && bd?.ok) {
          setBookmarked((prev) => new Set(prev).add(ev.id));
        }
      }
      toast({ title: "Causa→efecto registrada ⚡" });
    } catch (err) {
      console.error("Error en la pizarra espacial:", err);
      toast({
        title: "No se pudo registrar el vector",
        description: err instanceof Error ? err.message : "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setSavingSpatial(false);
    }
  };

  /** Análisis dinámico: evento de sección 1-toque + auto-clip del instante
   *  (el minuto lo sella el reloj autoritativo; value = ACTION texto libre) */
  const handleQuickSave = async (input: QuickSaveInput) => {
    setSavingQuick(true);
    try {
      const data = await postTelemetry({
        events: [{ playerId: null, type: "ACTION", value: input.eventLabel }],
      });
      const ev = data.created?.[0];
      if (ev) {
        if (input.videoSeconds != null) {
          try {
            const res = await fetch("/api/pilar3/video-bookmarks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                telemetryEventId: ev.id,
                videoTimestampSeconds: input.videoSeconds,
              }),
            });
            const bd = (await res.json().catch(() => null)) as { ok?: boolean } | null;
            if (res.ok && bd?.ok) {
              setBookmarked((prev) => new Set(prev).add(ev.id));
            }
          } catch {
            // el clip es un extra: el evento ya está registrado sin él
          }
        }
        setQuickRows((prev) => [
          {
            id: ev.id,
            minute: ev.minute,
            clockText: formatClock(elapsedSeconds),
            label: input.eventLabel,
            sectionLabel: input.sectionLabel,
            videoSeconds: input.videoSeconds,
          },
          ...prev,
        ]);
      }
      toast({ title: "Evento registrado en directo ⚡" });
    } catch (err) {
      console.error("Error en el análisis dinámico:", err);
      toast({
        title: "No se pudo registrar el evento",
        description: err instanceof Error ? err.message : "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setSavingQuick(false);
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
      if (!next) {
        // al quitar de la alineación se limpia también su posición arrastrada
        setOverrides((prev) => {
          const map = new Map(prev);
          map.delete(player.id);
          return map;
        });
      }
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
    p.shirtNumber ?? POSITION_SHORT[p.primaryPosition] ?? "·";

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
                  isActive ? `${m.btn} border-2 font-bold shadow-md` : "bg-[#1c3a26]/60 border-[#2a4a34]/80 text-[#c3d2c2] hover:bg-[#1c3a26]"
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
    <div className="space-y-4">
      {/* ---------- RELOJ AUTORITATIVO + HECHOS COLECTIVOS ---------- */}
      <section
        className="rounded-3xl border border-[#1c3a26] bg-[#0f2317] p-4"
        aria-label="Reloj de partido y hechos colectivos"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`font-black tabular-nums leading-none text-5xl sm:text-6xl ${
                session?.status === "LIVE"
                  ? "text-cream"
                  : session?.status === "PAUSED"
                    ? "text-amber-400"
                    : session?.status === "FINISHED"
                      ? "text-[#6d8070]"
                      : "text-[#6d8070]"
              }`}
              aria-label={`Reloj ${formatClock(elapsedSeconds)}`}
            >
              {formatClock(elapsedSeconds)}
            </span>
            <span className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] uppercase tracking-widest text-[#8aa28d] font-bold">
                {session === null
                  ? "Reloj sin arrancar"
                  : session.status === "LIVE"
                    ? `Minuto ${currentMinute} · en juego`
                    : session.status === "PAUSED"
                      ? `Minuto ${currentMinute} · parado`
                      : `Final · minuto ${currentMinute}`}
              </span>
              {isLive && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" aria-hidden />
                  en directo
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {session === null && (
              <button
                onClick={() => handleClock("START")}
                disabled={pendingClock}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-black text-[#0a1a10] hover:bg-brand-500 transition-colors disabled:opacity-60 active:scale-95"
              >
                {pendingClock ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}
                Arrancar reloj
              </button>
            )}
            {session?.status === "LIVE" && (
              <button
                onClick={() => handleClock("PAUSE")}
                disabled={pendingClock}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/60 bg-amber-500/10 px-3.5 py-2.5 text-sm font-bold text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-60 active:scale-95"
              >
                <Pause className="w-4 h-4" aria-hidden /> Descanso
              </button>
            )}
            {session?.status === "PAUSED" && (
              <button
                onClick={() => handleClock("RESUME")}
                disabled={pendingClock}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm font-black text-[#0a1a10] hover:bg-brand-500 transition-colors disabled:opacity-60 active:scale-95"
              >
                <Play className="w-4 h-4" aria-hidden /> Reanudar
              </button>
            )}
            {session && session.status !== "FINISHED" && (
              <button
                onClick={() => handleClock("FINISH")}
                disabled={pendingClock}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#2a4a34] bg-[#0a1a10] px-3.5 py-2.5 text-sm font-bold text-[#a9bca9] hover:bg-[#1c3a26] transition-colors disabled:opacity-60 active:scale-95"
              >
                <Square className="w-4 h-4" aria-hidden /> Final
              </button>
            )}
            <button
              onClick={() => setVideoOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#2a4a34] bg-[#0a1a10] px-3.5 py-2.5 text-sm font-bold text-[#dfe9d8] hover:bg-[#1c3a26] transition-colors active:scale-95"
              aria-label="Sincronizar vídeo de la grabación"
            >
              <Video className="w-4 h-4" aria-hidden />
              {session?.videoUrl ? "Vídeo ✓" : "Vídeo"}
            </button>
            <input
              ref={localVideoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              data-testid="local-video-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setLocalVideo({ src: URL.createObjectURL(file), name: file.name });
                e.target.value = ""; // permite volver a elegir el mismo archivo
              }}
            />
            <button
              onClick={() => localVideoInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-600/60 bg-brand-600/10 px-3.5 py-2.5 text-sm font-bold text-brand-400 hover:bg-brand-600/20 transition-colors active:scale-95"
              aria-label="Cargar vídeo MP4 desde el ordenador"
              data-testid="btn-local-video"
            >
              📂 {localVideo ? "Cambiar MP4" : "MP4 local"}
            </button>
            {localVideo && (
              <button
                onClick={() => {
                  URL.revokeObjectURL(localVideo.src);
                  setLocalVideo(null);
                }}
                className="inline-flex max-w-[180px] items-center gap-1 rounded-xl border border-[#2a4a34] bg-[#0a1a10] px-2.5 py-2.5 font-mono text-[11px] text-brand-400 hover:bg-[#1c3a26] transition-colors active:scale-95"
                title="Quitar el vídeo local"
                data-testid="local-video-name"
              >
                <span className="truncate">📁 {localVideo.name}</span> ✕
              </button>
            )}
            <button
              onClick={() => setSpatialOpen((v) => !v)}
              aria-expanded={spatialOpen}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm font-bold transition-colors active:scale-95 ${
                spatialOpen
                  ? "border-brand-600/60 bg-brand-600/15 text-brand-400"
                  : "border-[#2a4a34] bg-[#0a1a10] text-[#dfe9d8] hover:bg-[#1c3a26]"
              }`}
              aria-label="Pizarra espacial causa a efecto"
              data-testid="btn-espacial"
            >
              <Crosshair className="w-4 h-4" aria-hidden />
              Espacial
            </button>
            <button
              onClick={() => setQuickOpen((v) => !v)}
              aria-expanded={quickOpen}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm font-bold transition-colors active:scale-95 ${
                quickOpen
                  ? "border-brand-600/60 bg-brand-600/15 text-brand-400"
                  : "border-[#2a4a34] bg-[#0a1a10] text-[#dfe9d8] hover:bg-[#1c3a26]"
              }`}
              aria-label="Análisis dinámico en directo con secciones rápidas"
              data-testid="btn-dinamico"
            >
              <Zap className="w-4 h-4" aria-hidden />
              Dinámico
            </button>
          </div>
        </div>

        {/* Hechos colectivos 1-toque (sin responsable claro) */}
        {session && session.status !== "FINISHED" && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[#1c3a26] pt-3">
            {TEAM_ACTIONS.map((a) => (
              <button
                key={a.value}
                onClick={() => handleAction(a.value, a.label)}
                disabled={pendingAction !== null}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-all active:scale-95 disabled:opacity-50 ${
                  a.tone === "negative"
                    ? "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                    : "border-brand-600/50 bg-brand-600/10 text-lime-brand hover:bg-brand-600/20"
                }`}
                aria-label={`Registrar ${a.label}`}
              >
                <span aria-hidden>{a.emoji}</span> {a.label}
                {pendingAction === a.value && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                )}
              </button>
            ))}
            <span className="self-center text-[10px] text-[#6d8070] ml-1">
              se sellan con el minuto {currentMinute}&prime;
            </span>
          </div>
        )}
      </section>

      <div className="flex flex-col lg:flex-row gap-4 p-4 rounded-3xl border border-[#1c3a26] bg-[#0a1a10]">
      {/* ---------- Terreno de juego (alineación volcada + fichas arrastrables) ---------- */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-widest text-lime-brand font-bold flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-brand-400 animate-pulse" aria-hidden />
            Terreno de juego · Directo
          </div>
          <span className="text-[11px] text-lime-brand/70">
            {starters.length} titulares volcados · {bench.length} en la banqueta
            {ball ? " · balón en juego" : ""}
          </span>
        </div>

        {/* Material de pizarra en directo (mock del míster: explicar de manera táctil) */}
        <div
          className="flex flex-wrap items-center gap-2 mb-3"
          role="toolbar"
          aria-label="Material de la pizarra en directo: consejero de once, balón y fichas rivales"
        >
          <button
            type="button"
            onClick={handleConsejero}
            disabled={savingLineup || players.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-400/15 px-3 py-1.5 min-h-[36px] text-[11px] font-black text-amber-300 transition hover:bg-amber-400/25 active:scale-[0.97] disabled:opacity-50"
            title="Sugiere el once óptimo por form score: perfiles (1-5) − fatiga RPE − dudas. Se guarda como alineación de partida."
          >
            {savingLineup ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Zap className="w-3.5 h-3.5" aria-hidden />
            )}
            Consejero de once
          </button>
          <button
            type="button"
            onClick={() => setBall((b) => (b ? null : { x: 50, y: 46 }))}
            aria-pressed={ball !== null}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 min-h-[36px] text-[11px] font-bold transition active:scale-[0.97] ${
              ball
                ? "border-lime-brand/60 bg-lime-brand/15 text-lime-brand"
                : "border-[#2a4a34] bg-[#1c3a26]/60 text-[#c3d2c2] hover:bg-[#1c3a26]"
            }`}
            title="Balón arrastrable: suéltalo junto a un titular y queda a su pie"
          >
            <span aria-hidden>⚽</span> {ball ? "Quitar balón" : "Balón"}
          </button>
          <button
            type="button"
            onClick={toggleRivales}
            aria-pressed={rivals.length > 0}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 min-h-[36px] text-[11px] font-bold transition active:scale-[0.97] ${
              rivals.length > 0
                ? "border-[#e05252]/60 bg-[#e05252]/15 text-[#f3b0b0]"
                : "border-[#2a4a34] bg-[#1c3a26]/60 text-[#c3d2c2] hover:bg-[#1c3a26]"
            }`}
            title="11 fichas rivales arrastrables para explicar la presión y el bloque contrario"
          >
            <span aria-hidden>🟥</span> {rivals.length > 0 ? "Quitar rivales" : "Rivales 4-3-3"}
          </button>
        </div>
        <p className="mb-3 text-[11px] leading-snug text-[#8aa28d]">
          La alineación titular se vuelca aquí automáticamente por demarcación · arrastra fichas,
          rivales y balón con el dedo o el ratón para explicar · toca una ficha para evaluar.
        </p>

        {players.length === 0 ? (
          <div className="rounded-2xl border-4 border-brand-600/30 bg-brand/30 px-6 py-10 text-center text-sm text-lime-soft/70">
            Aún no hay jugadores en la plantilla. Da de alta al equipo en
            &ldquo;Plantilla&rdquo; para poder evaluar en directo.
          </div>
        ) : (
          <div
            ref={pitchRef}
            className="relative w-full max-w-[430px] mx-auto aspect-[2/3] rounded-2xl border-4 border-brand-600/40 bg-brand/40 overflow-hidden shadow-inner"
            aria-label="Terreno de juego táctil: fichas de titulares, rivales y balón arrastrables con dedo o ratón"
          >
            {/* Marcas del campo */}
            <div className="absolute left-0 right-0 top-1/2 border-t-2 border-lime-brand/20" aria-hidden />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[26%] aspect-square rounded-full border-2 border-lime-brand/20"
              aria-hidden
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 top-0 w-[46%] h-[12%] border-x-2 border-b-2 border-lime-brand/20 rounded-b-lg"
              aria-hidden
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[46%] h-[12%] border-x-2 border-t-2 border-lime-brand/20 rounded-t-lg"
              aria-hidden
            />

            {starters.length === 0 ? (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-2xl border border-dashed border-brand-600/40 bg-[#071509]/60 px-4 py-6 text-center text-xs text-lime-soft/70">
                Toca un jugador de la banqueta y márcalo como titular para sacarlo
                al terreno de juego. Los titulares se colocan solos según su
                demarcación.
              </div>
            ) : (
              starters.map((player) => {
                const pos = positions.get(player.id);
                const s = statuses[player.id];
                const dragging =
                  dragTarget?.kind === "starter" && dragTarget.id === player.id;
                return (
                  <button
                    key={player.id}
                    onPointerDown={(e) =>
                      pos && onPitchPointerDown(e, { kind: "starter", id: player.id }, pos)
                    }
                    onPointerMove={onPitchPointerMove}
                    onPointerUp={onPitchPointerUp}
                    onPointerCancel={onPitchPointerCancel}
                    onClick={() => {
                      // tras un arrastre real no se abre la ficha rápida
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                      setSelected(player);
                    }}
                    style={{
                      ...(pos ? { left: `${pos.x}%`, top: `${pos.y}%` } : {}),
                      transform: `translate(-50%, -50%) scale(${
                        dragging ? 1.18 : selected?.id === player.id ? 1.1 : 1
                      })`,
                      transition: dragging ? "none" : "left 180ms, top 180ms, transform 120ms",
                      willChange: "left, top",
                      touchAction: "none",
                      zIndex: dragging ? 30 : 10,
                    }}
                    className={`absolute flex flex-col items-center ${
                      dragging ? "cursor-grabbing" : "cursor-grab"
                    }`}
                    aria-label={`${player.firstName} ${player.lastName}, ${POSITION_LABEL[player.primaryPosition] ?? player.primaryPosition}, ${tagCounts[player.id] ?? 0} anotaciones. Arrastra para explicar, toca para evaluar.`}
                    title="Arrastra para explicar · toca para evaluar"
                  >
                    <span
                      className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-black border-2 shadow-lg transition-colors ${
                        selected?.id === player.id
                          ? "bg-amber-400 border-[#e3a93c] text-[#0a1a10]"
                          : "bg-[#071509]/85 border-brand-400/70 text-cream"
                      } ${dragging ? "ring-2 ring-white/80" : ""}`}
                    >
                      {chipBadge(player)}
                    </span>
                    <span className="mt-0.5 px-1 rounded bg-[#071509]/80 text-[10px] leading-tight font-semibold text-[#eef2e0] max-w-[78px] truncate pointer-events-none">
                      {player.firstName}
                    </span>
                    <StatusDots s={s} />
                  </button>
                );
              })
            )}

            {/* Balón arrastrable (petición del míster): soltado junto a un titular queda a su pie */}
            {ball && (
              <div
                onPointerDown={(e) => onPitchPointerDown(e, { kind: "ball" }, ball)}
                onPointerMove={onPitchPointerMove}
                onPointerUp={onPitchPointerUp}
                onPointerCancel={onPitchPointerCancel}
                role="button"
                aria-label="Balón arrastrable: suéltalo junto a un jugador para dejarlo a su pie"
                style={{
                  left: `${ball.x}%`,
                  top: `${ball.y}%`,
                  transform: `translate(-50%, -50%) scale(${dragTarget?.kind === "ball" ? 1.25 : 1})`,
                  transition:
                    dragTarget?.kind === "ball" ? "none" : "left 150ms, top 150ms, transform 120ms",
                  touchAction: "none",
                  zIndex: dragTarget?.kind === "ball" ? 40 : 20,
                }}
                className="absolute flex items-center justify-center h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-white border-2 border-neutral-800 shadow-md cursor-grab active:cursor-grabbing"
              >
                <span className="text-[10px] leading-none" aria-hidden>
                  ⚽
                </span>
              </div>
            )}

            {/* Fichas rivales arrastrables (explicar la presión y el bloque contrario) */}
            {rivals.map((r) => {
              const dragging = dragTarget?.kind === "rival" && dragTarget.id === r.id;
              return (
                <div
                  key={r.id}
                  onPointerDown={(e) =>
                    onPitchPointerDown(e, { kind: "rival", id: r.id }, { x: r.x, y: r.y })
                  }
                  onPointerMove={onPitchPointerMove}
                  onPointerUp={onPitchPointerUp}
                  onPointerCancel={onPitchPointerCancel}
                  role="button"
                  aria-label={`Ficha rival ${r.num}, arrastrable`}
                  style={{
                    left: `${r.x}%`,
                    top: `${r.y}%`,
                    transform: `translate(-50%, -50%) scale(${dragging ? 1.18 : 1})`,
                    transition: dragging ? "none" : "left 150ms, top 150ms, transform 120ms",
                    touchAction: "none",
                    zIndex: dragging ? 40 : 10,
                  }}
                  className="absolute flex flex-col items-center cursor-grab active:cursor-grabbing"
                >
                  <span
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-[#e05252] to-[#b4232a] border-2 border-white/60 shadow-md flex items-center justify-center text-[10px] sm:text-[11px] font-black text-white ${
                      dragging ? "ring-2 ring-white/80" : ""
                    }`}
                  >
                    {r.num}
                  </span>
                  <span className="mt-0.5 rounded bg-black/45 px-1 text-[8px] sm:text-[9px] font-bold leading-tight text-white/90 pointer-events-none">
                    R{r.num}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {players.length > 0 && (
          <p className="mt-2 text-center text-[10px] text-lime-soft/50" aria-hidden>
            🟢 arriba · 🟡 al límite · 🔴 pide cambio · ⚠️/❌ clínico · ⭐ plan claro · el balón soltado junto a un titular queda a su pie
          </p>
        )}
      </div>

      {/* ---------- Banqueta de suplentes ---------- */}
      <div className="w-full lg:w-72 bg-[#0f2317] p-4 rounded-2xl border border-[#1c3a26] flex flex-col">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-[#a9bca9] mb-3">
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
                    ? "bg-amber-400 text-[#0a1a10] font-bold"
                    : "bg-[#1c3a26]/60 hover:bg-[#1c3a26] text-[#dfe9d8]"
                }`}
              >
                <span className="w-8 h-8 rounded-full bg-[#2a4a34] text-cream font-bold flex items-center justify-center text-xs shrink-0">
                  {chipBadge(player)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm truncate">
                    {player.firstName} {player.lastName}
                  </span>
                  <span className="block text-[10px] uppercase tracking-wide opacity-60">
                    {POSITION_SHORT[player.primaryPosition] ?? player.primaryPosition}
                  </span>
                </span>
                <span className="ml-auto flex items-center gap-1.5 shrink-0">
                  <span
                    className="font-mono text-[10px] text-lime-brand/70"
                    title="Form score: perfiles (1-5) − fatiga RPE − dudas de disponibilidad"
                  >
                    Form {formScores.get(player.id) ?? 0}
                  </span>
                  <StatusDots s={s} size="xs" />
                  {(tagCounts[player.id] ?? 0) > 0 && (
                    <span className="flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-amber-400 text-[#0a1a10] text-[10px] font-black">
                      {tagCounts[player.id]}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          {bench.length === 0 && players.length > 0 && (
            <p className="text-xs text-[#8aa28d] px-1 py-2">
              Todo el equipo está sobre el césped.
            </p>
          )}
        </div>
      </div>

      {/* ---------- Ficha rápida flotante del jugador seleccionado ---------- */}
      {selected && currentStatuses && (
        <div
          className="fixed inset-0 bg-[#071509]/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Evaluar a ${selected.firstName} ${selected.lastName}`}
        >
          <div
            className="bg-[#0f2317] border border-[#1c3a26] rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera de la ficha */}
            <div className="flex justify-between items-center border-b border-[#1c3a26] pb-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-full bg-brand-600 text-[#0a1a10] font-black text-lg flex items-center justify-center shrink-0">
                  {chipBadge(selected)}
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-cream truncate">
                    {selected.firstName} {selected.lastName}
                  </h3>
                  <span className="text-xs text-[#a9bca9]">
                    {POSITION_LABEL[selected.primaryPosition] ?? selected.primaryPosition} ·{" "}
                    {starterIds.has(selected.id) ? "Titular" : "Suplente"}
                    {session && session.status !== "FINISHED"
                      ? ` · minuto ${currentMinute}\u2032`
                      : ""}
                    {currentStatuses.statusUpdatedAt
                      ? ` · estado ${format(new Date(currentStatuses.statusUpdatedAt), "HH:mm'h'")}`
                      : ""}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-[#a9bca9] hover:text-cream text-xl font-bold p-1"
                aria-label="Cerrar ficha"
              >
                ✕
              </button>
            </div>

            {/* Ficha de hoy (Pilar 2 · pre-partido) + form score del consejero */}
            <div className="rounded-xl bg-[#071509]/60 border border-[#1c3a26] p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8aa28d] mb-2">
                Ficha de hoy · antes del pitido
              </p>
              <div className="flex flex-wrap gap-1.5">
                <PreMatchChip
                  label={`Form ${formScores.get(selected.id) ?? 0}`}
                  text="Form score del consejero: perfiles técnico/táctico/físico (1-5) menos fatiga RPE y dudas de disponibilidad"
                  chipClass="bg-amber-400/15 text-amber-300 border-amber-400/40"
                />
                {selected.fatigueRPE !== null && rpeLoadLevel(selected.fatigueRPE) && (
                  <PreMatchChip
                    label={`RPE ${selected.fatigueRPE}`}
                    text={`Carga reciente: ${RPE_LOAD_META[rpeLoadLevel(selected.fatigueRPE)!].label}`}
                    chipClass={RPE_LOAD_META[rpeLoadLevel(selected.fatigueRPE)!].chip}
                  />
                )}
                {selected.status !== "AVAILABLE" && PLAYER_STATUS_META[selected.status] && (
                  <PreMatchChip
                    label={PLAYER_STATUS_META[selected.status].label}
                    text={selected.statusNote ?? PLAYER_STATUS_META[selected.status].label}
                    chipClass={PLAYER_STATUS_META[selected.status].chip}
                  />
                )}
                {selected.medicalNotes && (
                  <PreMatchChip label="Clínico" text={selected.medicalNotes} />
                )}
                {selected.academicStress && (
                  <PreMatchChip label="Académico" text={selected.academicStress} />
                )}
                {selected.tacticalStrength && (
                  <PreMatchChip
                    label="Fortaleza"
                    text={selected.tacticalStrength}
                    chipClass="bg-violet-500/15 text-violet-300 border-violet-500/40"
                  />
                )}
              </div>
            </div>

            {/* Estado en directo (1 toque — el último toque gana, repetir apaga) */}
            {renderStatusGroup(
              "Semáforo de fatiga",
              "text-brand-400",
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

            {/* Hechos de juego 1-toque con responsable (el minuto lo sella el reloj) */}
            {session && session.status !== "FINISHED" && (
              <div className="space-y-2 border-t border-[#1c3a26] pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8aa28d]">
                  Hechos de juego · minuto {currentMinute}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {PLAYER_ACTIONS.map((a) => (
                    <button
                      key={a.value}
                      disabled={pendingAction !== null}
                      onClick={() => handleAction(a.value, a.label, selected.id)}
                      className={`flex items-center gap-2 p-2.5 text-xs rounded-lg border transition-all active:scale-95 disabled:opacity-50 ${
                        a.tone === "positive"
                          ? "bg-brand-600/10 hover:bg-brand-600/20 border-brand-600/40 text-lime-brand"
                          : a.tone === "negative"
                            ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/40 text-red-300"
                            : "bg-[#1c3a26]/60 border-[#2a4a34] text-[#dfe9d8]"
                      }`}
                      aria-label={`Registrar ${a.label} para ${selected.firstName} ${selected.lastName}`}
                    >
                      <span className="text-base shrink-0" aria-hidden>{a.emoji}</span>
                      <span className="truncate">{a.label}</span>
                      {pendingAction === a.value && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto shrink-0" aria-hidden />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Anotaciones tácticas acumulativas (tags) */}
            <div className="space-y-4 border-t border-[#1c3a26] pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8aa28d]">
                Anotaciones tácticas · se acumulan
              </p>
              {(["POSITIVE", "CORRECTIVE"] as const).map((tone) => {
                const items = tone === "POSITIVE" ? POSITIVE_CODES : CORRECTIVE_CODES;
                const accent = tone === "POSITIVE" ? "text-brand-400" : "text-amber-400";
                return (
                  <div key={tone} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {items.map((tag) => (
                      <button
                        key={tag.code}
                        disabled={pendingKey !== null}
                        onClick={() => handleAddTag(selected, tag.code, tag.label)}
                        className={`flex items-center justify-between p-2.5 text-xs rounded-lg transition-all active:scale-95 disabled:opacity-50 ${
                          tone === "POSITIVE"
                            ? "bg-brand-600/10 hover:bg-brand-600/20 border border-brand-600/40 text-lime-brand"
                            : "bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-[#e3a93c]"
                        }`}
                      >
                        <span>{tag.label}</span>
                        <span className={`font-bold ${tone === "POSITIVE" ? "text-brand-400" : "text-amber-400"}`}>
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
            <div className="bg-[#0a1a10] p-2.5 rounded-lg border border-[#1c3a26] text-xs text-[#a9bca9] flex items-center justify-between gap-3">
              <span>
                Anotaciones en este partido:{" "}
                <span className="font-bold text-cream">{tagCounts[selected.id] ?? 0} registro(s)</span>
              </span>
              <button
                onClick={() => handleToggleStarter(selected)}
                disabled={savingLineup}
                className="shrink-0 rounded-md border border-[#2a4a34] bg-[#0f2317] px-2.5 py-1.5 text-[11px] font-semibold text-[#dfe9d8] hover:bg-[#1c3a26] disabled:opacity-50"
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

      {/* ---------- Línea temporal de la telemetría (clip-review) ---------- */}
      {events.length > 0 && (
        <section
          className="rounded-3xl border border-[#1c3a26] bg-[#0f2317] p-4"
          aria-label="Línea temporal de eventos grabados"
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-[#a9bca9] flex items-center gap-2">
              <Flag className="w-4 h-4 text-brand-400" aria-hidden />
              Línea del partido · {events.length} toque{events.length === 1 ? "" : "s"}
            </h4>
            {session?.videoUrl && (
              <span className="text-[10px] text-[#6d8070]">
                📌 marca el instante exacto del vídeo
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
            {[...events].reverse().slice(0, 40).map((e) => (
              <div
                key={e.id}
                className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                  bookmarked.has(e.id)
                    ? "border-brand-600/60 bg-brand-600/10"
                    : "border-[#1c3a26] bg-[#0a1a10]"
                }`}
              >
                <span className="font-black tabular-nums text-cream shrink-0 w-9 text-right">
                  {e.minute}&prime;
                </span>
                <span aria-hidden>{eventEmoji(e)}</span>
                <span className="truncate text-[#dfe9d8]">
                  {eventLabel(e)}
                  {e.playerId && playerName.get(e.playerId) && (
                    <span className="text-[#8aa28d]"> · {playerName.get(e.playerId)}</span>
                  )}
                </span>
                <button
                  onClick={() => handleBookmark(e.id)}
                  disabled={bookmarked.has(e.id)}
                  className={`ml-auto shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                    bookmarked.has(e.id)
                      ? "bg-brand-600/25 text-brand-400"
                      : "bg-[#1c3a26] text-[#a9bca9] hover:bg-[#2a4a34]"
                  }`}
                  aria-label={bookmarked.has(e.id) ? "Ya marcado en el vídeo" : "Marcar instante en el vídeo"}
                >
                  <Pin className="w-3 h-3" aria-hidden />
                  {bookmarked.has(e.id) ? "en vídeo" : "clip"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Pizarra espacial causa→efecto ---------- */}
      {spatialOpen && (
        <SpatialEventWhiteboard
          session={session}
          elapsedSeconds={elapsedSeconds}
          events={events.filter((e) => e.coordinatesX2 != null && e.coordinatesY2 != null)}
          saving={savingSpatial}
          onSaveEvent={handleSpatialSave}
          localVideo={localVideo}
          onPickLocalVideo={() => localVideoInputRef.current?.click()}
        />
      )}

      {/* ---------- Análisis dinámico: cronómetro & secciones rápidas ---------- */}
      {quickOpen && (
        <QuickChronoBoard
          session={session}
          elapsedSeconds={elapsedSeconds}
          saving={savingQuick}
          rows={quickRows}
          onSaveEvent={handleQuickSave}
          localVideo={localVideo}
          onPickLocalVideo={() => localVideoInputRef.current?.click()}
        />
      )}

      {/* ---------- Panel de sincronización de vídeo ---------- */}
      {videoOpen && (
        <VideoSyncPanel
          session={session}
          elapsedSeconds={elapsedSeconds}
          onSave={async (videoUrl, offset) => {
            await postTelemetry({
              action: "SET_VIDEO",
              videoUrl,
              videoOffsetSeconds: offset,
            });
            setVideoOpen(false);
          }}
          onClose={() => setVideoOpen(false)}
        />
      )}
    </div>
  );
}

// ---------- Panel: sincronizar la grabación con el reloj del partido ----------

/**
 * El míster pone el vídeo en el instante en que está el reloj AHORA, escribe
 * el segundo del vídeo y pulsa guardar: offset = segundo_vídeo − reloj.
 * A partir de ahí, TODO evento queda enlazable a su timecode:
 * segundo_vídeo = (minuto · 60) + offset. Sincronizar una vez, servir siempre.
 */
function VideoSyncPanel({
  session,
  elapsedSeconds,
  onSave,
  onClose,
}: {
  session: MatchSessionDTO | null;
  elapsedSeconds: number;
  onSave: (videoUrl: string | null, offsetSeconds: number) => Promise<void>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [url, setUrl] = useState(session?.videoUrl ?? "");
  const [videoSecond, setVideoSecond] = useState<string>(() => {
    // Precarga el segundo de vídeo que correspondería AHORA con el offset guardado
    if (!session) return "";
    return String(Math.round(elapsedSeconds + session.videoOffsetSeconds));
  });
  const [saving, setSaving] = useState(false);

  const parsedSecond = Number(videoSecond);
  const secondValid =
    videoSecond === "" || (Number.isFinite(parsedSecond) && parsedSecond >= 0);

  const handleSave = async () => {
    if (!secondValid) return;
    setSaving(true);
    try {
      const offset =
        videoSecond === ""
          ? session?.videoOffsetSeconds ?? 0
          : Math.max(-7200, Math.min(7200, parsedSecond - Math.floor(elapsedSeconds)));
      await onSave(url.trim() ? url.trim() : null, offset);
      toast({ title: "Vídeo sincronizado 🎬", description: "Los clips se marcarán con el timecode exacto." });
    } catch (err) {
      console.error("Error guardando el vídeo:", err);
      toast({
        title: "No se pudo guardar el vídeo",
        description: err instanceof Error ? err.message : "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-[#071509]/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sincronizar vídeo"
    >
      <div
        className="bg-[#0f2317] border border-[#1c3a26] rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b border-[#1c3a26] pb-3">
          <h3 className="text-lg font-bold text-cream flex items-center gap-2">
            <Video className="w-5 h-5 text-brand-400" aria-hidden /> Vídeo de la grabación
          </h3>
          <button
            onClick={onClose}
            className="text-[#a9bca9] hover:text-cream text-xl font-bold p-1"
            aria-label="Cerrar panel de vídeo"
          >
            ✕
          </button>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="video-url" className="text-xs font-bold text-[#6c8070] uppercase tracking-widest">
            Enlace del vídeo (YouTube o mp4 directo)
          </label>
          <input
            id="video-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtu.be/… o https://…/video.mp4"
            className="w-full rounded-lg border border-[#2a4a34] bg-[#0a1a10] px-3 py-2.5 text-sm text-cream placeholder:text-[#4a5f4c] focus:outline-none focus:border-brand-500"
          />
          {(() => {
            const parsed = parseVideoUrl(url);
            if (!url.trim()) return null;
            if (parsed?.kind === "youtube")
              return (
                <p className="text-[11px] font-semibold text-brand-400">
                  ▶ YouTube detectado — se incrustará en la pizarra con timecode exacto.
                </p>
              );
            if (parsed?.kind === "direct")
              return (
                <p className="text-[11px] font-semibold text-[#a9bca9]">
                  ✓ Vídeo directo — reproducción nativa en la pizarra.
                </p>
              );
            return (
              <p className="text-[11px] font-semibold text-amber-400">
                ⚠ El enlace no parece una URL de vídeo válida (http/https).
              </p>
            );
          })()}
        </div>

        <p className="text-[11px] leading-snug text-[#8aa28d]">
          ¿El partido está grabado en tu disco duro? No hace falta subir nada:
          en la cabecera del tablero usa{" "}
          <strong className="text-[#a9bca9]">📂 MP4 local</strong> y la pizarra lo
          reproduce con el mismo timecode y auto-clips.
        </p>

        <div className="space-y-1.5">
          <label htmlFor="video-second" className="text-xs font-bold text-[#6c8070] uppercase tracking-widest">
            El vídeo está ahora en el segundo…
          </label>
          <input
            id="video-second"
            type="number"
            inputMode="numeric"
            min={0}
            value={videoSecond}
            onChange={(e) => setVideoSecond(e.target.value)}
            placeholder="p. ej. 540"
            className={`w-full rounded-lg border bg-[#0a1a10] px-3 py-2.5 text-sm text-cream placeholder:text-[#4a5f4c] focus:outline-none ${
              secondValid ? "border-[#2a4a34] focus:border-brand-500" : "border-red-500/70"
            }`}
          />
          <p className="text-[11px] leading-snug text-[#8aa28d]">
            Pon el vídeo en el mismo instante que el reloj{" "}
            <span className="font-bold text-cream">{formatClock(elapsedSeconds)}</span> y escribe
            el segundo del vídeo. Así cada toque quedará enlazado a su timecode exacto
            para el clip-review.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !secondValid}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-black text-[#0a1a10] hover:bg-brand-500 transition-colors disabled:opacity-60 active:scale-[0.98]"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Video className="w-4 h-4" aria-hidden />}
          Guardar sincronización
        </button>
      </div>
    </div>
  );
}
