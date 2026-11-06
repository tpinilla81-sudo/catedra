import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { Team, User } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { createTenantClient } from "@/lib/tenant";

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

export type TenantContext = {
  /** Registro completo del usuario en BD (con lastTeamId fresco) */
  user: User;
  clubId: string;
  /** Cliente Prisma con tenant guard aplicado */
  db: ReturnType<typeof createTenantClient>;
  /** Equipo activo: lastTeamId del usuario o el primero del club */
  team: Team;
};

/**
 * Contexto de tenant para Server Components y Server Actions.
 * - Requiere sesión con club (si no, redirect a la raíz / login).
 * - Devuelve el cliente Prisma con Tenant Guard aplicado.
 * - Resuelve el equipo activo con persistencia lastTeamId (fricción cero).
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.clubId || !sessionUser.id) redirect("/");

  const db = createTenantClient(sessionUser.clubId);
  const user = await db.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) redirect("/");

  let team: Team | null = null;
  if (user.lastTeamId) {
    team = await db.team.findFirst({ where: { id: user.lastTeamId } });
  }
  team ??= await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (!team) redirect("/"); // club sin equipos: onboarding en fase 2

  return { user, clubId: sessionUser.clubId, db, team };
}
