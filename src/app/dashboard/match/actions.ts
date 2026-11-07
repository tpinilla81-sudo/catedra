"use server";

// ============================================================================
// SERVER ACTIONS — PILAR 3: INGESTA POST-PARTIDO EXPRÉS (< 3 MIN)
// ----------------------------------------------------------------------------
// submitMatchReport → guarda en UNA transacción: MatchReport (semáforo +
//   sliders), TacticalEvent[] (pizarra táctil) y PlayerMatchNote[] (cuaderno).
//   Después dispara el HOOK DEL MOTOR (Pilar 4): racha de resultados +
//   re-prescripción de propuestas PROPOSED + evidencia inmediata.
//   La lógica completa vive en @/lib/match-ingest, fuente única compartida
//   con la validación E2E del Pilar 3. Esta action solo resuelve el contexto
//   de tenant y revalida las rutas afectadas.
// ============================================================================

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/session";
import { runMatchIngest, type SubmitPayload, type SubmitResult } from "@/lib/match-ingest";

export type { EventInput, NoteInput, SubmitPayload, SubmitResult } from "@/lib/match-ingest";

export async function submitMatchReport(
  payload: SubmitPayload,
): Promise<SubmitResult> {
  const { db, user, team } = await requireTenantContext();

  const result = await runMatchIngest(db, { user, team }, payload);

  if (result.ok) {
    revalidatePath("/dashboard/today");
    revalidatePath("/dashboard/matches");
    revalidatePath("/dashboard/players");
    revalidatePath("/dashboard/match");
  }

  return result;
}
