// ============================================================================
// TAXONOMÍA COMPARTIDA — El vocabulario táctico de la Cátedra en la UI
// ----------------------------------------------------------------------------
// Fuente única de verdad para etiquetas, colores y agrupaciones. La usan
// componentes de servidor y de cliente (sin dependencias de Prisma).
// ============================================================================

import {
  Cloud,
  Crosshair,
  FastForward,
  Flag,
  Goal,
  Hand,
  HeartPulse,
  Landmark,
  Shield,
  ShieldAlert,
  Swords,
  TrendingDown,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

// ---------- Posiciones ----------

export const POSITION_LABEL: Record<string, string> = {
  GK: "Portero",
  CB: "Central",
  LB: "Lateral izq.",
  RB: "Lateral der.",
  LWB: "Carrilero izq.",
  RWB: "Carrilero der.",
  DM: "Pivote defensivo",
  CM: "Medio centro",
  AM: "Mediapunta",
  LM: "Interior izq.",
  RM: "Interior der.",
  LW: "Extremo izq.",
  RW: "Extremo der.",
  SS: "Media punta",
  CF: "Delantero centro",
};

export const ALL_POSITIONS = Object.keys(POSITION_LABEL);

/** Filtros rápidos por demarcación principal (1 toque) */
export const POSITION_GROUPS: Array<{
  key: string;
  label: string;
  positions: string[];
}> = [
  { key: "GK", label: "Porteros", positions: ["GK"] },
  { key: "DEF", label: "Defensas", positions: ["CB", "LB", "RB", "LWB", "RWB"] },
  { key: "MED", label: "Medios", positions: ["DM", "CM", "AM", "LM", "RM"] },
  { key: "DEL", label: "Ataque", positions: ["LW", "RW", "SS", "CF"] },
];

export function positionGroupKey(pos: string): string {
  const group = POSITION_GROUPS.find((g) => g.positions.includes(pos));
  return group?.key ?? "MED";
}

/**
 * Normaliza cualquier denominación (código internacional o castellano de
 * cantera) a la Position del enum. Insensible a mayúsculas y acentos.
 * Devuelve null si no es reconocible.
 */
export function normalizePosition(raw: string): string | null {
  const s = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!s) return null;

  const aliases: Record<string, string> = {
    gk: "GK", portero: "GK", portera: "GK", guardameta: "GK", pt: "GK", goalkeeper: "GK",
    cb: "CB", dfc: "CB", central: "CB", "defensa central": "CB", zaga: "CB",
    lb: "LB", li: "LB", "lateral izquierdo": "LB", "lateral izq": "LB", "lateral izquierda": "LB",
    rb: "RB", ld: "RB", "lateral derecho": "RB", "lateral der": "RB",
    lwb: "LWB", ci: "LWB", "carrilero izquierdo": "LWB", "carrilero izq": "LWB",
    rwb: "RWB", cd: "RWB", "carrilero derecho": "RWB", "carrilero der": "RWB",
    dm: "DM", mcd: "DM", pivote: "DM", pivot: "DM", "medio centro defensivo": "DM", "mediocentro defensivo": "DM",
    cm: "CM", mc: "CM", "medio centro": "CM", mediocentro: "CM",
    am: "AM", mco: "AM", mediapunta: "AM", "media punta": "AM", "medio centro ofensivo": "AM", "mediocentro ofensivo": "AM",
    lm: "LM", mi: "LM", "interior izquierdo": "LM", "interior izq": "LM",
    rm: "RM", md: "RM", "interior derecho": "RM", "interior der": "RM",
    lw: "LW", ei: "LW", "extremo izquierdo": "LW", "extremo izq": "LW", "extremo izquierda": "LW",
    rw: "RW", ed: "RW", "extremo derecho": "RW", "extremo der": "RW",
    ss: "SS", sd: "SS", "segundo delantero": "SS", "media punta alta": "SS", "segunda punta": "SS",
    cf: "CF", dc: "CF", "delantero centro": "CF", delantero: "CF", ariete: "CF", punta: "CF",
  };
  return aliases[s] ?? null;
}

// ---------- Semáforo universal ----------

export const SEMAPHORE_META: Record<
  string,
  { label: string; hint: string; dot: string; btn: string; text: string; bg: string; border: string }
