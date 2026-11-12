// ============================================================================
// TAXONOMÍA OFICIAL COMPLETA DE TAREAS — Biblioteca Maestra (mock del míster)
// ----------------------------------------------------------------------------
// La clasificación oficial de las tareas de entrenamiento por SU NATURALEZA:
//   1. Físicas · 2. Técnicas · 3. Tácticas · 4. Psicológicas · 5. Integradas
// Cada categoría se despliega en FAMILIAS (14) con su descriptor de trabajo.
// Es la dimensión COMPLEMENTARIA a la taxonomía de subprincipios (por fases
// del juego): una tarea pertenece a UNA familia oficial y resuelve VARIOS
// subprincipios (recetas del motor). Se guarda en Task.family (texto libre
// validado contra TASK_FAMILY_IDS — sin enum para poder crecer sin migrar).
// ============================================================================

export type TaskTaxonomyFamily = {
  /** Id estable que se persiste en Task.family */
  id: string;
  /** Nombre exacto de la familia (mock del míster) */
  name: string;
  /** Descriptor entre paréntesis del mock (qué incluye la familia) */
  descriptor: string;
  /** Etiqueta corta del chip: Físico · Técnico · Portería · Táctico · Transición · ABP · Psico · Global */
  chip: string;
  /** Clases del chip en el estilo crema/verde de la casa */
  chipClass: string;
};

export type TaskTaxonomyCategory = {
  id: string;
  emoji: string;
  label: string;
  /** Enumeración del mock entre paréntesis en la cabecera de cada sección */
  hint: string;
  families: TaskTaxonomyFamily[];
};

export const TASK_TAXONOMY: TaskTaxonomyCategory[] = [
  {
    id: "fisicas",
    emoji: "⚡",
    label: "Tareas Físicas",
    hint: "Fuerza, Resistencia, Velocidad, Flexibilidad, Coordinación",
    families: [
      {
        id: "FIS_FUERZA",
        name: "Fuerza",
        descriptor: "General, máxima, explosiva, resistencia",
        chip: "Físico",
        chipClass: "bg-[#b45309]/10 text-[#b45309] border-[#b45309]/30",
      },
      {
        id: "FIS_RESISTENCIA",
        name: "Resistencia",
        descriptor: "Aeróbica, anaeróbica, intermitente",
        chip: "Físico",
        chipClass: "bg-[#b45309]/10 text-[#b45309] border-[#b45309]/30",
      },
      {
        id: "FIS_VELO_COORD",
        name: "Velocidad y Coordinación",
        descriptor: "Reacción, agilidad, equilibrio",
        chip: "Físico",
        chipClass: "bg-[#b45309]/10 text-[#b45309] border-[#b45309]/30",
      },
    ],
  },
  {
    id: "tecnicas",
    emoji: "⚽",
    label: "Tareas Técnicas",
    hint: "Pase, Control, Conducción, Regate, Tiro, Portero",
    families: [
      {
        id: "TEC_PASE_CONTROL",
        name: "Pase y Control",
        descriptor: "Corto, medio, largo, orientado",
        chip: "Técnico",
        chipClass: "bg-brand-600/10 text-brand-600 border-brand-600/30",
      },
      {
        id: "TEC_CONDU_REGATE_TIRO",
        name: "Conducción, Regate y Tiro",
        descriptor: "Precisión, fintas, 1v1",
        chip: "Técnico",
        chipClass: "bg-brand-600/10 text-brand-600 border-brand-600/30",
      },
      {
        id: "TEC_PORTERO",
        name: "Técnica del Portero",
        descriptor: "Blocajes, desvíos, 1vs1",
        chip: "Portería",
        chipClass: "bg-[#0e7490]/10 text-[#0e7490] border-[#0e7490]/30",
      },
    ],
  },
  {
    id: "tacticas",
    emoji: "🛡️",
    label: "Tareas Tácticas",
    hint: "Ofensiva, Defensiva, Transiciones, ABP",
    families: [
      {
        id: "TAC_OFENSIVA",
        name: "Organización Ofensiva / Individual",
        descriptor: "Desmarques, apoyos, amplitud",
        chip: "Táctico",
        chipClass: "bg-[#4d7c0f]/10 text-[#4d7c0f] border-[#4d7c0f]/30",
      },
      {
        id: "TAC_DEFENSIVA",
        name: "Organización Defensiva / Individual",
        descriptor: "Marcaje, pressing, basculación",
        chip: "Táctico",
        chipClass: "bg-[#4d7c0f]/10 text-[#4d7c0f] border-[#4d7c0f]/30",
      },
      {
        id: "TAC_TRANSICIONES",
        name: "Transiciones Ofensivas y Defensivas",
        descriptor: "Contraataque, reacción tras pérdida",
        chip: "Transición",
        chipClass: "bg-[#0369a1]/10 text-[#0369a1] border-[#0369a1]/30",
      },
      {
        id: "TAC_ABP",
        name: "Estrategia / Balón Parado (ABP)",
        descriptor: "Córners, faltas, penaltis",
        chip: "ABP",
        chipClass: "bg-[#7c3aed]/10 text-[#7c3aed] border-[#7c3aed]/30",
      },
    ],
  },
  {
    id: "psicologicas",
    emoji: "🧠",
    label: "Tareas Psicológicas",
    hint: "Atención, Motivación, Confianza, Cohesión",
    families: [
      {
        id: "PSI_ATENCION",
        name: "Atención y Concentración",
        descriptor: "Percepción y anticipación",
        chip: "Psico",
        chipClass: "bg-[#be185d]/10 text-[#be185d] border-[#be185d]/30",
      },
      {
        id: "PSI_EMOCION",
        name: "Gestión Emocional y Cohesión",
        descriptor: "Control de presión, liderazgo",
        chip: "Psico",
        chipClass: "bg-[#be185d]/10 text-[#be185d] border-[#be185d]/30",
      },
    ],
  },
  {
    id: "integradas",
    emoji: "🔥",
    label: "Tareas Integradas o Globales",
    hint: "Rondos, Juegos de posición, SSG, Partidos condicionados",
    families: [
      {
        id: "INT_RONDOS_POSICION",
        name: "Rondos y Juegos de Posición",
        descriptor: "Circulación y espacios",
        chip: "Global",
        chipClass: "bg-[#c2410c]/10 text-[#c2410c] border-[#c2410c]/30",
      },
      {
        id: "INT_SSG_CONDICIONADOS",
        name: "Juegos Reducidos (SSG) y Partidos Condicionados",
        descriptor: "Formatos reducidos con reglas de provocación",
        chip: "Global",
        chipClass: "bg-[#c2410c]/10 text-[#c2410c] border-[#c2410c]/30",
      },
    ],
  },
];

