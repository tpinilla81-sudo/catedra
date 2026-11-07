"use server";

// ============================================================================
// SERVER ACTIONS — Vista "Hoy" (Pilar 4)
// ----------------------------------------------------------------------------
// acceptPlan          → el míster valida la propuesta con UN toque.
// ensureWeeklyProposal→ motor prescriptivo v0.2: si no existe microciclo para
//                       la semana actual, lo cocina a partir de los datos
//                       reales (eventing táctico + pulso colectivo + plantilla)
//                       y persiste la auditoría completa en EngineRun.
// setActiveTeam       → persistencia del último equipo activo (fricción cero).
// Regla de oro: cero pantallas en blanco — el lunes SIEMPRE hay propuesta.
// ============================================================================

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/session";
import { mondayOf } from "@/lib/engine/diagnose";
import { runWeeklyProposalPipeline } from "@/lib/engine/pipeline";

function currentWeekStart(): Date {
  // Semana ISO: comienza el lunes. (TZ del servidor UTC; precisión horaria
  // afinada en fase 2 con timezone Europe/Madrid explícita.)
  return mondayOf(new Date());
}

/** [✅ Aceptar Plan] — PROPOSED → ACCEPTED con un solo toque */
export async function acceptPlan(microcycleId: string) {
  const { db, user } = await requireTenantContext();

  const microcycle = await db.microcycle.update({
    where: { id: microcycleId },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      acceptedById: user.id,
    },
  });

  revalidatePath("/dashboard/today");
  revalidatePath("/");
  return { ok: true, status: microcycle.status };
}

/** Persistencia del último equipo activo (fricción cero al reentrar) */
export async function setActiveTeam(teamId: string) {
  const { db, user } = await requireTenantContext();
  await db.user.update({ where: { id: user.id }, data: { lastTeamId: teamId } });
  return { ok: true };
}

/**
 * Motor prescriptivo v0.2 — genera la propuesta semanal si no existe.
 * La lógica completa (diagnóstico → ranking de candidatas → factibilidad →
 * microciclo → auditoría EngineRun) vive en @/lib/engine/pipeline, fuente
 * única compartida con la ingesta post-partido y la validación E2E.
 */
export async function ensureWeeklyProposal() {
  const { db, team } = await requireTenantContext();

  const result = await runWeeklyProposalPipeline(db, {
    clubId: team.clubId,
    teamId: team.id,
    weekStart: currentWeekStart(),
  });

  revalidatePath("/dashboard/today");
  revalidatePath("/");
  return {
    ok: true,
    created: result.created,
    microcycleId: result.microcycleId,
    runId: result.runId,
    prescriptions: result.prescriptions.length,
    discarded: result.discarded.length,
  };
}
