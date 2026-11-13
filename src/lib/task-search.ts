// ============================================================================
// BUSCADOR REFORZADO DE LA BIBLIOTECA — ficha completa, multi-palabra, sin acentos
// ----------------------------------------------------------------------------
// • Heno (texto buscable) de CADA tarea: título, objetivo, comentarios del
//   trabajo, familia, etapas de formación, reglas de provocación, puntos de
//   co-achéo, materiales, categorías Nivel 3 (nombre + bloque), subprincipios
//   de sus recetas, fases, intensidad, origen, zona del campo, notas de espacio
//   y autora. Buscar «conservacion» encuentra las tareas de Juegos de
//   conservación aunque el título no lo diga.
// • Multi-palabra Y: cada palabra debe aparecer en ALGÚN campo (orden libre):
//   «rondo comodines» ≠ substring, ahora sí filtra.
// • Insensible a acentos y mayúsculas vía normalizeName (NFD sin diacríticos).
// • Resaltado: para el español la normalización PRESERVA la longitud del texto
//   (é→e, ñ→n, 1 carácter a 1), así que los rangos hallados en el heno se
//   proyectan 1:1 sobre el texto original para pintar <mark>. Si un texto
//   cambia de longitud al normalizar (p. ej. ligaduras), no se resalta.
// ============================================================================

import { fieldZoneLabel } from "@/lib/field-zone";
import { INTENSITY_META, PHASE_META, normalizeName } from "@/lib/taxonomy";
import { taskLevel3Meta } from "@/lib/task-taxonomy";
import type { TaskCard } from "@/components/library/types";

/** Todo el texto buscable de una tarea, normalizado (minúsculas, sin acentos) */
export function taskHaystack(t: TaskCard): string {
  const parts: string[] = [
    t.title,
    t.objective,
    t.workComments ?? "",
    t.family ?? "",
    ...t.etapasFormacion,
    ...t.rulesOfProvocation,
    ...t.coachingPoints,
    ...t.materials,
  ];
  for (const id of t.nivel3Ids) {
    const m = taskLevel3Meta(id);
    if (m) parts.push(m.nombre, m.bloque);
  }
  for (const r of t.recipes) parts.push(r.spName);
  for (const p of t.phases) parts.push(PHASE_META[p]?.label ?? "");
  parts.push(INTENSITY_META[t.intensity]?.label ?? "");
  parts.push(t.clubId === null ? "Cátedra global" : "club");
  parts.push(fieldZoneLabel(t.fieldZoneLabel));
  if (t.spaceNote) parts.push(t.spaceNote);
  if (t.createdByName) parts.push(t.createdByName);
  return normalizeName(parts.filter((s) => s && s.trim().length > 0).join(" · "));
}

/** Consulta libre → tokens normalizados (búsqueda multi-palabra, orden libre) */
export function queryTokens(q: string): string[] {
  return normalizeName(q).split(" ").filter(Boolean);
}

/** ¿Cumple la tarea TODOS los tokens? Cada token puede estar en CUALQUIER campo */
export function taskMatches(haystack: string, tokens: string[]): boolean {
  return tokens.every((tok) => haystack.includes(tok));
}

/**
 * Rangos [inicio, fin) a resaltar en `text` para los tokens dados.
 * Devuelve rangos fusionados y ordenados, o [] si no hay coincidencia o el
 * texto no proyecta 1:1 sobre su versión normalizada.
 */
export function highlightRanges(text: string, tokens: string[]): Array<[number, number]> {
  if (tokens.length === 0 || text.length === 0) return [];
  const norm = normalizeName(text);
  if (norm.length !== text.length) return [];
  const raw: Array<[number, number]> = [];
  for (const tok of tokens) {
    if (!tok) continue;
    let from = 0;
    for (;;) {
      const i = norm.indexOf(tok, from);
      if (i === -1) break;
      raw.push([i, i + tok.length]);
      from = i + tok.length;
    }
  }
  if (raw.length === 0) return [];
  raw.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}
