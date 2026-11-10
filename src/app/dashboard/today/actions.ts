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
// Resiliencia (auditoría forense): el pipeline corre en UNA transacción y el
// P2002 de una carrera TOCTOU (dos dispositivos cocinando a la vez) se captura
// aquí y en el propio pipeline: se responde created:false, nunca un 500.
// ============================================================================

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireTenantContext } from "@/lib/session";
import { mondayOf } from "@/lib/engine/diagnose";
import { runWeeklyProposalPipeline } from "@/lib/engine/pipeline";

function currentWeekStart(): Date {
  // Semana ISO con referencia horaria EXPLÍCITA Europe/Madrid (mondayOf,
  // src/lib/utils/dates.ts): el lunes lo decide el calendario del vestuario,
  // no la TZ del proceso. Evita el salto de día por UTC en la frontera
  // 00:00–02:00 (lunes madrugada Madrid = domingo UTC).
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
  revalidatePath("/dashboard/compacto"); // el tab Hoy del modo compacto comparte este motor
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
  const weekStart = currentWeekStart();

  try {
    const result = await runWeeklyProposalPipeline(db, {
      clubId: team.clubId,
      teamId: team.id,
      weekStart,
    });

    revalidatePath("/dashboard/today");
    revalidatePath("/dashboard/compacto"); // el tab Hoy del modo compacto comparte este motor
    revalidatePath("/");
    return {
      ok: true,
      created: result.created,
      microcycleId: result.microcycleId,
      runId: result.runId,
      prescriptions: result.prescriptions.length,
      discarded: result.discarded.length,
    };
  } catch (e) {
    // Red de seguridad adicional: el pipeline ya convierte la carrera P2002
    // en created:false; si por cualquier otra vía escapara un P2002 (o llegara
    // otro error), se degrada a una respuesta controlada — sin 500 sin capturar.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await db.microcycle.findUnique({
        where: { teamId_weekStart: { teamId: team.id, weekStart } },
        select: { id: true },
      });
      revalidatePath("/dashboard/today");
      return {
        ok: true,
        created: false,
        microcycleId: existing?.id ?? null,
        runId: null,
        prescriptions: 0,
        discarded: 0,
      };
    }
    console.error("[ensureWeeklyProposal] fallo del motor:", e);
    return {
      ok: false,
      created: false,
      microcycleId: null,
      runId: null,
      prescriptions: 0,
      discarded: 0,
      error: e instanceof Error ? e.message.slice(0, 140) : "Error del motor.",
    };
  }
}
