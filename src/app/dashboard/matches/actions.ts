"use server";

// ============================================================================
// SERVER ACTIONS — PILAR 3: PARTIDOS
// ----------------------------------------------------------------------------
// createMatch → alta exprés de un partido desde la pantalla Partidos.
//   • clubId SIEMPRE viene de la sesión (Tenant Guard: enforceClubId lo
//     inyecta en el create — nunca se confía en el cliente).
//   • teamId viene del contexto de servidor (equipo activo del míster).
//   • Tras crear, el cliente salta directo a la ingesta ?g=<id>:
//     semáforo (Paso 1) → pizarra táctica sobre el campo (Paso 2).
// ============================================================================

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/session";

export type CreateMatchInput = {
  opponent: string;
  /** Fecha local "YYYY-MM-DD" */
  date: string;
  /** Hora local "HH:mm" */
  time: string;
  isHome: boolean;
  competition?: string;
  location?: string;
};

export type CreateMatchResult =
  | { ok: true; matchId: string }
  | { ok: false; error: string };

export async function createMatch(
  input: CreateMatchInput,
): Promise<CreateMatchResult> {
  const { db, team, clubId } = await requireTenantContext();

  // ---------- Validación server-side (el cliente es territorio hostil) ----------
  const opponent = (input.opponent ?? "").trim();
  if (opponent.length < 2 || opponent.length > 80) {
    return {
      ok: false,
      error: "Escribe el nombre del rival (entre 2 y 80 caracteres).",
    };
  }

  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "");
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time ?? "");
  if (!dateOk || !timeOk) {
    return { ok: false, error: "Fecha u hora inválida." };
  }

  const kickoffAt = new Date(`${input.date}T${input.time}:00`);
  if (Number.isNaN(kickoffAt.getTime())) {
    return { ok: false, error: "Fecha u hora inválida." };
  }

  const competition = input.competition?.trim().slice(0, 60) || null;
  const location = input.location?.trim().slice(0, 80) || null;

  // ---------- Escritura bajo Tenant Guard ----------
  // clubId SIEMPRE de la sesión (el guard lo valida: un clubId ajeno → throw).
  const match = await db.match.create({
    data: {
      opponent,
      kickoffAt,
      isHome: Boolean(input.isHome),
      competition,
      location,
      teamId: team.id,
      clubId,
    },
  });

  revalidatePath("/dashboard/matches");
  revalidatePath("/dashboard/today");

  return { ok: true, matchId: match.id };
}
