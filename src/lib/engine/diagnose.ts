// ============================================================================
// MOTOR PRESCRIPTIVO — Cerebro de diagnóstico compartido (v0.1-heurístico)
// ----------------------------------------------------------------------------
// Fuente ÚNICA de verdad de las heurísticas. La usan:
//   • ensureWeeklyProposal (vista "Hoy") — genera el microciclo del lunes.
//   • submitMatchReport  (ingesta exprés) — refresca propuestas PROPOSED en
//     cuanto se guardan datos nuevos, para que la propuesta del lunes
//     siguiente refleje EXACTAMENTE lo ocurrido en el campo.
//
// Cadena: TacticalEvent + TeamPulse + Player → IssueDraft[] → DiagnosisIssue
// ============================================================================
import { addDays, startOfWeek, subDays } from "date-fns";
import type { Match, TeamPulse } from "@prisma/client";

type EventLike = { type: string; x: number };

type MatchWithReport = Match & { report: { events: EventLike[] } | null };

export type IssueDraft = {
  kind: "TACTICAL" | "PHYSICAL" | "MORALE";
  phase?: "OFFENSIVE" | "DEFENSIVE" | "OFF_TRANSITION" | "DEF_TRANSITION" | "SET_PIECE";
  subPrincipleId?: string;
  severity: number;
  evidence: string;
  metric: Record<string, unknown>;
};

type DiagnoseDb = {
  teamPulse: {
    findFirst: (args: Record<string, unknown>) => Promise<TeamPulse | null>;
  };
  match: {
    findMany: (args: Record<string, unknown>) => Promise<MatchWithReport[]>;
  };
  subPrinciple: {
    findFirst: (args: Record<string, unknown>) => Promise<{ id: string } | null>;
  };
};

export type EngineInputs = {
  pulse: TeamPulse | null;
  matches: MatchWithReport[];
};

/** Semana ISO (lunes) de una fecha */
export function mondayOf(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1 });
}

/**
 * Recoge las entradas del motor para la semana que empieza en `weekStart`:
 * último pulso colectivo + partidos con ingesta de la ventana (weekStart-8d).
 */
export async function collectInputs(
  db: DiagnoseDb,
  teamId: string,
  weekStart: Date,
): Promise<EngineInputs> {
  const pulse = await db.teamPulse.findFirst({
    where: { teamId },
    orderBy: { date: "desc" },
  });

  const windowStart = subDays(weekStart, 8);
  const matches = await db.match.findMany({
    where: {
      teamId,
      status: { in: ["PLAYED", "ANALYZED"] },
      kickoffAt: { gte: windowStart },
    },
    orderBy: { kickoffAt: "desc" },
    take: 2,
    include: { report: { include: { events: true } } },
  });

  return { pulse, matches };
}

/**
 * Heurística de diagnóstico v0.1:
 *  • Fatiga ≥ 7/10            → hallazgo FÍSICO (controlar carga).
 *  • Ánimo ≤ 4/10             → hallazgo ANÍMICO (éxito temprano).
 *  • ≥ 6 pérdidas en 1/3 propio → hallazgo TÁCTICO (reacción tras pérdida).
 *  • ≥ 6 duelos perdidos      → hallazgo TÁCTICO (intensidad defensiva).
 *  • Sin señales              → consolidación ofensiva (cero pantallas en blanco).
 */
export async function buildIssueDrafts(
  db: DiagnoseDb,
  _teamId: string,
  inputs: EngineInputs,
): Promise<IssueDraft[]> {
  const { pulse, matches } = inputs;
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

  const last = matches[0];
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
    const negDuels = last.report.events.filter(
      (e) => e.type === "NEGATIVE_DUEL",
    ).length;
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

  return drafts;
}

/**
 * HOOK DE CONEXIÓN (Pilar 3 → Pilar 4):
 * Se ejecuta al guardar una ingesta. Si el microciclo de la semana del partido
 * (o el de la semana siguiente) aún está PROPOSED —no aceptado por el míster—,
 * se regenera su diagnóstico con los datos frescos para que la propuesta
 * refleje lo ocurrido en el campo. Los planes ACCEPTED/ADJUSTED se respetan.
 */
