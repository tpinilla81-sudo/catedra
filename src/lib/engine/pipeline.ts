// ============================================================================
// MOTOR PRESCRIPTIVO v0.2 — Pipeline completo: diagnóstico → receta → plan
// ----------------------------------------------------------------------------
// Cierra el Pilar 4 end-to-end. Sobre el diagnóstico heurístico de
// `diagnose.ts`, este módulo añade:
//   1. RANKING DE CANDIDATAS: por cada hallazgo evalúa TODAS las tareas
//      conectadas en la receta (TaskSubPrinciple), ordenadas por relevancia.
//   2. FACTIBILIDAD: descarta tareas inviables (jugadores disponibles
//      insuficientes, intensidad alta contraindicada por fatiga grupal).
//   3. AUDITORÍA TOTAL: cada ejecución persiste un EngineRun con las entradas,
//      los hallazgos, las tareas elegidas (con rationale) y las descartadas
//      (con motivo) — trazabilidad "por qué este plan" de punta a punta.
//   4. RE-PRESCRIPCIÓN EN VIVO: cuando llega evidencia nueva (ingesta) a un
//      microciclo aún PROPOSED, regenera diagnóstico Y tareas de las sesiones
//      principales (MD-3 / MD-2), respetando los planes ya aceptados.
//
// Consumidores:
//   • today/actions.ts   → ensureWeeklyProposal (vista Hoy, lunes)
//   • match/actions.ts   → submitMatchReport (hook de ingesta)
//   • scripts/validate-pilar4.ts (validación E2E)
// ============================================================================
import { addDays, subDays } from "date-fns";
import { Prisma, type GamePhase, type PrismaClient } from "@prisma/client";
import {
  buildIssueDrafts,
  collectInputs,
  mondayOf,
  type IssueDraft,
} from "./diagnose";

// ---------- Tipos de dominio ----------

/** Tarea elegida por el motor para un hallazgo (auditoría + rationale) */
export type PrescriptionAudit = {
  issueEvidence: string;
  issueKind: IssueDraft["kind"];
  subPrincipleId: string | null;
  taskId: string;
  taskTitle: string;
  relevance: number | null;
  sessionLabel: string;
  durationMin: number;
  rationale: string;
};

/** Candidata evaluada y descartada, con el motivo legible */
export type DiscardedCandidate = {
  taskId: string;
  taskTitle: string;
  relevance: number | null;
  reason: string;
};

/** Delegados Prisma que consumen el diagnóstico y la prescripción (compatibles con el Tenant Guard) */
export type PipelineDb = Pick<
  PrismaClient,
  | "teamPulse"
  | "match"
  | "subPrinciple"
  | "microcycle"
  | "diagnosisIssue"
  | "taskSubPrinciple"
  | "task"
  | "player"
  | "sessionTask"
  | "session"
  | "engineRun"
>;

/**
 * Orquestador del pipeline: PipelineDb + $transaction. El TransactionClient
 * que recibe el callback cumple PipelineDb (los helpers no abren tx propias).
 */
export type PipelineRunnerDb = PipelineDb & Pick<PrismaClient, "$transaction">;

export const ENGINE_VERSION = "v0.2-prescriptive";

/**
 * El pipeline completo corre en UNA transacción interactiva: diagnóstico,
 * prescripción, microciclo, trazabilidad y EngineRun se escriben todos o
 * ninguno (sin estados intermedios si algo falla a mitad de cocina).
 */
const TX_OPTS = { timeout: 20_000, maxWait: 10_000 } as const;

const INTENSITY_ORDER: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

// ============================================================================
// 1) RANKING DE CANDIDATAS (receta ponderada de la Biblioteca)
// ============================================================================

/**
 * Devuelve todas las tareas conectadas a un subprincipio por la receta,
 * ordenadas por: relevancia (3 "Núcleo" primero) → intensidad suave antes que
 * alta → título (determinismo).
 */
