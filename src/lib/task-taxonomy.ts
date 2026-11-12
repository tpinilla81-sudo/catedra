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

// ============================================================================
// BACKFILL DE CLASIFICACIÓN NIVEL 3 (árbol de la Biblioteca)
// ----------------------------------------------------------------------------
// Las tareas creadas ANTES de la migración 20261112150000 tienen nivel3Ids = []
// y el árbol Nivel 3 las dejaría huérfanas. deriveLevel3Ids clasifica una tarea
// legacy SIN tocar la BD (backfill en lectura, idempotente y estable):
//   1) Si ya tiene nivel3Ids válidos → se devuelven limpios y en orden del
//      catálogo (el catálogo manda, no el orden de selección).
//   2) Si no, se deduce de la familia oficial Nivel 2 (Task.family) afinando
//      con palabras clave del título/objetivo (multiselección cruzada válida:
//      p. ej. «Rondos y Juegos de Posición» → Rondos + Juegos de posición).
//   3) Sin familia → heurística pura de texto sobre las 27 hojas.
//   4) Si nada encaja → [] y la tarea aparece en el nodo «Sin clasificar»
//      del árbol, a un clic de re-clasificar desde el editor.
// ============================================================================

const LEVEL3_BY_ID = (ids: string[]): string[] =>
  TASK_TAXONOMY_LEVEL3.filter((c) => ids.includes(c.id)).map((c) => c.id);

