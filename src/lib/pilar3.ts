// ============================================================================
// PILAR 3 · TELEMETRÍA EN DIRECTO — vocabulario compartido cliente/servidor
// ----------------------------------------------------------------------------
// Fuente única para: tipos de evento y valores canónicos, presets de ACCIÓN,
// validación de payloads (el servidor nunca confía en el cliente) y la
// matemática del reloj autoritativo de la sesión. Lo importan las 3 rutas de
// /api/pilar3 y el tablón en vivo — cero duplicación, cero fricción.
// ============================================================================

// ---------- Tipos de evento y valores canónicos ----------

export type TelemetryTypeValue = "FATIGUE" | "CLINICAL" | "TACTICAL" | "ACTION";
export const TELEMETRY_TYPES: TelemetryTypeValue[] = [
  "FATIGUE",
  "CLINICAL",
  "TACTICAL",
  "ACTION",
];

export function isTelemetryType(v: unknown): v is TelemetryTypeValue {
  return typeof v === "string" && (TELEMETRY_TYPES as string[]).includes(v);
}

/// Valores canónicos por tipo: los ejes de ESTADO actualizan además la ficha
/// del tablón (LiveMatchEvaluation); ACTION son hechos que se acumulan.
export const VALUES_BY_TYPE: Record<
  Exclude<TelemetryTypeValue, "ACTION">,
  readonly string[]
> = {
  FATIGUE: ["FRESH", "HEAVY", "EXHAUSTED"],
  CLINICAL: ["MINOR", "FORCED_SUB"],
  TACTICAL: ["EXPLOITING", "STRUGGLING"],
} as const;

/// Eje de la ficha rápida que actualiza cada tipo de estado (server-side)
export const FLAG_AXIS_BY_TYPE = {
  FATIGUE: "fatigueFlag",
  CLINICAL: "clinicalFlag",
  TACTICAL: "tacticalFlag",
} as const;

export type FlagAxisKey =
  (typeof FLAG_AXIS_BY_TYPE)[keyof typeof FLAG_AXIS_BY_TYPE];

// ---------- Presets de ACCIÓN (hechos de juego a un toque) ----------

export type ActionPreset = {
  value: string;
  label: string;
  emoji: string;
  tone: "positive" | "negative" | "neutral";
};

export const ACTION_PRESETS: ActionPreset[] = [
  { value: "GOAL_FOR", label: "Gol a favor", emoji: "⚽", tone: "positive" },
  { value: "GOAL_AGAINST", label: "Gol en contra", emoji: "😱", tone: "negative" },
  { value: "SHOT", label: "Remate propio", emoji: "🎯", tone: "positive" },
  { value: "OPP_CHANCE", label: "Ocasión rival", emoji: "🚨", tone: "negative" },
  { value: "BALL_LOSS", label: "Pérdida", emoji: "❌", tone: "negative" },
  { value: "BALL_RECOVERY", label: "Recuperación", emoji: "🔁", tone: "positive" },
  { value: "CORNER_FOR", label: "Córneck a favor", emoji: "🚩", tone: "positive" },
  { value: "SET_PIECE_GOAL", label: "Gol de ABP", emoji: "📋", tone: "positive" },
];

export const ACTION_VALUES = new Set(ACTION_PRESETS.map((a) => a.value));

// ---------- Sesión y reloj autoritativo ----------

export type SessionStatusValue = "LIVE" | "PAUSED" | "FINISHED";

export type MatchSessionDTO = {
  id: string;
  matchId: string;
  status: SessionStatusValue;
  clockBaseSeconds: number;
  clockStartedAt: string | null; /// ISO — null = reloj parado
  videoUrl: string | null;
  videoOffsetSeconds: number;
  /// Segundos transcurridos calculados EN SERVIDOR al construir el DTO
  elapsedSeconds: number;
};

