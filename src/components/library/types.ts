// ============================================================================
// TIPOS COMPARTIDOS — PILAR 1: BIBLIOTECA
// ----------------------------------------------------------------------------
// Estructuras serializables que viajan del Server Component al cliente.
// La propia página (RSC) ensambla las recetas bidireccionales:
//   subprincipio → tareas conectadas      (¿qué tareas lo resuelven?)
//   tarea → subprincipios que aborda      (¿qué corrige esta tarea?)
// ============================================================================

import type { Animacion } from "@/lib/animaciones-ejercicio";

export type RecipeLink = {
  subPrincipleId: string;
  relevance: number; // 1 = apoyo · 2 = refuerza · 3 = núcleo
  usageNote: string | null;
  /** Denormalizado para render sin cruces extra */
  spName: string;
  spPhase: string;
  spClubId: string | null;
};

export type SPNode = {
  id: string;
  clubId: string | null; // null = Cátedra global
  parentId: string | null;
  phase: string;
  name: string;
  description: string | null;
  order: number;
  /** Hallazgo ABIERTO del motor que apunta a este subprincipio (si existe) */
  issue: { evidence: string; severity: number } | null;
};

export type TaskCard = {
  id: string;
  clubId: string | null; // null = Cátedra global
  title: string;
  objective: string;
  phases: string[];
  spaceLengthM: number | null;
  spaceWidthM: number | null;
  spaceNote: string | null;
  /** Zona del campo donde se hace la tarea (taxonomía FIELD_ZONES) */
  fieldZoneLabel: string | null;
  fieldZoneX: number | null;
  fieldZoneY: number | null;
  /** Vídeo REAL de la tarea grabado en su zona y metros */
  videoUrl: string | null;
  playersMin: number;
  playersMax: number | null;
  durationMin: number;
  repetitions: string | null;
  intensity: string;
  rulesOfProvocation: string[];
  coachingPoints: string[];
  materials: string[];
  diagramUrl: string | null;
  /** Familia de la TAXONOMÍA OFICIAL (src/lib/task-taxonomy.ts) · null = sin clasificar */
  family: string | null;
  /** «Comentarios sobre el Trabajo» del mock del editor · null = sin comentarios */
  workComments: string | null;
  /** Etapas del proceso de formación que sirve (strings literales del documento) */
  etapasFormacion: string[];
  /** Clasificación Taxonómica Nivel 3 (ids de TASK_TAXONOMY_LEVEL3) */
  nivel3Ids: string[];
  /** Pizarra animada PERSONALIZADA del míster (si no, la UI usa la plantilla determinista) */
  animationData: Animacion | null;
  createdByName: string | null;
  /** Veces prescrita por el motor en microciclos (trazabilidad) */
  usageCount: number;
  recipes: RecipeLink[];
};

export type LibraryData = {
  subprinciples: SPNode[];
  tasks: TaskCard[];
};

/** Tareas que resuelven un subprincipio, ordenadas por relevancia del motor */
export function tasksForSubPrinciple(
  tasks: TaskCard[],
  subPrincipleId: string,
): Array<{ task: TaskCard; relevance: number; usageNote: string | null }> {
  const out: Array<{ task: TaskCard; relevance: number; usageNote: string | null }> = [];
  for (const t of tasks) {
    const link = t.recipes.find((r) => r.subPrincipleId === subPrincipleId);
    if (link) out.push({ task: t, relevance: link.relevance, usageNote: link.usageNote });
  }
  return out.sort((a, b) => b.relevance - a.relevance);
}
