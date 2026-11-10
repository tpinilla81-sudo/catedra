// ============================================================================
// BIBLIOTECA — ACCESO Y VALIDACIÓN COMPARTIDA (Server Actions + API Pilar 2)
// ----------------------------------------------------------------------------
// Funciones PURAS compartidas por:
//   · src/app/dashboard/library/actions.ts  (Server Actions "use server")
//   · src/app/api/pilar2/tasks/*            (REST API del Pilar 2)
// así ambas vías de escritura aplican EXACTAMENTE las mismas reglas de RBAC,
// multi-tenancy y validación de ficha de tarea. Nada de I/O aquí.
//
// REGLAS DE ORO (multi-tenant + propiedad del despliegue):
//   1. El contenido GLOBAL de la Cátedra (clubId = null) lo escribe
//      PLATFORM_ADMIN y, a partir de la petición del míster, TAMBIÉN el
//      COACH_ADMIN del club (es dueño del despliegue: ajusta tareas y
//      taxonomía sembradas sin duplicar). ANALYST sigue de solo lectura.
//   2. "Duplicar a mi club" sigue disponible como vía rápida para
//      personalizar sin tocar la Cátedra.
//   3. RBAC: ANALYST solo lectura · COACH_ADMIN CRUD de su club Y de la
//      Cátedra · PLATFORM_ADMIN CRUD del contenido global (nunca de un club).
// ============================================================================

import type { User } from "@prisma/client";

export const PHASES = ["OFFENSIVE", "DEFENSIVE", "OFF_TRANSITION", "DEF_TRANSITION", "SET_PIECE"];
export const INTENSITIES = ["LOW", "MEDIUM", "HIGH"];

export const MSG_READONLY_ANALYST =
  "Tu rol (Analista) es de solo lectura. Solicita al míster los cambios de la biblioteca.";
export const MSG_CATEDRA_READONLY =
  "Tu rol (Analista) es de solo lectura: la biblioteca la edita el míster.";
export const MSG_PLATFORM_NO_CLUB =
  "La Cátedra gestiona contenido global: nunca edita el contenido privado de un club.";

/** Escribe sobre `targetClubId` (null = contenido global Cátedra) desde el contexto `ctxClubId`. */
export function writeGuard(
  user: Pick<User, "role">,
  targetClubId: string | null,
  ctxClubId: string | null,
): string | null {
  // 1) ANALYST: solo lectura en todo el sistema.
  if (user.role === "ANALYST") return MSG_READONLY_ANALYST;
  // 2) Contenido global de la Cátedra: PLATFORM_ADMIN o COACH_ADMIN del club
  //    (dueño del despliegue — el míster edita tareas y taxonomía sembradas).
  if (targetClubId === null) {
    if (user.role === "PLATFORM_ADMIN") return null;
    return user.role === "COACH_ADMIN" ? null : MSG_CATEDRA_READONLY;
  }
  // 3) Contenido de club: solo el COACH_ADMIN del club dueño.
  if (user.role === "PLATFORM_ADMIN") return MSG_PLATFORM_NO_CLUB;
  return targetClubId === ctxClubId ? null : "No puedes editar contenido de otro club.";
}

/** Crea contenido en el contexto actual (club o plataforma global). */
export function createGuard(
  user: Pick<User, "role">,
  ctxClubId: string | null,
): string | null {
  if (ctxClubId === null) return user.role === "PLATFORM_ADMIN" ? null : MSG_CATEDRA_READONLY;
  if (user.role === "ANALYST") return MSG_READONLY_ANALYST;
  return null;
}

/** Duplicar a mi club = crear contenido del club → COACH_ADMIN en contexto club. */
export function duplicateGuard(
  user: Pick<User, "role">,
  ctxClubId: string | null,
): string | null {
  if (ctxClubId === null) return MSG_PLATFORM_NO_CLUB;
  if (user.role === "ANALYST") return MSG_READONLY_ANALYST;
  return null;
}

// ---------- Normalización / validación de ficha de tarea ----------

export function cleanStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function optStr(v: unknown, max: number): string | null {
  const s = cleanStr(v, max);
  return s.length > 0 ? s : null;
}

export function optInt(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export function reqInt(v: unknown, min: number, max: number): number | null {
  return optInt(v, min, max);
}

export function strList(v: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    const s = cleanStr(item, 160);
    if (s.length === 0) continue;
    if (out.includes(s)) continue;
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}