/** Texto comparable: minúsculas, sin acentos y espacios colapsados */
function level3Haystack(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function deriveLevel3Ids(
  nivel3Ids: string[] | null | undefined,
  family: string | null | undefined,
  searchText: string,
): string[] {
  // 1) Ya clasificada: catálogo manda (limpieza + orden oficial).
  const own = (nivel3Ids ?? []).filter((id) => TASK_LEVEL3_IDS.has(id));
  if (own.length > 0) return LEVEL3_BY_ID(own);

  const text = level3Haystack(searchText);
  const hit = (re: RegExp) => re.test(text);

  // 2) Deducción desde la familia oficial Nivel 2 + palabras clave.
  switch (family) {
    case "FIS_FUERZA":
      return LEVEL3_BY_ID(["fis_fuerza"]);
    case "FIS_RESISTENCIA":
      return LEVEL3_BY_ID(["fis_resistencia"]);
    case "FIS_VELO_COORD": {
      const ids: string[] = [];
      if (hit(/velocidad|reaccion|sprint|agilidad/)) ids.push("fis_velocidad");
      if (hit(/coordinacion|equilibrio/)) ids.push("fis_coordinacion");
      return LEVEL3_BY_ID(ids.length ? ids : ["fis_velocidad", "fis_coordinacion"]);
    }
    case "TEC_PASE_CONTROL": {
      const ids: string[] = [];
      if (hit(/pase|envio|distribucion con el pie/)) ids.push("tec_pase");
      if (hit(/control|recepcion/)) ids.push("tec_control");
      return LEVEL3_BY_ID(ids.length ? ids : ["tec_pase", "tec_control"]);
    }
    case "TEC_CONDU_REGATE_TIRO": {
      const ids: string[] = [];
      if (hit(/conduccion/)) ids.push("tec_conduccion");
      if (hit(/regate|finta|1v1|1vs1|1x1|dribling/)) ids.push("tec_regate");
      if (hit(/tiro|disparo|remate|finalizacion|definicion/)) ids.push("tec_tiro");
      return LEVEL3_BY_ID(ids.length ? ids : ["tec_conduccion", "tec_regate", "tec_tiro"]);
    }
    case "TEC_PORTERO":
      if (hit(/1vs1|1v1|salida/)) return LEVEL3_BY_ID(["int_reales"]);
      return LEVEL3_BY_ID(["tec_juego_aereo"]);
    case "TAC_OFENSIVA":
      return LEVEL3_BY_ID(["tac_ofensiva"]);
    case "TAC_DEFENSIVA":
      return LEVEL3_BY_ID(["tac_defensiva"]);
    case "TAC_TRANSICIONES":
      return LEVEL3_BY_ID(["tac_transiciones"]);
    case "TAC_ABP":
      return LEVEL3_BY_ID(["tac_estrategia"]);
    case "PSI_ATENCION":
      if (hit(/motivacion/)) return LEVEL3_BY_ID(["psi_motivacion"]);
      if (hit(/confianza/)) return LEVEL3_BY_ID(["psi_confianza"]);
      if (hit(/cohesion|grupo/)) return LEVEL3_BY_ID(["psi_cohesion"]);
      return LEVEL3_BY_ID(["psi_concentracion"]);
    case "PSI_EMOCION":
      if (hit(/cohesion|grupo|liderazgo/)) return LEVEL3_BY_ID(["psi_cohesion"]);
      if (hit(/confianza/)) return LEVEL3_BY_ID(["psi_confianza"]);
      return LEVEL3_BY_ID(["psi_emocional"]);
    case "INT_RONDOS_POSICION": {
      const ids: string[] = [];
      if (hit(/rondo/)) ids.push("int_rondos");
      if (hit(/conservacion|posesion/)) ids.push("int_conservacion");
      if (hit(/posicion|circulacion/)) ids.push("int_posicion");
      return LEVEL3_BY_ID(ids.length ? ids : ["int_rondos", "int_posicion"]);
    }
    case "INT_SSG_CONDICIONADOS": {
      const ids: string[] = [];
      if (hit(/reducid/)) ids.push("int_reducidos");
      if (hit(/condicionad/)) ids.push("int_condicionados");
      if (hit(/situacion real|partido real|11 contra 11|11v11/)) ids.push("int_reales");
      return LEVEL3_BY_ID(ids.length ? ids : ["int_reducidos", "int_condicionados"]);
    }
  }

  // 3) Sin familia: heurística pura de texto sobre las 27 hojas.
  const fromText: string[] = [];
  if (hit(/fuerza|potencia muscular|core/)) fromText.push("fis_fuerza");
  if (hit(/resistencia/)) fromText.push("fis_resistencia");
  if (hit(/velocidad|sprint|reaccion|agilidad/)) fromText.push("fis_velocidad");
  if (hit(/flexibilidad|estiramiento|movilidad/)) fromText.push("fis_flexibilidad");
  if (hit(/coordinacion|equilibrio|lateralidad|propiocep/)) fromText.push("fis_coordinacion");
  if (hit(/pase|pases/)) fromText.push("tec_pase");
  if (hit(/control|recepcion/)) fromText.push("tec_control");
  if (hit(/conduccion/)) fromText.push("tec_conduccion");
  if (hit(/regate|finta|1v1|1vs1|1x1|dribling/)) fromText.push("tec_regate");
  if (hit(/tiro|disparo|remate|finalizacion|definicion/)) fromText.push("tec_tiro");
  if (hit(/aereo|aerea|cabeza|cabezazo/)) fromText.push("tec_juego_aereo");
  if (hit(/entrada al duelo|entradas? (al |a la )?(cancha|duelo)|intercepcion|recuperacion del balon/)) fromText.push("tec_entrada");
  if (hit(/ofensiva|ataque|atacar|progresion/)) fromText.push("tac_ofensiva");
  if (hit(/defensiva|defensa|pressing|presion|marcaje|cobertura|basculacion/)) fromText.push("tac_defensiva");
  if (hit(/transicion|contraataque|reaccion tras perdida/)) fromText.push("tac_transiciones");
  if (hit(/estrategia|balon parado|corner|faltas|penalti|saque de banda/)) fromText.push("tac_estrategia");
  if (hit(/concentracion|atencion|focus/)) fromText.push("psi_concentracion");
  if (hit(/motivacion/)) fromText.push("psi_motivacion");
  if (hit(/confianza/)) fromText.push("psi_confianza");
  if (hit(/emocional|manejo del error|gestion de la presion/)) fromText.push("psi_emocional");
  if (hit(/cohesion|liderazgo|grupo/)) fromText.push("psi_cohesion");
  if (hit(/juegos? de posicion/)) fromText.push("int_posicion");
  if (hit(/conservacion|posesion/)) fromText.push("int_conservacion");
  if (hit(/rondo/)) fromText.push("int_rondos");
  if (hit(/reducid|ssg/)) fromText.push("int_reducidos");
  if (hit(/condicionad|regla de provocacion/)) fromText.push("int_condicionados");
  if (hit(/situacion real|partido real|11 contra 11|11v11/)) fromText.push("int_reales");
  // «presion» solo lo cuenta como táctica defensiva si ya no cayó en otra:
  // está cubierto arriba (tac_defensiva) y en psicológicas por frases largas.
  return LEVEL3_BY_ID(fromText);
}
