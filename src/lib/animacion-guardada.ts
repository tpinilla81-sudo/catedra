// ============================================================================
// PIZARRA ANIMADA GUARDADA — validación y parsing del JSON persistido
// ----------------------------------------------------------------------------
// El campo Task.animationData (Json?) almacena un objeto `Animacion`
// (src/lib/animaciones-ejercicio.ts) diseñado con el TacticalAnimationBuilder:
// fotogramas con coordenadas de fichas y balón. Nada de vídeo: el JSON de una
// pizarra completa queda por debajo de ~30 KB.
//
// Este módulo es la ÚNICA puerta de entrada del JSON a la base de datos y a la
// UI: lo usan el Server Action (saveTask), las rutas API de Pilar 2
// (/api/pilar2/tasks) y el Server Component de la biblioteca al serializar
// TaskCard. Reglas:
//   · Máx. 40 fotogramas × 22 fichas × etiquetas de 160 chars → presupuesto
//     de tamaño acotado de antemano (defensa en profundidad junto al guard de
//     bytes del API).
//   · Coordenadas acotadas al campo 105×68 y redondeadas a 1 decimal.
//   · Cualquier desviación → null: la tarea cae a la plantilla determinista
//     (seleccionarAnimacion) y la app NUNCA se rompe por un JSON corrupto.
// ============================================================================

import type { Animacion, BalonAnim, Eq, FichaAnim, Fotograma } from "./animaciones-ejercicio";

export const ANIM_LIMITES = {
  fotogramas: 40,
  fichas: 22,
  etiqueta: 160,
  msMin: 300,
  msMax: 6000,
  bytesMax: 120_000, // ~120 KB: margen enorme para una pizarra real
} as const;

const TRAZOS = ["pase", "tiro", "conduccion"] as const;
const EQUIPOS: Eq[] = ["propia", "rival"];

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function coord(v: unknown, max: number): number | null {
  const n = num(v);
  if (n === null) return null;
  // Redondeo a 1 decimal: el JSON pesa menos y sobra precisión en un campo de 105 m
  return Math.round(Math.min(max, Math.max(0, n)) * 10) / 10;
}

function limpiarStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s.length > 0 ? s : null;
}

/** Ficha válida o null (el fotograma se descarta entero: no admitimos fichas a medias) */
function parseFicha(raw: unknown): FichaAnim | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const id = limpiarStr(o.id, 32);
  const x = coord(o.x, 105);
  const y = coord(o.y, 68);
  if (!id || x === null || y === null) return null;
  if (!EQUIPOS.includes(o.eq as Eq)) return null;

  let numDorsal: number | undefined;
  if (o.num !== undefined && o.num !== null) {
    const n = num(o.num);
    if (n === null || !Number.isInteger(n) || n < 0 || n > 99) return null;
    numDorsal = n;
  }

  const ficha: FichaAnim = { id, eq: o.eq as Eq, x, y };
  if (numDorsal !== undefined) ficha.num = numDorsal;
  return ficha;
}

function parseBalon(raw: unknown, idsValidos: Set<string>): BalonAnim | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const x = coord(o.x, 105);
  const y = coord(o.y, 68);
  if (x === null || y === null) return null;

  const balon: BalonAnim = { x, y };

  // `con`: el balón porta una ficha de ESTE fotograma (si no existe, se ignora)
  if (o.con !== undefined && o.con !== null) {
    const con = limpiarStr(o.con, 32);
    if (con && idsValidos.has(con)) balon.con = con;
  }
  if (o.trazo !== undefined && o.trazo !== null) {
    if (typeof o.trazo === "string" && (TRAZOS as readonly string[]).includes(o.trazo)) {
      balon.trazo = o.trazo as BalonAnim["trazo"];
    }
  }
  return balon;
}

function parseFotograma(raw: unknown): Fotograma | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.fichas) || o.fichas.length === 0) return null;
  if (o.fichas.length > ANIM_LIMITES.fichas) return null;

  const fichas: FichaAnim[] = [];
  for (const f of o.fichas) {
    const ficha = parseFicha(f);
    if (!ficha) return null;
    if (fichas.some((x) => x.id === ficha.id)) return null; // ids únicos por fotograma
    fichas.push(ficha);
  }

  const balon = parseBalon(o.balon, new Set(fichas.map((f) => f.id)));
  if (!balon) return null;

  const frame: Fotograma = { fichas, balon };

  const etiqueta = o.etiqueta === undefined || o.etiqueta === null ? null : limpiarStr(o.etiqueta, ANIM_LIMITES.etiqueta);
  if (etiqueta) frame.etiqueta = etiqueta;

  if (o.ms !== undefined && o.ms !== null) {
    const ms = num(o.ms);
    if (ms === null) return null;
    frame.ms = Math.round(Math.min(ANIM_LIMITES.msMax, Math.max(ANIM_LIMITES.msMin, ms)));
  }

  return frame;
}

/**
 * Valida y normaliza el JSON guardado. Devuelve la Animacion lista para
 * renderizar, o null si no es recuperable (→ la UI usa la plantilla
 * determinista y el guardado rechaza el payload con mensaje claro).
 */
export function parseAnimacionGuardada(raw: unknown): Animacion | null {
  if (typeof raw === "string") {
    if (raw.length > ANIM_LIMITES.bytesMax) return null;
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  if (!Array.isArray(o.fotogramas) || o.fotogramas.length === 0) return null;
  if (o.fotogramas.length > ANIM_LIMITES.fotogramas) return null;

  const fotogramas: Fotograma[] = [];
  for (const fr of o.fotogramas) {
    const frame = parseFotograma(fr);
    if (!frame) return null;
    fotogramas.push(frame);
  }

  return {
    clave: limpiarStr(o.clave, 40) ?? "personalizada",
    titulo: limpiarStr(o.titulo, 120) ?? "Pizarra de la tarea",
    descripcion: limpiarStr(o.descripcion, 300) ?? "Animación diseñada por el entrenador",
    fotogramas,
  };
}
