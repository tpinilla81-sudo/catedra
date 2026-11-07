// ============================================================================
// UTILIDADES DE FECHAS — referencia horaria única: Europe/Madrid
// ----------------------------------------------------------------------------
// El servidor (sandbox local y Vercel) corre en UTC, pero los usuarios están
// en España. Sin una referencia explícita, `startOfWeek` de date-fns usa la
// TZ del proceso: un lunes 00:30 hora Madrid (domingo 23:30 UTC en invierno,
// 22:30 UTC en verano) se computa como DOMINGO UTC y la semana salta a la
// anterior — el "salto de día por UTC" que descasaba microciclos, pulsos y
// ventanas de ingesta.
//
// Convención canónica (única fuente de verdad):
//   • El DÍA que delimita la semana lo decide el CALENDARIO DE MADRID.
//   • El instante devuelto es la medianoche UTC del lunes-Madrid elegido.
//     Razón: Microcycle.weekStart es único por (teamId, weekStart) y todos
//     los registros existentes se crearon como medianoche UTC — mantener el
//     instante estable garantiza compatibilidad total con los datos ya en la
//     base (sin migración) mientras la ELECCIÓN de día pasa a ser Madrid.
//   • TeamPulse.date es una columna @db.Date (medianoche UTC del día): con
//     weekStart en medianoche UTC, las ventanas gte/lte alinean exactamente
//     con los días calendario.
//
// Consumidores: diagnose.ts (mondayOf re-export), pipeline, today/actions,
// match-ingest, hoy-view, seed y todas las suites E2E.
// ============================================================================
import { addDays, subDays } from "date-fns";

/** Zona horaria oficial de la app (el míster y el vestuario están en España). */
export const APP_TIMEZONE = "Europe/Madrid" as const;

const MS_PER_DAY = 86_400_000;

// `en-CA` formatea como YYYY-MM-DD (ISO) — estable y sin ambigüedad de locale.
const MADRID_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Componentes de calendario (año, mes, día) que ve un reloj de Madrid. */
function madridDateParts(instant: Date): { year: number; month: number; day: number } {
  const [year, month, day] = MADRID_DATE_FMT.format(instant).split("-").map(Number);
  return { year, month, day };
}

/**
 * Semana ISO (lunes) de un instante, decidida por el calendario de Madrid.
 * Devuelve la medianoche UTC del lunes-Madrid que contiene `instant`.
 *
 * Ejemplos (invierno, UTC+1):
 *   mondayOf(lun 09-nov 00:30 Madrid = dom 08-nov 23:30 UTC) → lun 09-nov 00:00 UTC
 *     (el código UTC puro habría devuelto el lunes 02-nov: salto de semana)
 *   mondayOf(dom 08-nov 23:30 Madrid = dom 08-nov 22:30 UTC) → lun 02-nov 00:00 UTC
 *     (el domingo tarde Madrid pertenece a la semana que termina, no a la siguiente)
 */
export function mondayOf(instant: Date): Date {
  const { year, month, day } = madridDateParts(instant);
  // Día de la semana del calendario: el weekday de una fecha es independiente
  // de la TZ, así que se calcula sobre la medianoche UTC de esa fecha.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=dom … 6=sáb
  const daysSinceMonday = (weekday + 6) % 7; // lunes=0 … domingo=6
  // Date.UTC normaliza días ≤ 0 (cruce de mes/año) sin error.
  return new Date(Date.UTC(year, month - 1, day - daysSinceMonday));
}

/** Número de días de calendario Madrid entre dos instantes (a − b). */
export function madridDaysBetween(a: Date, b: Date): number {
  const pa = madridDateParts(a);
  const pb = madridDateParts(b);
  const utcA = Date.UTC(pa.year, pa.month - 1, pa.day);
  const utcB = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((utcA - utcB) / MS_PER_DAY);
}

/**
 * Ventana temporal válida del Pulso para la semana que empieza en `weekStart`
 * (medianoche UTC del lunes-Madrid):
 *   • gte = weekStart − 8 días  → incluye el pulso capturado el DOMINGO
 *     anterior (día de partido típico) y toda la semana previa.
 *   • lte = weekStart + 2 días  → admite pulsos capturados lunes/martes/
 *     miércoles de la semana analizada (re-prescripción en vivo).
 * Fuera de esta ventana el pulso está CADUCADO: el motor no lo usa y aplica
 * sus valores por defecto seguros (fatiga neutra 5/10, sin hallazgo anímico).
 */
export function pulseWindowFor(weekStart: Date): { gte: Date; lte: Date } {
  return { gte: subDays(weekStart, 8), lte: addDays(weekStart, 2) };
}