> = {
  GREEN: {
    label: "Verde",
    hint: "Buen sabor de boca",
    dot: "bg-emerald-400",
    btn: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300",
    text: "text-emerald-300",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/40",
  },
  AMBER: {
    label: "Ámbar",
    hint: "Con matices",
    dot: "bg-amber-400",
    btn: "bg-amber-500/15 border-amber-500/50 text-amber-300",
    text: "text-amber-300",
    bg: "bg-amber-500/15",
    border: "border-amber-500/40",
  },
  RED: {
    label: "Rojo",
    hint: "Preocupado",
    dot: "bg-rose-400",
    btn: "bg-rose-500/15 border-rose-500/50 text-rose-300",
    text: "text-rose-300",
    bg: "bg-rose-500/15",
    border: "border-rose-500/40",
  },
};

export const PLAYER_STATUS_META: Record<
  string,
  { label: string; chip: string; dot: string }
> = {
  AVAILABLE: { label: "Disponible", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40", dot: "bg-emerald-400" },
  INJURED: { label: "Lesionado", chip: "bg-rose-500/15 text-rose-300 border-rose-500/40", dot: "bg-rose-400" },
  SUSPENDED: { label: "Sancionado", chip: "bg-amber-500/15 text-amber-300 border-amber-500/40", dot: "bg-amber-400" },
  RETURNING: { label: "Reincorporación", chip: "bg-sky-500/15 text-sky-300 border-sky-500/40", dot: "bg-sky-400" },
};

// ---------- Eventing de la pizarra ----------

export const EVENT_META: Record<
  string,
  {
    label: string;
    short: string;
    icon: LucideIcon;
    /** clase del botón seleccionado */
    btn: string;
    /** color del punto en la pizarra */
    dot: string;
    /** color del texto de conteo */
    text: string;
    negative: boolean;
  }
> = {
  BALL_LOSS: { label: "Pérdida", short: "P", icon: TrendingDown, btn: "bg-rose-500/20 border-rose-500/60 text-rose-200", dot: "#f43f5e", text: "text-rose-300", negative: true },
  BALL_RECOVERY: { label: "Recuperación", short: "R", icon: Hand, btn: "bg-emerald-500/20 border-emerald-500/60 text-emerald-200", dot: "#34d399", text: "text-emerald-300", negative: false },
  POSITIVE_DUEL: { label: "Duelo ganado", short: "D+", icon: Swords, btn: "bg-emerald-500/20 border-emerald-500/60 text-emerald-200", dot: "#10b981", text: "text-emerald-300", negative: false },
  NEGATIVE_DUEL: { label: "Duelo perdido", short: "D−", icon: ShieldAlert, btn: "bg-rose-500/20 border-rose-500/60 text-rose-200", dot: "#fb7185", text: "text-rose-300", negative: true },
  ATTEMPTED_SHOT: { label: "Remate", short: "T", icon: Crosshair, btn: "bg-amber-500/20 border-amber-500/60 text-amber-200", dot: "#fbbf24", text: "text-amber-300", negative: false },
  GOAL_FOR: { label: "Gol a favor", short: "G+", icon: Goal, btn: "bg-emerald-500/20 border-emerald-500/60 text-emerald-200", dot: "#22c55e", text: "text-emerald-300", negative: false },
  GOAL_AGAINST: { label: "Gol en contra", short: "G−", icon: Goal, btn: "bg-rose-500/20 border-rose-500/60 text-rose-200", dot: "#e11d48", text: "text-rose-300", negative: true },
  OPPONENT_CHANCE: { label: "Ocasión rival", short: "O", icon: Zap, btn: "bg-amber-500/20 border-amber-500/60 text-amber-200", dot: "#f59e0b", text: "text-amber-300", negative: true },
  CUSTOM: { label: "Otro", short: "C", icon: Cloud, btn: "bg-zinc-700/40 border-zinc-500/60 text-zinc-200", dot: "#a1a1aa", text: "text-zinc-300", negative: false },
};

/** Paleta compacta para el marcado exprés (CUSTOM queda para fase 4) */
export const QUICK_EVENT_TYPES: string[] = [
  "BALL_LOSS",
  "BALL_RECOVERY",
  "NEGATIVE_DUEL",
  "POSITIVE_DUEL",
  "ATTEMPTED_SHOT",
  "GOAL_FOR",
  "GOAL_AGAINST",
  "OPPONENT_CHANCE",
];

// ---------- Varios ----------

export const PHASE_LABEL: Record<string, string> = {
  OFFENSIVE: "Ofensiva",
  DEFENSIVE: "Defensiva",
  OFF_TRANSITION: "Trans. ofensiva",
  DEF_TRANSITION: "Trans. defensiva",
  SET_PIECE: "ABP",
};

/** Icono para el pulso anímico (reutilizable en vistas de plantilla) */
export const MORALE_ICON = HeartPulse;
export const DEFENSE_ICON = Shield;

/** Normaliza nombres para matching en importación (insensible a acentos/caso) */
export function normalizeName(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ============================================================================
// PILAR 1 — BIBLIOTECA DE SABIDURÍA (CÁTEDRA)
// ============================================================================

/** Orden canónico de las 5 fases del juego en toda la biblioteca */
export const PHASE_ORDER: string[] = [
  "OFFENSIVE",
  "DEFENSIVE",
  "OFF_TRANSITION",
  "DEF_TRANSITION",
  "SET_PIECE",
];

export const PHASE_META: Record<
  string,
  { label: string; icon: LucideIcon; chip: string; solid: string; desc: string }
> = {
  OFFENSIVE: {
    label: "Organización Ofensiva",
    icon: Swords,
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    solid: "text-emerald-300",
    desc: "Ataque posicional: creación y ocupación de espacios con el balón.",
  },
  DEFENSIVE: {
    label: "Organización Defensiva",
    icon: Shield,
    chip: "bg-sky-500/15 text-sky-300 border-sky-500/40",
    solid: "text-sky-300",
    desc: "Bloque coordinado: compactación, coberturas y presión.",
  },
  OFF_TRANSITION: {
    label: "Transición Ofensiva",
    icon: Zap,
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    solid: "text-amber-300",
    desc: "Pérdida → reacción inmediata: verticalidad en los 5 segundos.",
  },
  DEF_TRANSITION: {
    label: "Transición Defensiva",
    icon: FastForward,
    chip: "bg-violet-500/15 text-violet-300 border-violet-500/40",
    solid: "text-violet-300",
    desc: "Recuperación → progresión: counter-pressing y repliegue organizado.",
  },
  SET_PIECE: {
    label: "Balón Parado (ABP)",
    icon: Flag,
    chip: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40",
    solid: "text-zinc-300",
    desc: "Córners, tiros libres y saques: rutinas de ataque y defensa.",
  },
};

/** Relevancia de la "receta" (TaskSubPrinciple): ponderación 1-3 del motor */
export const RELEVANCE_META: Record<
  number,
  { label: string; hint: string; chip: string; btn: string }
> = {
  3: {
    label: "Núcleo",
    hint: "La corrige de forma directa — primera opción del motor",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    btn: "bg-emerald-500/20 border-emerald-500/60 text-emerald-200",
  },
  2: {
    label: "Refuerza",
    hint: "Trabaja el objetivo de forma secundaria",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    btn: "bg-amber-500/20 border-amber-500/60 text-amber-200",
  },
  1: {
    label: "Apoyo",
    hint: "Conexión periférica / calentamiento",
    chip: "bg-zinc-500/15 text-zinc-300 border-zinc-600",
    btn: "bg-zinc-700/40 border-zinc-500/60 text-zinc-200",
  },
};

export const INTENSITY_META: Record<
  string,
  { label: string; chip: string; dot: string }
> = {
  LOW: {
    label: "Suave",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    dot: "bg-emerald-400",
  },
  MEDIUM: {
    label: "Media",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    dot: "bg-amber-400",
  },
  HIGH: {
    label: "Alta",
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    dot: "bg-rose-400",
  },
};

/** Origen del contenido de la biblioteca: Cátedra global vs. club */
export const ORIGIN_META: Record<
  "cathedral" | "club",
  { label: string; hint: string; chip: string; icon: LucideIcon }
> = {
  cathedral: {
    label: "Cátedra",
    hint: "Contenido oficial de la plataforma — solo lectura · duplica para personalizar",
    chip: "bg-violet-500/15 text-violet-300 border-violet-500/40",
    icon: Landmark,
  },
  club: {
    label: "Mi club",
    hint: "Contenido propio del club — editable por el cuerpo técnico",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    icon: Users,
  },
};