export async function rankTaskCandidates(
  db: PipelineDb,
  subPrincipleId: string,
): Promise<
  Array<{
    taskId: string;
    taskTitle: string;
    relevance: number;
    intensity: string;
    playersMin: number;
    playersMax: number | null;
    durationMin: number;
    usageNote: string | null;
  }>
> {
  const links = await db.taskSubPrinciple.findMany({
    where: { subPrincipleId },
    include: { task: { select: { id: true, title: true, intensity: true, playersMin: true, playersMax: true, durationMin: true } } },
  });
  return links
    .map((l) => ({
      taskId: l.task.id,
      taskTitle: l.task.title,
      relevance: l.relevance,
      intensity: l.task.intensity as string,
      playersMin: l.task.playersMin,
      playersMax: l.task.playersMax,
      durationMin: l.task.durationMin,
      usageNote: l.usageNote,
    }))
    .sort(
      (a, b) =>
        b.relevance - a.relevance ||
        (INTENSITY_ORDER[a.intensity] ?? 1) - (INTENSITY_ORDER[b.intensity] ?? 1) ||
        a.taskTitle.localeCompare(b.taskTitle),
    );
}

// ============================================================================
// 2) PRESCRIPCIÓN CON FACTIBILIDAD — elegida + descartadas con motivo
// ============================================================================

type CandidateRow = {
  taskId: string;
  taskTitle: string;
  relevance: number;
  intensity: string;
  playersMin: number;
  playersMax: number | null;
  durationMin: number;
  usageNote: string | null;
};

/**
 * Recorre las candidatas en orden de ranking y devuelve el índice de la
 * primera FACTIBLE. Las inviables se auditan en `sink` (sin duplicados):
 *   • fatiga ≥ 7 + intensidad HIGH → contraindicada (cruce con el Pilar 2)
 *   • playersMin > disponibles     → inviable con la plantilla de hoy
 */
function feasibilityScan(
  candidates: CandidateRow[],
  opts: { availablePlayers: number; fatigueScore: number },
  sink: DiscardedCandidate[],
  seen: Set<string>,
): number {
  for (let c = 0; c < candidates.length; c++) {
    const cand = candidates[c];
    let reason: string | null = null;
    if (opts.fatigueScore >= 7 && cand.intensity === "HIGH") {
      reason = `Intensidad alta contraindicada con fatiga grupal ${opts.fatigueScore}/10`;
    } else if (cand.playersMin > opts.availablePlayers) {
      reason = `Necesita ${cand.playersMin} jugadores y solo hay ${opts.availablePlayers} disponibles`;
    }
    if (!reason) return c;
    const key = `${cand.taskId}|${reason}`;
    if (!seen.has(key)) {
      seen.add(key);
      sink.push({
        taskId: cand.taskId,
        taskTitle: cand.taskTitle,
        relevance: cand.relevance,
        reason,
      });
    }
  }
  return -1;
}

/** Orden canónico de la receta: relevancia → intensidad → título */
function sortCandidates(list: CandidateRow[]): CandidateRow[] {
  return list.sort(
    (a, b) =>
      b.relevance - a.relevance ||
      (INTENSITY_ORDER[a.intensity] ?? 1) - (INTENSITY_ORDER[b.intensity] ?? 1) ||
      a.taskTitle.localeCompare(b.taskTitle),
  );
}

/**
 * Candidatas de TODO el pool de la fase (todos los subprincipios visibles de
 * esa fase, sin duplicar tareas). Es la red de seguridad del fallback: si el
 * subprincipio exacto no tiene tarea factible, la fase sí puede tenerla.
 */