/** Matemática del reloj: base acumulada + tramo en curso si está LIVE */
export function sessionElapsedSeconds(s: {
  status: string;
  clockBaseSeconds: number;
  clockStartedAt: Date | string | null;
}): number {
  if (s.status !== "LIVE" || !s.clockStartedAt) return s.clockBaseSeconds;
  const started =
    typeof s.clockStartedAt === "string"
      ? new Date(s.clockStartedAt).getTime()
      : s.clockStartedAt.getTime();
  return s.clockBaseSeconds + Math.max(0, (Date.now() - started) / 1000);
}

/** Minuto cerrado de partido para stamping de eventos */
export function minuteOfElapsed(elapsedSeconds: number): number {
  return Math.max(0, Math.floor(elapsedSeconds / 60));
}

/** Reloj en formato partido 00:00 (mm:ss, horas si hiciera falta) */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/// Acciones de control del cronómetro (vía POST /api/pilar3/events)
export type SessionClockAction =
  | "START"
  | "PAUSE"
  | "RESUME"
  | "FINISH"
  | "SET_VIDEO";

export const CLOCK_ACTIONS: readonly SessionClockAction[] = [
  "START",
  "PAUSE",
  "RESUME",
  "FINISH",
  "SET_VIDEO",
];

// ---------- Payloads y límites de la API ----------

export const MAX_BATCH_EVENTS = 50;
export const MAX_VALUE_LENGTH = 140;
export const MAX_URL_LENGTH = 600;

export type TelemetryEventInput = {
  playerId?: string | null;
  type: TelemetryTypeValue;
  value: string;
  minute?: number | null;
  coordinatesX?: number | null;
  coordinatesY?: number | null;
};

export type TelemetryEventDTO = {
  id: string;
  playerId: string | null;
  minute: number;
  timestamp: string; /// ISO
  type: TelemetryTypeValue;
  value: string;
  coordinatesX: number | null;
  coordinatesY: number | null;
};

export type VideoBookmarkDTO = {
  id: string;
  telemetryEventId: string;
  videoTimestampSeconds: number;
  videoUrl: string | null;
  notes: string | null;
};

export type EvaluationStateDTO = {
  playerId: string;
  isStarter: boolean;
  fatigueFlag: string | null;
  clinicalFlag: string | null;
  tacticalFlag: string | null;
  statusUpdatedAt: string | null;
};

/**
 * Valida y sanea un evento del payload. Devuelve null si el evento es
 * inválido (el caller decide: 400 global o descarte fila a fila). El minute
 * se rellena en el servidor con el reloj de la sesión si no viene.
 */
export function sanitizeEventInput(
  raw: unknown,
): TelemetryEventInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isTelemetryType(r.type)) return null;

  const value = typeof r.value === "string" ? r.value.trim() : "";
  if (!value || value.length > MAX_VALUE_LENGTH) return null;
  // Los ejes de estado solo aceptan valores canónicos; ACTION acepta preset
  // o texto libre (nota exprés del analista).
  if (r.type !== "ACTION" && !(VALUES_BY_TYPE[r.type] as readonly string[]).includes(value)) {
    return null;
  }

  const numOrNull = (v: unknown, min: number, max: number): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) return null;
    return n;
  };

  const minute = numOrNull(r.minute, 0, 300);
  const coordinatesX = numOrNull(r.coordinatesX, 0, 100);
  const coordinatesY = numOrNull(r.coordinatesY, 0, 100);
  if (r.minute != null && r.minute !== "" && minute === null) return null;
  if (
    (r.coordinatesX != null && r.coordinatesX !== "" && coordinatesX === null) ||
    (r.coordinatesY != null && r.coordinatesY !== "" && coordinatesY === null)
  ) {
    return null;
  }

  const playerId =
    typeof r.playerId === "string" && r.playerId.trim() ? r.playerId.trim() : null;

  return {
    playerId,
    type: r.type,
    value,
    minute,
    coordinatesX,
    coordinatesY,
  };
}

/** Segundo de vídeo estimado para un evento, con el offset de la sesión */
export function videoSecondsForEvent(
  minute: number,
  videoOffsetSeconds: number,
): number {
  return Math.max(0, minute * 60 + videoOffsetSeconds);
}
