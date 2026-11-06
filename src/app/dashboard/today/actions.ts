"use server";

// ============================================================================
// SERVER ACTIONS — Vista "Hoy" (Pilar 4 v0.1)
// ----------------------------------------------------------------------------
// acceptPlan          → el míster valida la propuesta con UN toque.
// ensureWeeklyProposal→ motor heurístico v0.1: si no existe microciclo para la
//                       semana actual, lo cocina a partir de los datos reales
//                       (eventing táctico + pulso colectivo + plantilla).
// Regla de oro: cero pantallas en blanco — el lunes SIEMPRE hay propuesta.
// ============================================================================

import { revalidatePath } from "next/cache";
import { startOfWeek, subDays } from "date-fns";
import { requireTenantContext } from "@/lib/session";

function currentWeekStart(): Date {
  // Semana ISO: comienza el lunes. (TZ del servidor UTC; precisión horaria
  // afinada en fase 2 con timezone Europe/Madrid explícita.)
  return startOfWeek(new Date(), { weekStartsOn: 1 });
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

type IssueDraft = {
  kind: "TACTICAL" | "PHYSICAL" | "MORALE";
  phase?: "OFFENSIVE" | "DEFENSIVE" | "OFF_TRANSITION" | "DEF_TRANSITION" | "SET_PIECE";
  subPrincipleId?: string;
  severity: number;
  evidence: string;
  metric: Record<string, unknown>;
};

/**
 * Motor heurístico v0.1 — genera la propuesta semanal si no existe.
 * Entradas: último pulso colectivo + eventing táctico del último partido
 *           + plantilla disponible. Salida: Microcycle PROPOSED con issues,
 *           sesiones MD+1…MD-1 y tareas prescritas con rationale.
 */
export async function ensureWeeklyProposal() {
  const { db, team } = await requireTenantContext();
  const weekStart = currentWeekStart();

  const existing = await db.microcycle.findUnique({
    where: { teamId_weekStart: { teamId: team.id, weekStart } },
  });
  if (existing) return { ok: true, created: false, microcycleId: existing.id };

  // ---------- 1) Datos de entrada ----------
  const pulse = await db.teamPulse.findFirst({
    where: { teamId: team.id },
    orderBy: { date: "desc" },
  });

  const windowStart = subDays(weekStart, 8);
  const recentMatches = await db.match.findMany({
    where: {
      teamId: team.id,
      status: { in: ["PLAYED", "ANALYZED"] },
      kickoffAt: { gte: windowStart },
    },
    orderBy: { kickoffAt: "desc" },
    take: 2,
    include: { report: { include: { events: true } } },
  });

  const availablePlayers = await db.player.count({
    where: { teamId: team.id, isActive: true, status: { in: ["AVAILABLE", "RETURNING"] } },
  });

  // ---------- 2) Heurística de diagnóstico ----------
  const drafts: IssueDraft[] = [];

  if (pulse && pulse.fatigueScore >= 7) {
    drafts.push({
      kind: "PHYSICAL",
      severity: 4,
      evidence: `Fatiga grupal acumulada ${pulse.fatigueScore}/10 — controlar la carga de la semana`,
      metric: { fatigueScore: pulse.fatigueScore },
    });
  }
  if (pulse && pulse.moraleScore <= 4) {
    drafts.push({
      kind: "MORALE",
      severity: 3,
      evidence: `Inercia anímica baja (${pulse.moraleScore}/10) — priorizar tareas de éxito temprano`,
      metric: { moraleScore: pulse.moraleScore },
    });
  }

  const last = recentMatches[0];
  if (last?.report) {
    const losses = last.report.events.filter((e) => e.type === "BALL_LOSS");
    const buildUpLosses = losses.filter((e) => e.x <= 35); // 1/3 de campo propio
    if (buildUpLosses.length >= 6) {
      const sp = await db.subPrinciple.findFirst({ where: { phase: "OFF_TRANSITION" } });
      drafts.push({
        kind: "TACTICAL",
        phase: "OFF_TRANSITION",
        subPrincipleId: sp?.id,
        severity: Math.min(5, 2 + Math.floor(buildUpLosses.length / 4)),
        evidence: `${buildUpLosses.length} pérdidas en construcción (1/3 propio) — reacción tras pérdida`,
        metric: { totalLosses: losses.length, buildUpLosses: buildUpLosses.length },
      });
    }
    const negDuels = last.report.events.filter((e) => e.type === "NEGATIVE_DUEL").length;
    if (negDuels >= 6) {
      const sp = await db.subPrinciple.findFirst({ where: { phase: "DEFENSIVE" } });
      drafts.push({
        kind: "TACTICAL",
        phase: "DEFENSIVE",
        subPrincipleId: sp?.id,
        severity: 3,
        evidence: `${negDuels} duelos perdidos — intensidad en el duelo y basculaciones`,
        metric: { negDuels },
      });
    }
  }

  if (drafts.length === 0) {
    const sp = await db.subPrinciple.findFirst({ where: { phase: "OFFENSIVE" } });
    drafts.push({
      kind: "TACTICAL",
      phase: "OFFENSIVE",
      subPrincipleId: sp?.id,
      severity: 2,
      evidence: "Sin señales de alarma — consolidación de estructuras ofensivas",
      metric: {},
    });
  }

  // ---------- 3) Prescripción: mejor tarea por hallazgo ----------
  type Prescription = {
    taskId: string;
    issueIndex: number;
    durationMin: number;
    rationale: string;
  };
  const prescriptions: Prescription[] = [];

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i];
    if (!draft.subPrincipleId) continue;
    const link = await db.taskSubPrinciple.findFirst({
      where: { subPrincipleId: draft.subPrincipleId },
      orderBy: [{ relevance: "desc" }],
      include: { task: true },
    });
    if (!link) continue;
    const intensityFit =
      (pulse?.fatigueScore ?? 5) >= 7 ? "Ajustamos la intensidad a la fatiga del grupo." : "";
    prescriptions.push({
      taskId: link.task.id,
      issueIndex: i,
      durationMin: Math.min(link.task.durationMin, draft.kind === "PHYSICAL" ? 40 : 60),
      rationale: `Entra por: ${draft.evidence}. ${link.usageNote ?? ""} ${intensityFit}`.trim(),
    });
  }

  // Tareas de apoyo (regeneración MD+1 y activación MD-1) desde la biblioteca global
  const recoveryTask = await db.task.findFirst({
    where: { intensity: "LOW", phases: { has: "OFFENSIVE" } },
    orderBy: { createdAt: "asc" },
  });
  const activationTask = await db.task.findFirst({
    where: { intensity: { in: ["LOW", "MEDIUM"] }, phases: { has: "OFFENSIVE" } },
    orderBy: { createdAt: "desc" },
  });

  // ---------- 4) Construcción del microciclo ----------
  const tacticalDrafts = drafts.filter((d) => d.kind === "TACTICAL");
  const day = (offset: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + offset);
    return d;
  };

  const directives = tacticalDrafts.length
    ? tacticalDrafts.map((d) => `Corregir: ${d.evidence}`)
    : ["Consolidar la identidad de juego de la semana"];

  const summary = [
    `Último partido: ${last ? `${last.isHome ? "casa" : "fuera"} vs ${last.opponent} (${last.goalsFor ?? 0}-${last.goalsAgainst ?? 0})` : "sin datos"}.`,
    pulse ? `Vestuario: ánimo ${pulse.moraleScore}/10 · fatiga ${pulse.fatigueScore}/10.` : "",
    `${availablePlayers} jugadores disponibles.`,
    `Prioridad de la semana: ${directives[0]}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const mainIssues = prescriptions
    .map((p) => ({ ...drafts[p.issueIndex], index: p.issueIndex }))
    .filter((d) => d.kind === "TACTICAL");

  const microcycle = await db.microcycle.create({
    data: {
      clubId: team.clubId,
      teamId: team.id,
      weekStart,
      status: "PROPOSED",
      tacticalDirectives: directives,
      methodologicalApproach: "Analítico-inductivo por proximidad, progresión a tareas globales",
      diagnosisSummary: summary,
      engineVersion: "v0.1-heuristic",
      analyzedMatches: {
        create: recentMatches.map((m) => ({ matchId: m.id })),
      },
      issues: {
        create: drafts.map((d) => ({
          subPrincipleId: d.subPrincipleId,
          phase: d.phase,
          kind: d.kind,
          severity: d.severity,
          evidence: d.evidence,
          metric: d.metric as never,
        })),
      },
      sessions: {
        create: [
          // MD+1 — Regeneración
          {
            date: day(1),
            label: "MD+1",
            objective: "Regeneración y asimilación del esfuerzo del partido",
            durationMin: 50,
            tasks: {
              create: recoveryTask
                ? [
                    {
                      order: 1,
                      taskId: recoveryTask.id,
                      durationMin: 40,
                      rationale: (pulse?.fatigueScore ?? 5) >= 7
                        ? "Fatiga alta: intensidad controlada para recuperar al grupo."
                        : "Volumen bajo para asimilar el partido y mantener toque de balón.",
                    },
                  ]
                : [],
            },
          },
          // MD-3 — Sesión principal (táctica)
          {
            date: day(2),
            label: "MD-3",
            objective: mainIssues[0]?.evidence ?? "Trabajo táctico principal",
            durationMin: 80,
            tasks: {
              create: prescriptions
                .filter((p) => drafts[p.issueIndex].kind === "TACTICAL")
                .slice(0, 2)
                .map((p, idx) => ({
                  order: idx + 1,
                  taskId: p.taskId,
                  durationMin: p.durationMin,
                  rationale: p.rationale,
                })),
            },
          },
          // MD-2 — Activación parcial
          {
            date: day(3),
            label: "MD-2",
            objective: "Consolidación + preparación del plan de partido",
            durationMin: 70,
            tasks: {
              create: prescriptions
                .filter((p) => drafts[p.issueIndex].kind === "TACTICAL")
                .slice(1, 2)
                .map((p) => ({
                  order: 1,
                  taskId: p.taskId,
                  durationMin: p.durationMin,
                  rationale: p.rationale,
                })),
            },
          },
          // MD-1 — Activación pre-partido
          {
            date: day(4),
            label: "MD-1",
            objective: "Activación pre-partido: velocidad y automatismos",
            durationMin: 45,
            tasks: {
              create: activationTask
                ? [
                    {
                      order: 1,
                      taskId: activationTask.id,
                      durationMin: 35,
                      rationale: "Activación neuromuscular previa al partido.",
                    },
                  ]
                : [],
            },
          },
        ],
      },
    },
    include: { issues: true, sessions: { include: { tasks: true } } },
  });

  // ---------- 5) Vincular issueId a las tareas principales (trazabilidad) ----------
  const tacticalIssueRows = microcycle.issues.filter((i) => i.kind === "TACTICAL");
  const mainSession = microcycle.sessions.find((s) => s.label === "MD-3");
  if (mainSession && tacticalIssueRows.length > 0) {
    const mainTasks = [...mainSession.tasks].sort((a, b) => a.order - b.order);
    for (let i = 0; i < Math.min(mainTasks.length, tacticalIssueRows.length); i++) {
      await db.sessionTask.update({
        where: { id: mainTasks[i].id },
        data: { prescribedIssueId: tacticalIssueRows[i].id },
      });
    }
  }

  revalidatePath("/dashboard/today");
  revalidatePath("/");
  return { ok: true, created: true, microcycleId: microcycle.id };
}