/** Todas las familias planas (para validar Task.family en el server action) */
export const TASK_FAMILIES: TaskTaxonomyFamily[] = TASK_TAXONOMY.flatMap(
  (c) => c.families,
);

export const TASK_FAMILY_IDS = new Set(TASK_FAMILIES.map((f) => f.id));

export const TASK_FAMILY_COUNT = TASK_FAMILIES.length;

/** Meta de una familia por id (null si el id no es de la taxonomía oficial) */
export function taskFamilyMeta(id: string | null | undefined): {
  family: TaskTaxonomyFamily;
  category: TaskTaxonomyCategory;
} | null {
  if (!id) return null;
  for (const cat of TASK_TAXONOMY) {
    const fam = cat.families.find((f) => f.id === id);
    if (fam) return { family: fam, category: cat };
  }
  return null;
}

// ============================================================================
// ETAPAS DEL PROCESO DE FORMACIÓN (mock 'EditorTarea' · documento oficial)
// ----------------------------------------------------------------------------
// Las 5 fases del proceso de formación del futbolista, con su denominación
// LITERAL del mock (cada fase entre paréntesis nombre las categorías que la
// viven). Multiselección en el editor: una tarea puede servir a VARIAS etapas.
// Se persisten los STRINGS completos en Task.etapasFormacion (String[]).
// ============================================================================

export const ETAPAS_FORMACION: readonly string[] = [
  "Fase de Iniciación (Benjamín y Alevín)",
  "Fase de Desarrollo (Infantil)",
  "Fase de Perfeccionamiento (Cadete y Juvenil 1º año)",
  "Fase de Rendimiento (2º y 3º Juvenil, Filial y Primer Equipo)",
  "Fase de Culminación (Filial y Primer Equipo)",
];

export const ETAPA_FORMACION_IDS = new Set(ETAPAS_FORMACION);