async function rankPhaseCandidates(
  db: PipelineDb,
  phase: string,
): Promise<CandidateRow[]> {
  const sps = await db.subPrinciple.findMany({
    where: { phase: phase as GamePhase },
    select: { id: true },
    // Determinismo: mismo pool de subprincipios en cada ejecución
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (sps.length === 0) return [];
  const links = await db.taskSubPrinciple.findMany({
    where: { subPrincipleId: { in: sps.map((s) => s.id) } },
    // Determinismo del dedupe por tarea (a igual relevancia gana el primero)
    orderBy: [{ relevance: "desc" }, { id: "asc" }],
    include: {
      task: {
        select: { id: true, title: true, intensity: true, playersMin: true, playersMax: true, durationMin: true },
      },
    },
  });
  const byTask = new Map<string, CandidateRow>();
  for (const l of links) {
    const prev = byTask.get(l.task.id);
    if (!prev || l.relevance > prev.relevance) {
      byTask.set(l.task.id, {
        taskId: l.task.id,
        taskTitle: l.task.title,
        relevance: l.relevance,
        intensity: l.task.intensity as string,
        playersMin: l.task.playersMin,
        playersMax: l.task.playersMax,
        durationMin: l.task.durationMin,
        usageNote: l.usageNote,
      });
    }
  }
  return sortCandidates([...byTask.values()]);
}

/**
 * Por cada hallazgo con subprincipio asociado, recorre la receta en orden de
 * ranking y elige la primera tarea FACTIBLE. Si el subprincipio exacto se
 * queda sin candidatas viables, amplía a la mejor tarea de la FASE completa
 * (receta ampliada, auditable). El resto se audita como descartadas.
 */
export async function prescribeForIssues(
  db: PipelineDb,
  drafts: IssueDraft[],
  opts: { availablePlayers: number; fatigueScore: number },
): Promise<{
  prescriptions: Array<{
    issueIndex: number;
    taskId: string;
    taskTitle: string;
    relevance: number;
    usageNote: string | null;
    durationMin: number;
    rationale: string;
  }>;
  discarded: DiscardedCandidate[];
}> {
  const prescriptions: Array<{
    issueIndex: number;
    taskId: string;
    taskTitle: string;
    relevance: number;
    usageNote: string | null;
    durationMin: number;
    rationale: string;
  }> = [];
  const discarded: DiscardedCandidate[] = [];
  const seen = new Set<string>();
  const { availablePlayers, fatigueScore } = opts;

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i];
    if (!draft.subPrincipleId) continue;

    let candidates = await rankTaskCandidates(db, draft.subPrincipleId);
    let chosenIndex = feasibilityScan(candidates, opts, discarded, seen);
    let fallbackNote = "";

    // Fallback por fase: ningún subprincipio exacto tenía candidata factible
    if (chosenIndex === -1 && draft.phase) {
      const phaseCandidates = await rankPhaseCandidates(db, draft.phase);
      chosenIndex = feasibilityScan(phaseCandidates, opts, discarded, seen);
      if (chosenIndex !== -1) {
        candidates = phaseCandidates;
        fallbackNote = " Receta ampliada a la fase: el subprincipio exacto no tenía tarea factible.";
      }
    }

    if (chosenIndex === -1) continue;

    const chosen = candidates[chosenIndex];
    // El resto de candidatas (detrás de la elegida) quedan auditadas
    for (let c = chosenIndex + 1; c < candidates.length; c++) {
      const cand = candidates[c];
      const reason =
        cand.relevance < chosen.relevance
          ? `Relevancia menor en la receta (${cand.relevance} vs ${chosen.relevance})`
          : "Priorizada otra candidata de mayor afinidad";
      const key = `${cand.taskId}|${reason}`;
      if (!seen.has(key)) {
        seen.add(key);
        discarded.push({
          taskId: cand.taskId,
          taskTitle: cand.taskTitle,
          relevance: cand.relevance,
          reason,
        });
      }
    }

    const intensityFit =
      fatigueScore >= 7
        ? "Intensidad ajustada a la fatiga del grupo."
        : "";
    prescriptions.push({
      issueIndex: i,
      taskId: chosen.taskId,
      taskTitle: chosen.taskTitle,
      relevance: chosen.relevance,
      usageNote: chosen.usageNote,
      durationMin: Math.min(chosen.durationMin, draft.kind === "PHYSICAL" ? 40 : 60),
      rationale: `Entra por: ${draft.evidence}. ${chosen.usageNote ?? ""} ${intensityFit}${fallbackNote}`.trim(),
    });
  }

  return { prescriptions, discarded };
}

