// ============================================================================
// PILAR 3 — SUITE TÁCTICA MAESTRA · catálogos oficiales
// (mock del míster 'MetodoTacticalSuiteMasterApp' · MÉTODO // TACTICAL SUITE
// MASTER V3: 4 pestañas — Directo & Vídeo · Biblioteca Taxonomía · Plantilla
// & Capacidades · Módulo A.B.P.)
// ----------------------------------------------------------------------------
// Labels EXACTOS del mock (los artefactos de citación [span_N] del pegado se
// limpian: eran ruido de copiar/pegar, no contenido). Paleta de la casa
// crema/verde; NUNCA el slate oscuro del mock.
// ============================================================================

/// Pestañas de la Suite Maestra (navegación superior del mock)
export type SuiteTab = "DIRECTO" | "BIBLIOTECA" | "PLANTILLA" | "ABP";

/// Secciones del análisis en directo (mock master: TRANSICION del mock
/// anterior se convierte en INTEGRADAS con el catálogo de tareas globales)
export type SuiteSectionId = "OFENSIVA" | "DEFENSIVA" | "ABP" | "INTEGRADAS";

export const SUITE_SECTIONS: {
  id: SuiteSectionId;
  label: string;
  hint: string;
  emoji: string;
  /** clases del botón de sección activo (acento del mock en versión casa) */
  active: string;
  /** color del chip de sección en el historial */
  chip: string;
}[] = [
  {
    id: "OFENSIVA",
    label: "Ofensiva",
    hint: "Construcción & Ataque",
    emoji: "⚽",
    active: "bg-brand-600 text-cream border-brand-600 shadow-lg",
    chip: "bg-brand-600/10 text-brand-700 border-brand-600/30",
  },
  {
    id: "DEFENSIVA",
    label: "Defensiva",
    hint: "Pressing & Bloque",
    emoji: "🛡️",
    active: "bg-[#c62f32] text-cream border-[#c62f32] shadow-lg",
    chip: "bg-[#c62f32]/10 text-[#8f1f22] border-[#c62f32]/30",
  },
  {
    id: "ABP",
    label: "A.B.P.",
    hint: "Balón Parado",
    emoji: "🚩",
    active: "bg-[#e3a93c] text-[#3a2a05] border-[#e3a93c] shadow-lg",
    chip: "bg-[#e3a93c]/15 text-[#7a5a10] border-[#e3a93c]/40",
  },
  {
    id: "INTEGRADAS",
    label: "Integradas",
    hint: "Globales / Situacionales",
    emoji: "🔥",
    active: "bg-[#c2410c] text-cream border-[#c2410c] shadow-lg",
    chip: "bg-[#c2410c]/10 text-[#8a2e08] border-[#c2410c]/30",
  },
];

/// Catálogo EXACTO del mock master, sección a sección (20 eventos)
export const SUITE_EVENT_CATALOGS: Record<SuiteSectionId, string[]> = {
  OFENSIVA: [
    "Salida de Balón Bajo Presión",
    "Pase Filtrado / Ruptura de Líneas",
    "Creación en 3/4 de Cancha",
    "Centro Lateral y Remate",
    "Ataque Posicional / Amplitud",
  ],
  DEFENSIVA: [
    "Pressing Alto / Robo en Campo Rival",
    "Bloque Medio / Basculación Correcta",
    "Defensa de Área / Despeje",
    "Duelo Aéreo Defensivo Ganado",
    "Interrupción / Falta Táctica Defensiva",
  ],
  ABP: [
    "Córner a Favor (Primer/Segundo Palo)",
    "Córner en Contra / Despeje",
    "Falta Lateral / Central Directa",
    "Saque de Banda en Largo",
  ],
  INTEGRADAS: [
    "Juego de Conservación (Mantener Posesión)",
    "Juegos de Posición",
    "Rondos de Circulación",
    "Juegos Reducidos (SSG)",
    "Partidos Condicionados",
    "Situaciones Reales de Juego",
  ],
};

/// Evento registrado en la Suite (libreta local del míster: localStorage)
export type SuiteEvent = {
  id: string;
  timestamp: string; /// mm:ss capturado del cronómetro de la Suite
  videoOffsetSec: number | null; /// segundo de vídeo del instante (clip −3/+2)
  section: SuiteSectionId;
  eventLabel: string;
};

/// Clave de persistencia local (sobrevive recargas; no toca la BD)
export const SUITE_EVENTS_STORAGE_KEY = "catedra.suite.master.events.v1";
export const SUITE_EVENTS_MAX = 200;

///Lee la libreta de eventos de la Suite (solo cliente; tolera JSON roto)
export function loadSuiteEvents(): SuiteEvent[] {
  try {
    const raw = window.localStorage.getItem(SUITE_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is SuiteEvent =>
          e &&
          typeof e.id === "string" &&
          typeof e.timestamp === "string" &&
          typeof e.eventLabel === "string" &&
          SUITE_SECTIONS.some((s) => s.id === e.section),
      )
      .slice(0, SUITE_EVENTS_MAX);
  } catch {
    return [];
  }
}

export function persistSuiteEvents(events: SuiteEvent[]): void {
  try {
    window.localStorage.setItem(
      SUITE_EVENTS_STORAGE_KEY,
      JSON.stringify(events.slice(0, SUITE_EVENTS_MAX)),
    );
  } catch {
    // cuota llena / modo privado: la libreta sigue en memoria
  }
}

