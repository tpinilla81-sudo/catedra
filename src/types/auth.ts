// ============================================================================
// TIPOS DE AUTENTICACIÓN — Contrato compartido servidor ↔ cliente
// ----------------------------------------------------------------------------
// Fuente única de verdad para el rol y la forma de la sesión en toda la app.
// `Role` replica el enum `Role` de Prisma (mismos literales), pero vive aquí
// para que los componentes de cliente puedan importarlo sin tocar el bundle
// de Prisma.
// ============================================================================

export type Role = "PLATFORM_ADMIN" | "COACH_ADMIN" | "ANALYST";

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: Role;
  clubId?: string | null;
}
