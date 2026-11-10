// ============================================================================
// PILAR 3 · PARSER DE EVENTOS POR VOZ (español de vestuario)
// ----------------------------------------------------------------------------
// Convierte lo que grita el míster al móvil en un vector causa→efecto de la
// pizarra espacial. Funciona con texto normalizado (minúsculas, sin acentos
// ni puntuación) porque el reconocedor de voz varía entre navegadores.
//
//   "recuperamos en medio campo y sacan por banda derecha"
//     → RECOVERED_BALL · origen (50,50) → fin (50,82)
//
// Filosofía anti-basura: SOLO se auto-registra lo inequívoco (salida + zona).
// Si falta la zona, la UI ofrece chips para completar con un toque.
// ============================================================================

export type VoicePt = { x: number; y: number };

export type VoiceOutcome = "SHOT_AGAINST" | "COUNTER_ATTACK" | "RECOVERED_BALL";

export type VoiceParse =
  | {
      status: "ok";
      outcome: VoiceOutcome;
      origin: VoicePt;
      end: VoicePt;
      outcomeWord: string;
      zones: string[];
    }
  | {
      /// Se entendió la salida pero falta la zona → chips de confirmación
      status: "partial";
      outcome: VoiceOutcome;
      outcomeWord: string;
      zones: string[];
    }
  | { status: "none"; reason: string };

/// Desplazamiento por defecto del vector cuando solo se conoce el origen:
/// hacia dónde "empuja" la consecuencia en el campo (portería rival = x 100).
const PUSH_BY_OUTCOME: Record<VoiceOutcome, number> = {
  RECOVERED_BALL: 12, // sacamos el balón hacia adelante
  COUNTER_ATTACK: 18, // la transición corre hacia la portería rival
  SHOT_AGAINST: -10, // el peligro va hacia NUESTRA portería
};

type ZoneDef = {
  label: string;
  re: RegExp;
  x?: number;
  y?: number;
};

// Oriencia del campo en la pizarra: portería PROPIA a la IZQUIERDA,
// portería RIVAL a la DERECHA (igual que las marcas del terreno del SVG).
const ZONES: ZoneDef[] = [
  // ---- carriles verticales (bandas) — solo definen Y ----
  { label: "banda izquierda", re: /\b(banda\s+izq\w*|carril\s+izquierdo|por\s+izquierda|a\s+la\s+izquierda|la\s+izquierda)\b/, y: 18 },
  { label: "banda derecha", re: /\b(banda\s+der\w*|carril\s+derecho|por\s+derecha|a\s+la\s+derecha|la\s+derecha)\b/, y: 82 },
  { label: "por dentro", re: /\b(por\s+dentro|por\s+el\s+medio|eje\s+central)\b/, y: 50 },
  // ---- tercios horizontales — solo definen X ----
  { label: "área propia", re: /\b(area\s+propia|nuestra\s+area|area\s+nuestra|porteria\s+propia|nuestra\s+porteria)\b/, x: 8 },
  { label: "campo propio", re: /\b(campo\s+propio|nuestro\s+campo|campo\s+nuestro)\b/, x: 25 },
  { label: "medio campo", re: /\b(medio\s+campo|centro\s+del\s+campo|centrocampo)\b/, x: 50 },
  { label: "tres cuartos", re: /\btres\s+cuartos\b/, x: 68 },
  { label: "frontal", re: /\bfrontal\b/, x: 78 },
  { label: "campo rival", re: /\b(campo\s+rival|campo\s+contrario|campo\s+de\s+ellos)\b/, x: 75 },
  { label: "área rival", re: /\b(area\s+rival|area\s+contraria|su\s+area|porteria\s+rival|su\s+porteria)\b/, x: 92 },
];

type OutcomeDef = { outcome: VoiceOutcome; re: RegExp };

// `\b...\b` evita falsos positivos: "contra" NO pica en "contrario".
// "roba/robamos/robo" = recuperación nuestra; "nos roba(n)" = pérdida y se
// descarta en runtime (sin lookbehind para no romper Safari antiguo).
const OUTCOMES: OutcomeDef[] = [
  {
    outcome: "SHOT_AGAINST",
    re: /\b(dispar\w*|tir\w*|chut\w*|remat\w*|nos\s+chutan|nos\s+tiraron)\b/,
  },
  {
    outcome: "COUNTER_ATTACK",
    re: /\b(contra|contragolpe|contraataque|transicion|transiciones)\b/,
  },
  {
    outcome: "RECOVERED_BALL",
    re: /\b(recuper\w*|balon\s+recuperado|rob\w*)\b/,
  },
];