/// mm:ss del cronómetro (formato del mock: padStart 2)
export function formatSuiteClock(totalSecs: number): string {
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// ============================================================================
// PESTAÑA BIBLIOTECA — taxonomía de tareas del mock master (acordeones)
// Los títulos y descriptores son EXACTOS del mock (1, 2, 3, 5 — el mock salta
// el 4: las Psicológicas viven en la Biblioteca Maestra, enlace abajo)
// ============================================================================

export type SuiteTaxonomyCategory = {
  id: string;
  title: string;
  emoji: string;
  /** descriptor -> detalle (celdas del acordeón del mock) */
  cells: { head: string; detail: string }[];
};

export const SUITE_TAXONOMY: SuiteTaxonomyCategory[] = [
  {
    id: "fisicas",
    title: "1. Tareas Físicas (Fuerza, Resistencia, Velocidad, Flexibilidad, Coordinación)",
    emoji: "⚡",
    cells: [
      { head: "Fuerza", detail: "General, máxima, explosiva, resistencia a la fuerza" },
      { head: "Resistencia", detail: "Aeróbica, anaeróbica, intermitente" },
      { head: "Velocidad", detail: "Reacción, aceleración, desplazamiento, gestual" },
      { head: "Flexibilidad", detail: "Estática, dinámica, movilidad articular" },
    ],
  },
  {
    id: "tecnicas",
    title: "2. Tareas Técnicas (Pase, Control, Conducción, Regate, Tiro, Juego aéreo, Entrada, Portero)",
    emoji: "⚽",
    cells: [
      { head: "Pase", detail: "Corto, medio, largo, interior, exterior" },
      { head: "Control", detail: "Orientado, aéreo, superficies" },
      {
        head: "Técnica del Portero",
        detail: "Blocaje, despeje, desvío, saque, posición, salidas, 1v1, juego aéreo",
      },
    ],
  },
  {
    id: "tacticas",
    title: "3. Tareas Tácticas (Ofensiva, Defensiva, Transiciones, Estrategia)",
    emoji: "🛡️",
    cells: [
      { head: "Táctica Individual/Colectiva Ofensiva y Defensiva", detail: "" },
      { head: "Transiciones & Estrategia (A.B.P.)", detail: "" },
    ],
  },
  {
    id: "integradas",
    title: "5. Tareas Integradas o Globales (Juegos de posición, Juegos de conservación, Rondos, Reducidos, Partidos condicionados, Situaciones reales)",
    emoji: "🔥",
    cells: [
      { head: "Juegos de Posición", detail: "Ocupación racional de espacios" },
      { head: "Juegos de Conservación", detail: "Mantenimiento de la posesión ante oposición" },
      { head: "Rondos & Juegos Reducidos (SSG)", detail: "" },
      { head: "Partidos Condicionados & Situaciones Reales de Juego", detail: "" },
    ],
  },
];

// ============================================================================
// PESTAÑA PLANTILLA — capacidades por bloque (estructura del mock master,
// labels REALES de la Ficha de Rendimiento para que los datos cuadren 1:1)
// ============================================================================

export const SUITE_CAPACITY_BLOCKS: {
  key: "fisicas" | "tecnica" | "inteligencia" | "psicologicos";
  title: string;
  accent: string; /// hex de la casa (mismo acento que la Ficha)
  headerClass: string;
}[] = [
  {
    key: "fisicas",
    title: "Capacidades Físicas",
    accent: "#b45309",
    headerClass: "bg-[#b45309] text-cream",
  },
  {
    key: "tecnica",
    title: "Técnica Individual",
    accent: "#1f7a3d",
    headerClass: "bg-brand-600 text-cream",
  },
  {
    key: "inteligencia",
    title: "Inteligencia Táctica",
    accent: "#b4232a",
    headerClass: "bg-[#b4232a] text-cream",
  },
  {
    key: "psicologicos",
    title: "Aspectos Psicológicos",
    accent: "#0e7490",
    headerClass: "bg-[#0e7490] text-cream",
  },
];

// ============================================================================
// PESTAÑA A.B.P. — módulo de balón parado del mock master
// ============================================================================

/// Acciones A.B.P.: 3 tiles del mock, cada uno con FAVOR / CONTRA
export const SUITE_ABP_ACTIONS: { id: string; tile: string; sides: string[] }[] = [
  { id: "corner", tile: "CÓRNER", sides: ["CÓRNER FAVOR", "CÓRNER CONTRA"] },
  { id: "banda", tile: "BANDA", sides: ["BANDA FAVOR", "BANDA CONTRA"] },
  { id: "falta", tile: "FALTA", sides: ["FALTA FAVOR", "FALTA CONTRA"] },
];

/// Resultado & franja temporal: 6 chips EXACTOS del mock
export const SUITE_ABP_RESULTS = [
  "MIN 0 A 15",
  "MIN 16 A 30",
  "REMATE CABEZA",
  "REMATE PIE",
  "SEGUNDA JUGADA",
  "DESPEJE",
] as const;

/// Compone la etiqueta del evento A.B.P. (acción + resultados en orden de clic)
export function composeAbpLabel(action: string | null, results: string[]): string | null {
  if (!action) return null;
  const label = [action, ...results].join(" · ");
  return label.length > 140 ? label.slice(0, 140) : label;
}
