// ============================================================================
// TAXONOMÍA DE LA FICHA DE RENDIMIENTO COMPLETA — mock del míster
// ('PlayerProfileEvaluationView' · MÉTODO // SUITE TÁCTICA)
// ----------------------------------------------------------------------------
// Evaluación 1:1 del jugador con 6 BLOQUES × 8 MÉTRICAS y nota 1-10:
//   1. Capacidades Físicas · 2. Técnica Individual · 3. Inteligencia Táctica
//   4. Aspectos Psicológicos · 5. Principios Tácticos (todo configurable)
//   6. Actitud Jugador
// Las métricas `custom: true` («Libre N») tienen label editable por el
// míster — el contenido completo vive en PlayerEvaluation.data (JSON),
// así que renombrar métricas NO necesita migración.
// Estilo de la casa: NADA del slate-950 del mock; el código de color de
// cada bloque se mantiene con acentos suaves sobre crema/verde.
// ============================================================================

export type EvalMetric = {
  /** Etiqueta visible («Libre N» por defecto en las configurables) */
  label: string;
  /** Nota 1-10 */
  score: number;
  /** true → label editable por el míster */
  custom: boolean;
};

export type EvalBlock = {
  /** id estable del bloque (persistido en el JSON) */
  key: string;
  title: string;
  /** color hex del acento del bloque (versión crema/verde del mock) */
  accent: string;
  metrics: EvalMetric[];
};

export type PlayerEvaluationData = EvalBlock[];

export const EVAL_SCORE_MIN = 1;
export const EVAL_SCORE_MAX = 10;
export const EVAL_METRICS_PER_BLOCK = 8;

function free(n: number): EvalMetric {
  return { label: `Libre ${n}`, score: 5, custom: true };
}

/** Estructura EXACTA del mock (labels literales) — defaults de una ficha nueva */
export const EVAL_BLOCK_DEFAULTS: EvalBlock[] = [
  {
    key: "fisicas",
    title: "Capacidades Físicas",
    accent: "#b45309",
    metrics: [
      { label: "Coordinación", score: 5, custom: false },
      { label: "Físico Aplicado al Juego", score: 5, custom: false },
      { label: "Velocidad", score: 5, custom: false },
      { label: "Equilibrio", score: 5, custom: false },
      { label: "Fuerza", score: 5, custom: false },
      { label: "Flexibilidad", score: 5, custom: false },
      free(1),
      free(2),
    ],
  },
  {
    key: "tecnica",
    title: "Técnica Individual",
    accent: "#1f7a3d",
    metrics: [
      { label: "Técnica Individual", score: 5, custom: false },
      { label: "Percepción Entorno", score: 5, custom: false },
      { label: "Control", score: 5, custom: false },
      { label: "Golpeo", score: 5, custom: false },
      { label: "Pase", score: 5, custom: false },
      { label: "Perfilado", score: 5, custom: false },
      free(1),
      free(2),
    ],
  },
  {
    key: "inteligencia",
    title: "Inteligencia Táctica",
    accent: "#b4232a",
    metrics: [
      { label: "Toma de Decisiones", score: 5, custom: false },
      { label: "Adaptación Contexto", score: 5, custom: false },
      { label: "Anticipación Acciones", score: 5, custom: false },
      { label: "Comportamiento Sin Balón", score: 5, custom: false },
      { label: "Comprensión Juego", score: 5, custom: false },
      { label: "Ejecución", score: 5, custom: false },
      free(1),
      free(2),
    ],
  },
  {
    key: "psicologicos",
    title: "Aspectos Psicológicos",
    accent: "#0e7490",
    metrics: [
      { label: "Resolución Problemas", score: 5, custom: false },
      { label: "Transferencia Aprendizaje", score: 5, custom: false },
      { label: "Relaciones con Equipo", score: 5, custom: false },
      { label: "Adaptación", score: 5, custom: false },
      { label: "Carácter y Personalidad", score: 5, custom: false },
      { label: "Competitividad", score: 5, custom: false },
      free(1),
      free(2),
    ],
  },
  {
    key: "principios",
    title: "Principios Tácticos",
    accent: "#c2410c",
    metrics: [free(1), free(2), free(3), free(4), free(5), free(6), free(7), free(8)],
  },
  {
    key: "actitud",
    title: "Actitud Jugador",
    accent: "#6d28d9",
    metrics: [
      { label: "Motivación", score: 5, custom: false },
      { label: "Autocontrol", score: 5, custom: false },
      { label: "Confianza", score: 5, custom: false },
      { label: "Creatividad", score: 5, custom: false },
      { label: "Atención", score: 5, custom: false },
      { label: "Actitud", score: 5, custom: false },
      free(1),
      free(2),
    ],
  },
];