// ============================================================================
// 3) AUDITORÍA — persistencia del EngineRun de cada ejecución
// ============================================================================

async function recordEngineRun(
  db: PipelineDb,
  args: {
    clubId: string;
    teamId: string;
    microcycleId: string | null;
    trigger: "WEEKLY_PROPOSAL" | "EVIDENCE_REFRESH";
    t0: number;
    inputs: { pulse: { moraleScore: number; fatigueScore: number } | null; matches: Array<{ opponent: string; score: string; events: number }>; availablePlayers: number; weekStart: string };
    drafts: IssueDraft[];
    prescriptions: PrescriptionAudit[];
    discarded: DiscardedCandidate[];
  },
): Promise<string> {
  const run = await db.engineRun.create({
    data: {
      clubId: args.clubId,
      teamId: args.teamId,
      microcycleId: args.microcycleId,
      version: ENGINE_VERSION,
      trigger: args.trigger,
      inputSnapshot: args.inputs as never,
      issuesJson: args.drafts.map((d) => ({
        kind: d.kind,
        phase: d.phase ?? null,
        subPrincipleId: d.subPrincipleId ?? null,
        severity: d.severity,
        evidence: d.evidence,
      })) as never,
      prescriptions: args.prescriptions as never,
      discarded: args.discarded as never,
      durationMs: Date.now() - args.t0,
    },
    select: { id: true },
  });
  return run.id;
}

// ============================================================================
// 4) PIPELINE SEMANAL COMPLETO — genera la propuesta con auditoría
// ============================================================================

export type ProposalResult = {
  created: boolean;
  microcycleId: string | null;
  runId: string | null;
  issuesCount: number;
  prescriptions: PrescriptionAudit[];
  discarded: DiscardedCandidate[];
  durationMs: number | null;
};

/**
 * Cocina el microciclo PROPOSED de `weekStart` desde los datos reales y
 * persiste la auditoría completa en EngineRun. Si ya existe un microciclo
 * para esa semana devuelve `created: false` sin tocar nada.
 *
 * TODO el pipeline corre en UNA transacción interactiva: si otro request
 * concurrente cocina la misma semana (carrera TOCTOU), la constraint única
 * (teamId, weekStart) lanza P2002 → la transacción perdedora se revierte
 * entera y se devuelve `created: false` sin error 500 al usuario.
 */
