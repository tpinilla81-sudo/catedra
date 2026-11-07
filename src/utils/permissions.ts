// ============================================================================
// PERMISOS — Jerarquía de roles y verificación de acceso
// ----------------------------------------------------------------------------
// Modelo jerárquico: ANALYST (1) < COACH_ADMIN (2) < PLATFORM_ADMIN (3).
// `hasPermission` responde "¿puede `user` ejecutar una acción que requiere
// `requiredRole`?". Es puro y sin dependencias de servidor → usable en
// Server Actions (guard autoritativo) y en componentes de cliente (ocultar
// controles). El guard real SIEMPRE vive en el servidor.
// ============================================================================

import type { Role, UserSession } from "@/types/auth";

/**
 * Verifica si un usuario tiene permisos suficientes según su rol jerárquico.
 * @param user - Objeto de la sesión del usuario actual.
 * @param requiredRole - Rol mínimo requerido para la acción.
 * @returns boolean indicando si el acceso está permitido.
 */
export function hasPermission(
  user: UserSession | null,
  requiredRole: Role,
): boolean {
  if (!user) return false;

  const roleHierarchy: Record<Role, number> = {
    ANALYST: 1,
    COACH_ADMIN: 2,
    PLATFORM_ADMIN: 3,
  };

  const userLevel = roleHierarchy[user.role] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 99;

  return userLevel >= requiredLevel;
}

/** Sujeto: sesión completa o, al menos, el rol. */
type Subject = UserSession | Role | null;

function roleOf(subject: Subject): Role | null {
  if (!subject) return null;
  return typeof subject === "string" ? subject : subject.role;
}

/**
 * Helpers de dominio del Pilar 1 (Biblioteca / Cátedra) derivados de
 * `hasPermission`. Reglas de propiedad:
 *   • COACH_ADMIN → escribe SOLO contenido de su club.
 *   • PLATFORM_ADMIN → escribe SOLO contenido global de la Cátedra
 *     (clubId = null); nunca toca contenido de un club concreto.
 *   • ANALYST → solo lectura.
 */
export function canWriteClubContent(subject: Subject): boolean {
  const role = roleOf(subject);
  return hasPermission(
    role ? { id: "", email: "", name: "", role } : null,
    "COACH_ADMIN",
  ) && role !== "PLATFORM_ADMIN";
}

export function canWriteCatedra(subject: Subject): boolean {
  return roleOf(subject) === "PLATFORM_ADMIN";
}

/** El ANALYST consulta la biblioteca; no puede mutar nada. */
export function isReadOnlyRole(subject: Subject): boolean {
  return roleOf(subject) === null || roleOf(subject) === "ANALYST";
}
