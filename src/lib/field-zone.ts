// ============================================================================
// PILAR 2 · ZONA DEL CAMPO DE LAS TAREAS
// ----------------------------------------------------------------------------
// El míster pidió que toda tarea declare, además de sus medidas, EN QUÉ ZONA
// del campo se hace — y que el vídeo de la tarea sea real, grabado en esos
// metros. Taxonomía única compartida por editor, API y tarjetas.
// ============================================================================

export const FIELD_ZONES = [
  { value: "TODO_EL_CAMPO", label: "Todo el campo", hint: "Ocupa todo el ancho y largo" },
  { value: "MEDIO_CAMPO", label: "Medio campo", hint: "Zona central" },
  { value: "CAMPO_PROPIO", label: "Campo propio", hint: "Mitad defensiva" },
  { value: "CAMPO_RIVAL", label: "Campo rival", hint: "Mitad ofensiva" },
  { value: "TRES_CUARTOS", label: "Tres cuartos", hint: "Zona de creación" },
  { value: "AREA_PROPIA", label: "Área propia", hint: "Zona de acabado rival" },
  { value: "AREA_RIVAL", label: "Área rival", hint: "Zona de acabado propio" },
  { value: "BANDA_IZQUIERDA", label: "Banda izquierda", hint: "Carril izquierdo" },
  { value: "BANDA_DERECHA", label: "Banda derecha", hint: "Carril derecho" },
  { value: "CARRIL_CENTRAL", label: "Carril central", hint: "Por dentro" },
] as const;

export type FieldZoneValue = (typeof FIELD_ZONES)[number]["value"];

export const FIELD_ZONE_VALUES: string[] = FIELD_ZONES.map((z) => z.value);

export const FIELD_ZONE_DEFAULT: FieldZoneValue = "TODO_EL_CAMPO";

/** Etiqueta legible de una zona guardada (soporta valores históricos raros). */
export function fieldZoneLabel(value: string | null | undefined): string {
  if (!value) return "Sin zona";
  return FIELD_ZONES.find((z) => z.value === value)?.label ?? value;
}