export async function refreshProposalsWithNewEvidence(
  db: DiagnoseDb & {
    microcycle: {
      findUnique: (args: Record<string, unknown>) => Promise<
        | (Record<string, unknown> & { id: string; status: string; weekStart: Date })
        | null
      >;
      update: (args: Record<string, unknown>) => Promise<unknown>;
    };
    diagnosisIssue: {
      deleteMany: (args: Record<string, unknown>) => Promise<unknown>;
      createMany: (args: Record<string, unknown>) => Promise<unknown>;
    };
  },
  teamId: string,
  kickoffAt: Date,
): Promise<{ refreshedWeeks: string[]; evidences: string[] }> {
  const base = mondayOf(kickoffAt);
  const candidates = [base, addDays(base, 7)]; // misma semana y semana siguiente
  const refreshedWeeks: string[] = [];
  const evidences: string[] = [];

  for (const weekStart of candidates) {
    const cycle = await db.microcycle.findUnique({
      where: { teamId_weekStart: { teamId, weekStart } },
    });
    // Solo tocamos propuestas NO validadas por el cuerpo técnico
    if (!cycle || cycle.status !== "PROPOSED") continue;

    const inputs = await collectInputs(db, teamId, weekStart);
    const drafts = await buildIssueDrafts(db, teamId, inputs);

    await db.diagnosisIssue.deleteMany({
      where: { microcycleId: cycle.id, status: "OPEN" },
    });
    await db.diagnosisIssue.createMany({
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

    const last = inputs.matches[0];
    const directives = drafts
      .filter((d) => d.kind === "TACTICAL")
      .map((d) => `Corregir: ${d.evidence}`);
    await db.microcycle.update({
      where: { id: cycle.id },
      data: {
        tacticalDirectives: directives.length
          ? directives
          : ["Consolidar la identidad de juego de la semana"],
        diagnosisSummary: [
          `Último partido: ${last ? `${last.isHome ? "casa" : "fuera"} vs ${last.opponent} (${last.goalsFor ?? 0}-${last.goalsAgainst ?? 0})` : "sin datos"}.`,
          inputs.pulse
            ? `Vestuario: ánimo ${inputs.pulse.moraleScore}/10 · fatiga ${inputs.pulse.fatigueScore}/10.`
            : "",
          `Prioridad de la semana: ${drafts[0]?.evidence ?? "consolidar estructuras"}.`,
        ]
          .filter(Boolean)
          .join(" "),
        engineVersion: "v0.1-heuristic",
      },
    });

    refreshedWeeks.push(weekStart.toISOString().slice(0, 10));
    for (const d of drafts.slice(0, 3)) evidences.push(d.evidence);
  }

  return { refreshedWeeks, evidences };
}

/**
 * Racha de resultados (cacheada en TeamPulse.resultsStreak):
 * +N = N victorias seguidas · -N = N derrotas · 0 = empates.
 * Se recalcula al guardar cada ingesta para que el Pulso esté vivo.
 */
export async function computeResultsStreak(
  db: { match: { findMany: (args: Record<string, unknown>) => Promise<Match[]> } },
  teamId: string,
): Promise<number> {
  const matches = await db.match.findMany({
    where: {
      teamId,
      status: { in: ["PLAYED", "ANALYZED"] },
      goalsFor: { not: null },
      goalsAgainst: { not: null },
    },
    orderBy: { kickoffAt: "desc" },
    take: 20,
  });
  if (matches.length === 0) return 0;

  const signOf = (m: Match) =>
    m.goalsFor! > m.goalsAgainst! ? 1 : m.goalsFor! < m.goalsAgainst! ? -1 : 0;
  const first = signOf(matches[0]);
  let streak = 0;
  for (const m of matches) {
    if (signOf(m) !== first) break;
    streak++;
  }
  return first * streak;
}