// ============================================================================
// CLASIFICACIÓN TAXONÓMICA NIVEL 3 (mock 'EditorTarea' · multiselección cruzada)
// ----------------------------------------------------------------------------
// El NIVEL 3 de la taxonomía: las 27 categorías específicas agrupadas en los
// 5 bloques del documento oficial (Físicas · Técnicas · Tácticas ·
// Psicológicas · Integradas o Globales). Es la dimensión FINA y MULTISELECT
// (una tarea toca varias categorías a la vez — "multiselección cruzada"),
// complementaria a la familia Nivel 2 (Task.family, un único valor).
// Se persisten los ids en Task.nivel3Ids (String[]). Los nombres son
// LITERALES del mock, incluidas las nuevas de Técnicas (Juego aéreo, Entrada).
// ============================================================================

export type TaskLevel3Category = {
  id: string;
  bloque: "Físicas" | "Técnicas" | "Tácticas" | "Psicológicas" | "Integradas o Globales";
  nombre: string;
};

export const TASK_TAXONOMY_LEVEL3: readonly TaskLevel3Category[] = [
  // FÍSICAS (5)
  { id: "fis_fuerza", bloque: "Físicas", nombre: "Fuerza" },
  { id: "fis_resistencia", bloque: "Físicas", nombre: "Resistencia" },
  { id: "fis_velocidad", bloque: "Físicas", nombre: "Velocidad" },
  { id: "fis_flexibilidad", bloque: "Físicas", nombre: "Flexibilidad" },
  { id: "fis_coordinacion", bloque: "Físicas", nombre: "Coordinación" },
  // TÉCNICAS (7)
  { id: "tec_pase", bloque: "Técnicas", nombre: "Pase" },
  { id: "tec_control", bloque: "Técnicas", nombre: "Control" },
  { id: "tec_conduccion", bloque: "Técnicas", nombre: "Conducción" },
  { id: "tec_regate", bloque: "Técnicas", nombre: "Regate" },
  { id: "tec_tiro", bloque: "Técnicas", nombre: "Tiro" },
  { id: "tec_juego_aereo", bloque: "Técnicas", nombre: "Juego aéreo" },
  { id: "tec_entrada", bloque: "Técnicas", nombre: "Entrada" },
  // TÁCTICAS (4)
  { id: "tac_ofensiva", bloque: "Tácticas", nombre: "Ofensiva" },
  { id: "tac_defensiva", bloque: "Tácticas", nombre: "Defensiva" },
  { id: "tac_transiciones", bloque: "Tácticas", nombre: "Transiciones" },
  { id: "tac_estrategia", bloque: "Tácticas", nombre: "Estrategia" },
  // PSICOLÓGICAS (5)
  { id: "psi_concentracion", bloque: "Psicológicas", nombre: "Concentración" },
  { id: "psi_motivacion", bloque: "Psicológicas", nombre: "Motivación" },
  { id: "psi_confianza", bloque: "Psicológicas", nombre: "Confianza" },
  { id: "psi_emocional", bloque: "Psicológicas", nombre: "Gestión emocional" },
  { id: "psi_cohesion", bloque: "Psicológicas", nombre: "Cohesión grupal" },
  // INTEGRADAS O GLOBALES (6)
  { id: "int_posicion", bloque: "Integradas o Globales", nombre: "Juegos de posición" },
  { id: "int_conservacion", bloque: "Integradas o Globales", nombre: "Juegos de conservación" },
  { id: "int_rondos", bloque: "Integradas o Globales", nombre: "Rondos" },
  { id: "int_reducidos", bloque: "Integradas o Globales", nombre: "Juegos reducidos" },
  { id: "int_condicionados", bloque: "Integradas o Globales", nombre: "Partidos condicionados" },
  { id: "int_reales", bloque: "Integradas o Globales", nombre: "Situaciones reales de juego" },
];

export const TASK_LEVEL3_IDS = new Set(TASK_TAXONOMY_LEVEL3.map((c) => c.id));

/** Orden de los 5 bloques Nivel 3 (cabeceras del mock) */
export const LEVEL3_BLOQUES: readonly TaskLevel3Category["bloque"][] = [
  "Físicas",
  "Técnicas",
  "Tácticas",
  "Psicológicas",
  "Integradas o Globales",
];

/** Meta de una categoría Nivel 3 por id (null si no existe) */
export function taskLevel3Meta(id: string): TaskLevel3Category | null {
  return TASK_TAXONOMY_LEVEL3.find((c) => c.id === id) ?? null;
}