/** Ficha nueva en blanco (nota 5 = punto medio en todas) */
export function defaultEvaluationData(): PlayerEvaluationData {
  return EVAL_BLOCK_DEFAULTS.map((b) => ({
    ...b,
    metrics: b.metrics.map((m) => ({ ...m })),
  }));
}

const clamped = (n: unknown): number | null => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return null;
  return Math.min(EVAL_SCORE_MAX, Math.max(EVAL_SCORE_MIN, v));
};

/**
 * Normaliza y valida el JSON que llega del cliente (o de la BD antigua).
 * Devuelve SIEMPRE 6 bloques × 8 métricas: si el raw trae menos bloques
 * (ficha antigua/parcial), se completa con los defaults — la UI nunca
 * rompe por datos a medias. null → estructura irrecuperable.
 */
export function normalizeEvaluationData(raw: unknown): PlayerEvaluationData | null {
  if (!Array.isArray(raw)) return null;
  const defaults = defaultEvaluationData();
  const out: PlayerEvaluationData = [];

  for (let i = 0; i < defaults.length; i++) {
    const def = defaults[i];
    const rawBlock = raw.find(
      (b): b is Record<string, unknown> =>
        !!b && typeof b === "object" && (b as Record<string, unknown>).key === def.key,
    );
    const rawMetrics = Array.isArray(rawBlock?.metrics) ? rawBlock!.metrics : [];

    const metrics: EvalMetric[] = [];
    for (let j = 0; j < EVAL_METRICS_PER_BLOCK; j++) {
      const m = rawMetrics[j] as Record<string, unknown> | undefined;
      const labelRaw = typeof m?.label === "string" ? m.label.trim().slice(0, 60) : "";
      const score = clamped(m?.score) ?? def.metrics[j].score;
      const custom = def.metrics[j].custom || typeof m?.custom === "boolean" ? !!m?.custom || false : false;
      // Regla del mock: las fijas no se vuelven configurables; las
      // configurables conservan su flag aunque cambien de nombre.
      metrics.push({
        label: labelRaw || (m ? def.metrics[j].label : def.metrics[j].label),
        score,
        custom: def.metrics[j].custom ? true : !!custom,
      });
    }

    out.push({
      key: def.key,
      title: def.title,
      accent: def.accent,
      metrics,
    });
  }

  return out.length === defaults.length ? out : null;
}

/** Media de un bloque (el chip «Avg» de la cabecera del mock) */
export function blockAverage(block: EvalBlock): string {
  const sum = block.metrics.reduce((acc, m) => acc + m.score, 0);
  return (sum / block.metrics.length).toFixed(1);
}

/** Media global de la ficha (para el informe exportado) */
export function overallAverage(data: PlayerEvaluationData): string {
  const all = data.flatMap((b) => b.metrics.map((m) => m.score));
  return (all.reduce((a, b) => a + b, 0) / Math.max(1, all.length)).toFixed(1);
}

/** Color de la nota (semáforo del mock: ≥8 verde · ≥6 ámbar · resto neutro) */
export function scoreClass(score: number): string {
  if (score >= 8) return "text-brand-600";
  if (score >= 6) return "text-[#8a6206]";
  return "text-[#5d7263]";
}
