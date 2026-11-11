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