export async function runWeeklyProposalPipeline(
  db: PipelineRunnerDb,
  args: { clubId: string; teamId: string; weekStart: Date },
): Promise<ProposalResult> {
  const t0 = Date.now();
  const { clubId, teamId, weekStart } = args;

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.microcycle.findUnique({
        where: { teamId_weekStart: { teamId, weekStart } },
        select: { id: true },
      });
      if (existing) {
        return {
          created: false,
          microcycleId: existing.id,
          runId: null,
          issuesCount: 0,
          prescriptions: [],
          discarded: [],
          durationMs: null,
        };
      }

      // ---------- 1) Entradas ----------
      const inputs = await collectInputs(tx, teamId, weekStart);
      const pulse = inputs.pulse;
      const recentMatches = inputs.matches;

      const availablePlayers = await tx.player.count({
        where: { teamId, isActive: true, status: { in: ["AVAILABLE", "RETURNING"] } },
      });

      // ---------- 2) Diagnóstico (heurística compartida) ----------
      const drafts = await buildIssueDrafts(tx, teamId, inputs);
      const last = recentMatches[0];

      // ---------- 3) Prescripción con ranking + factibilidad ----------
      const { prescriptions: rawRx, discarded } = await prescribeForIssues(tx, drafts, {
        availablePlayers,
        fatigueScore: pulse?.fatigueScore ?? 5,
      });

      const auditRx: PrescriptionAudit[] = rawRx.map((p) => ({
        issueEvidence: drafts[p.issueIndex].evidence,
        issueKind: drafts[p.issueIndex].kind,
        subPrincipleId: drafts[p.issueIndex].subPrincipleId ?? null,
        taskId: p.taskId,
        taskTitle: p.taskTitle,
        relevance: p.relevance,
        sessionLabel: "",
        durationMin: p.durationMin,
        rationale: p.rationale,
      }));

      // ---------- 4) Tareas de apoyo (MD+1 / MD-1) ----------
      const recoveryTask = await tx.task.findFirst({
        where: { intensity: "LOW", phases: { has: "OFFENSIVE" } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, title: true },
      });
      const activationTask = await tx.task.findFirst({
        where: { intensity: { in: ["LOW", "MEDIUM"] }, phases: { has: "OFFENSIVE" } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, title: true },
      });

      // ---------- 5) Construcción del microciclo ----------
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

      const tacticalRx = rawRx.filter((p) => drafts[p.issueIndex].kind === "TACTICAL");

      const microcycle = await tx.microcycle.create({
        data: {
          clubId,
          teamId,
          weekStart,
          status: "PROPOSED",
          tacticalDirectives: directives,
          methodologicalApproach: "Analítico-inductivo por proximidad, progresión a tareas globales",
          diagnosisSummary: summary,
          engineVersion: ENGINE_VERSION,
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
                          rationale:
                            (pulse?.fatigueScore ?? 5) >= 7
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
                objective: tacticalDrafts[0]?.evidence ?? "Trabajo táctico principal",
                durationMin: 80,
                tasks: {
                  create: tacticalRx.slice(0, 2).map((p, idx) => ({
                    order: idx + 1,
                    taskId: p.taskId,
                    durationMin: p.durationMin,
                    rationale: p.rationale,
                  })),
                },
              },
              // MD-2 — Consolidación
              {
                date: day(3),
                label: "MD-2",
                objective: "Consolidación + preparación del plan de partido",
                durationMin: 70,
                tasks: {
                  create: tacticalRx.slice(1, 2).map((p) => ({
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

      // ---------- 6) Trazabilidad hallazgo → tarea (prescribedIssueId) ----------
      // La primera prescripción táctica entra en MD-3; la segunda aparece en MD-3
      // (profundizar) Y en MD-2 (consolidar). Se enlaza el hallazgo en AMBAS.
      const evidenceToIssue = new Map(microcycle.issues.map((iss) => [iss.evidence, iss.id]));
      const md3 = microcycle.sessions.find((s) => s.label === "MD-3");
      const md2 = microcycle.sessions.find((s) => s.label === "MD-2");
      const sessionByLabel = { "MD-3": md3, "MD-2": md2 } as Record<string, typeof md3>;

      for (const label of ["MD-3", "MD-2"] as const) {
        const session = sessionByLabel[label];
        if (!session) continue;
        const forSession = label === "MD-3" ? tacticalRx.slice(0, 2) : tacticalRx.slice(1, 2);
        for (const p of forSession) {
          const draft = drafts[p.issueIndex];
          const issueId = evidenceToIssue.get(draft.evidence);
          const st = session.tasks.find(
            (t) => t.taskId === p.taskId && t.rationale === p.rationale,
          );
          if (!st) continue;
          await tx.sessionTask.update({
            where: { id: st.id },
            data: { prescribedIssueId: issueId },
          });
          const audit = auditRx.find(
            (a) => a.taskId === p.taskId && a.issueEvidence === draft.evidence,
          );
          if (audit && !audit.sessionLabel) audit.sessionLabel = label;
        }
      }

      // ---------- 7) Auditoría de la ejecución ----------
      const inputSnapshot = {
        weekStart: weekStart.toISOString().slice(0, 10),
        pulse: pulse ? { moraleScore: pulse.moraleScore, fatigueScore: pulse.fatigueScore } : null,
        matches: recentMatches.map((m) => ({
          opponent: m.opponent,
          score: `${m.goalsFor ?? 0}-${m.goalsAgainst ?? 0}`,
          events: m.report?.events.length ?? 0,
        })),
        availablePlayers,
      };
      const runId = await recordEngineRun(tx, {
        clubId,
        teamId,
        microcycleId: microcycle.id,
        trigger: "WEEKLY_PROPOSAL",
        t0,
        inputs: inputSnapshot,
        drafts,
        prescriptions: auditRx,
        discarded,
      });

      return {
        created: true,
        microcycleId: microcycle.id,
        runId,
        issuesCount: drafts.length,
        prescriptions: auditRx,
        discarded,
        durationMs: Date.now() - t0,
      };
    }, TX_OPTS);
  } catch (e) {
    // Carrera TOCTOU: otro request cocinó la misma semana a la vez. La tx
    // perdedora se revierte ENTERA (sin microciclo ni EngineRun parcial) y se
    // responde created:false — nunca un 500 sin capturar al usuario.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await db.microcycle.findUnique({
        where: { teamId_weekStart: { teamId, weekStart } },
        select: { id: true },
      });
      return {
        created: false,
        microcycleId: existing?.id ?? null,
        runId: null,
        issuesCount: 0,
        prescriptions: [],
        discarded: [],
        durationMs: null,
      };
    }
    throw e;
  }
}

// ============================================================================
// 5) RE-PRESCRIPCIÓN EN VIVO — evidencia nueva → propuesta PROPOSED actualizada
// ============================================================================

export type RefreshResult = {
  refreshedWeeks: string[];
  evidences: string[];
  runs: number;
};

/**
 * Hook de conexión (Pilar 3 → Pilar 4). Se ejecuta al guardar una ingesta.
 * Para cada microciclo aún PROPOSED de la semana del partido o la siguiente:
 *   1. Regenera el diagnóstico (issues + directrices + resumen).
 *   2. RE-PRESCRIBE las tareas de las sesiones principales (MD-3 / MD-2)
 *      con la receta fresca y la factibilidad de hoy.
 *   3. Persiste un EngineRun (trigger EVIDENCE_REFRESH) con toda la auditoría.
 * Los planes ACCEPTED/ADJUSTED se respetan: nunca se tocan.
 *
 * Cada semana se procesa en SU propia transacción: diagnóstico, tareas y
 * auditoría de esa semana se escriben todos o ninguno.
 */
export async function refreshProposalEvidence(
  db: PipelineRunnerDb,
  args: { clubId: string; teamId: string; kickoffAt: Date },
): Promise<RefreshResult> {
  const { clubId, teamId, kickoffAt } = args;
  const base = mondayOf(kickoffAt);
  const candidates = [base, addDays(base, 7)]; // misma semana y semana siguiente
  const refreshedWeeks: string[] = [];
  const evidences: string[] = [];
  let runs = 0;

  for (const weekStart of candidates) {
    const touched = await db.$transaction(async (tx) => {
      const t0 = Date.now();
      const cycle = await tx.microcycle.findUnique({
        where: { teamId_weekStart: { teamId, weekStart } },
        include: { sessions: { include: { tasks: true } } },
      });
      // Solo tocamos propuestas NO validadas por el cuerpo técnico
      if (!cycle || cycle.status !== "PROPOSED") return false;

      const inputs = await collectInputs(tx, teamId, weekStart);
      const pulse = inputs.pulse;
      const drafts = await buildIssueDrafts(tx, teamId, inputs);

      const availablePlayers = await tx.player.count({
        where: { teamId, isActive: true, status: { in: ["AVAILABLE", "RETURNING"] } },
      });

      // 1) Diagnóstico regenerado
      await tx.diagnosisIssue.deleteMany({
        where: { microcycleId: cycle.id, status: "OPEN" },
      });
      await tx.diagnosisIssue.createMany({
        data: drafts.map((d) => ({
          microcycleId: cycle.id,
          subPrincipleId: d.subPrincipleId,
          phase: d.phase,
          kind: d.kind,
          severity: d.severity,
          evidence: d.evidence,
          metric: d.metric as never,
        })),
      });

      // 2) Re-prescripción con ranking + factibilidad
      const { prescriptions: rawRx, discarded } = await prescribeForIssues(tx, drafts, {
        availablePlayers,
        fatigueScore: pulse?.fatigueScore ?? 5,
      });
      const tacticalRx = rawRx.filter((p) => drafts[p.issueIndex].kind === "TACTICAL");

      // Reemplaza las tareas de MD-3 / MD-2 con la prescripción fresca
      const issueRows = await tx.diagnosisIssue.findMany({
        where: { microcycleId: cycle.id, status: "OPEN" },
        select: { id: true, evidence: true },
        // Determinismo: mapeo estable evidencia → hallazgo
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const evidenceToIssue = new Map(issueRows.map((r) => [r.evidence, r.id]));
      const auditRx: PrescriptionAudit[] = [];

      for (const label of ["MD-3", "MD-2"] as const) {
        const session = cycle.sessions.find((s) => s.label === label);
        if (!session) continue;
        await tx.sessionTask.deleteMany({ where: { sessionId: session.id } });

        const forSession = label === "MD-3" ? tacticalRx.slice(0, 2) : tacticalRx.slice(1, 2);
        for (let idx = 0; idx < forSession.length; idx++) {
          const p = forSession[idx];
          const draft = drafts[p.issueIndex];
          const issueId = evidenceToIssue.get(draft.evidence) ?? null;
          await tx.sessionTask.create({
            data: {
              sessionId: session.id,
              taskId: p.taskId,
              order: idx + 1,
              durationMin: p.durationMin,
              rationale: p.rationale,
              prescribedIssueId: issueId,
            },
          });
          auditRx.push({
            issueEvidence: draft.evidence,
            issueKind: draft.kind,
            subPrincipleId: draft.subPrincipleId ?? null,
            taskId: p.taskId,
            taskTitle: p.taskTitle,
            relevance: p.relevance,
            sessionLabel: label,
            durationMin: p.durationMin,
            rationale: p.rationale,
          });
        }
      }

      // 3) Directrices + resumen legible
      const last = inputs.matches[0];
      const directives = tacticalRx.length
        ? tacticalRx.map((p) => `Corregir: ${drafts[p.issueIndex].evidence}`)
        : ["Consolidar la identidad de juego de la semana"];
      await tx.microcycle.update({
        where: { id: cycle.id },
        data: {
          tacticalDirectives: directives,
          diagnosisSummary: [
            `Último partido: ${last ? `${last.isHome ? "casa" : "fuera"} vs ${last.opponent} (${last.goalsFor ?? 0}-${last.goalsAgainst ?? 0})` : "sin datos"}.`,
            pulse ? `Vestuario: ánimo ${pulse.moraleScore}/10 · fatiga ${pulse.fatigueScore}/10.` : "",
            `Prioridad de la semana: ${directives[0]}.`,
          ]
            .filter(Boolean)
            .join(" "),
          engineVersion: ENGINE_VERSION,
        },
      });

      // 4) Auditoría EVIDENCE_REFRESH
      await recordEngineRun(tx, {
        clubId,
        teamId,
        microcycleId: cycle.id,
        trigger: "EVIDENCE_REFRESH",
        t0,
        inputs: {
          weekStart: weekStart.toISOString().slice(0, 10),
          pulse: pulse ? { moraleScore: pulse.moraleScore, fatigueScore: pulse.fatigueScore } : null,
          matches: inputs.matches.map((m) => ({
            opponent: m.opponent,
            score: `${m.goalsFor ?? 0}-${m.goalsAgainst ?? 0}`,
            events: m.report?.events.length ?? 0,
          })),
          availablePlayers,
        },
        drafts,
        prescriptions: auditRx,
        discarded,
      });

      refreshedWeeks.push(weekStart.toISOString().slice(0, 10));
      for (const d of drafts.slice(0, 3)) evidences.push(d.evidence);
      return true;
    }, TX_OPTS);

    if (touched) runs++;
  }

  return { refreshedWeeks, evidences, runs };
}

/** Semana ISO (lunes) — re-export para consumidores del pipeline */
export { mondayOf };
export { subDays };