/// "Recuperamos en medio campo, ¡y BANDA DERECHA!" → minúsculas sin acentos
export function normalizeVoiceText(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos: córner → corner
    .replace(/[.,!?;:¡!¿?"'()\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Punto final por defecto: origen + empuje hacia la portería rival. */
function defaultEnd(origin: VoicePt, outcome: VoiceOutcome): VoicePt {
  return { x: clamp(origin.x + PUSH_BY_OUTCOME[outcome], 2, 98), y: origin.y };
}

/**
 * Parsea una frase del míster y devuelve el evento espacial entendido.
 * - ok      → salida + al menos una zona: se puede registrar directo.
 * - partial → salida clara sin zona: la UI pide zona (chips o segunda frase).
 * - none    → nada reconocible: se muestra la transcripción y ejemplos.
 */
export function parseVoiceEvent(rawText: string): VoiceParse {
  const text = normalizeVoiceText(rawText);
  if (!text) return { status: "none", reason: "No se oyó nada." };

  // ---- 1) salida (la mención más temprana manda) ----
  let best: { outcome: VoiceOutcome; word: string; at: number } | null = null;
  for (const def of OUTCOMES) {
    const m = def.re.exec(text);
    if (m && (best === null || m.index < best.at)) {
      // "nos roba(n) el balón" es PÉRDIDA nuestra, no recuperación: se ignora
      // (salvo que la frase también diga "recuperamos").
      if (
        def.outcome === "RECOVERED_BALL" &&
        /\bnos\s+roba/.test(text) &&
        !/\brecuper/.test(text)
      ) {
        continue;
      }
      best = { outcome: def.outcome, word: m[0], at: m.index };
    }
  }
  if (!best) {
    return {
      status: "none",
      reason: "No reconocí la salida. Di: recuperamos / disparo rival / contra.",
    };
  }

  // ---- 2) zonas en orden de aparición (sin duplicados) ----
  const hits: { zone: ZoneDef; at: number }[] = [];
  for (const zone of ZONES) {
    const m = zone.re.exec(text);
    if (m) hits.push({ zone, at: m.index });
  }
  hits.sort((a, b) => a.at - b.at);
  const zones: ZoneDef[] = [];
  for (const h of hits) {
    if (!zones.some((z) => z.label === h.zone.label)) zones.push(h.zone);
  }

  // ---- 3) coordenadas ----
  const pickPoint = (defs: ZoneDef[], fallback: VoicePt): VoicePt => {
    const p = { ...fallback };
    for (const d of defs) {
      if (d.x !== undefined) p.x = d.x;
      if (d.y !== undefined) p.y = d.y;
    }
    return p;
  };

  const zoneLabels = zones.map((z) => z.label);
  if (zones.length === 0) {
    return { status: "partial", outcome: best.outcome, outcomeWord: best.word, zones: [] };
  }

  const origin = pickPoint([zones[0]], { x: 50, y: 50 });
  const end =
    zones.length > 1 ? pickPoint(zones.slice(1), origin) : defaultEnd(origin, best.outcome);

  return {
    status: "ok",
    outcome: best.outcome,
    origin,
    end,
    outcomeWord: best.word,
    zones: zoneLabels,
  };
}

/** Completa un evento "partial" con la zona elegida en los chips. */
export function completePartial(
  outcome: VoiceOutcome,
  zone: ZoneDef,
): { origin: VoicePt; end: VoicePt } {
  const origin: VoicePt = { x: zone.x ?? 50, y: zone.y ?? 50 };
  return { origin, end: defaultEnd(origin, outcome) };
}

/** Zonas que se ofrecen como chips cuando falta la zona por voz. */
export const VOICE_ZONE_CHIPS: ZoneDef[] = ZONES;

/** Etiqueta corta legible de un outcome (para mensajes de voz). */
export const VOICE_OUTCOME_LABEL: Record<VoiceOutcome, string> = {
  SHOT_AGAINST: "🎯 Disparo rival",
  COUNTER_ATTACK: "⚡ Transición / contra",
  RECOVERED_BALL: "🛡️ Balón recuperado",
};
