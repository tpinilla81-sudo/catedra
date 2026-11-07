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
import { subDays } from "date-fns";
import type {
  Match,
  OpponentReport,
  OpponentTacticalEvent,
  OpponentWeakness,
  PrismaClient,
  TeamPulse,
} from "@prisma/client";
import { pulseWindowFor } from "@/lib/utils/dates";
// Semana ISO decidida por el calendario de Madrid (fuente única: utils/dates).
// Re-exportado aquí para no romper a los consumidores históricos
// (pipeline, today/actions, match-ingest, probes y suites E2E).
export { mondayOf } from "@/lib/utils/dates";

type EventLike = { type: string; x: number };

type MatchWithReport = Match & { report: { events: EventLike[] } | null };

export type IssueDraft = {
  kind: "TACTICAL" | "PHYSICAL" | "MORALE";
  phase?: "OFFENSIVE" | "DEFENSIVE" | "OFF_TRANSITION" | "DEF_TRANSITION" | "SET_PIECE";
  subPrincipleId?: string;
  severity: number;
  evidence: string;
  metric: Record<string, unknown>;
  /** P4.1: marcador de origen — el scouting del rival usa "OPPONENT_SCOUTING" */
  source?: "OPPONENT_SCOUTING";
};

/**
 * Delegados Prisma que consume el motor. Usar Pick<> sobre PrismaClient hace
 * que el cliente real (con o sin Tenant Guard) sea asignable estructuralmente.
 */
export type DiagnoseDb = Pick<
  PrismaClient,
  "teamPulse" | "match" | "subPrinciple" | "microcycle" | "diagnosisIssue" | "opponentReport"
>;

/**
 * Informe de scouting del rival (P4.1) con sus debilidades ya ordenadas de
 * forma determinista (severity desc → id asc: la prioridad de la semana es
 * estable entre ejecuciones).
 */
export type OpponentWithWeaknesses = OpponentReport & {
  weaknesses: OpponentWeakness[];
  scoutingEvents: OpponentTacticalEvent[];
};

export type EngineInputs = {
  pulse: TeamPulse | null;
  matches: MatchWithReport[];
  /**
   * Informe del rival de la semana (P4.1). `null` = sin informe (el motor no
   * genera hallazgos de scouting); `undefined` solo en entradas históricas
   * construidas antes de P4.1 (compatibilidad con suites/probes existentes).
   */
  opponent?: OpponentWithWeaknesses | null;
};

/**
 * Recoge las entradas del motor para la semana que empieza en `weekStart`
 * (medianoche UTC del lunes-Madrid):
 *   • Pulso colectivo VIVO: solo vale si está dentro de la ventana temporal
 *     válida [weekStart−8d, weekStart+2d] (ver pulseWindowFor). Un pulso
 *     caducado (ej. hace 30 días) o inexistente NO gobierna la semana: se
 *     devuelve `pulse: null` y el motor aplica sus valores por defecto
 *     seguros — fatiga neutra 5/10 (sin contraindicar intensidad alta) y
 *     sin hallazgo anímico. El vestuario nunca se planifica con datos viejos.
 *   • Partidos con ingesta de la ventana (weekStart−8d …).
 *   • Informe de scouting del rival (P4.1) con la MISMA clave semanal que el
 *     microciclo (teamId + weekStart): si el analista lo sembró, cada
 *     debilidad se convierte en hallazgo TACTICAL de la fase correspondiente.
 */
export async function collectInputs(
  db: DiagnoseDb,
  teamId: string,
  weekStart: Date,
): Promise<EngineInputs> {
  const pulseWindow = pulseWindowFor(weekStart); // gte: weekStart−8d · lte: weekStart+2d
  const pulse = await db.teamPulse.findFirst({
    where: { teamId, date: { gte: pulseWindow.gte, lte: pulseWindow.lte } },
    orderBy: { date: "desc" },
  });

  const windowStart = subDays(weekStart, 8);
  const matches = await db.match.findMany({
    where: {
      teamId,
      status: { in: ["PLAYED", "ANALYZED"] },
      kickoffAt: { gte: windowStart },
    },
    // Determinismo: desempate estable si dos partidos comparten kickoff
    orderBy: [{ kickoffAt: "desc" }, { id: "asc" }],
    take: 2,
    include: { report: { include: { events: true } } },
  });

  const opponent = await db.opponentReport.findUnique({
    where: { teamId_weekStart: { teamId, weekStart } },
    include: {
      // Determinismo: la debilidad MÁS severa prioriza primero; a igualdad
      // de severidad decide el id (orden de creación estable de los cuids).
      weaknesses: { orderBy: [{ severity: "desc" }, { id: "asc" }] },
      scoutingEvents: { orderBy: { id: "asc" } },
    },
  });

  return { pulse, matches, opponent };
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
  const opponent = inputs.opponent ?? null;
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
      // Determinismo: a igualdad de datos, SIEMPRE el mismo subprincipio
      // (sin orderBy Postgres devuelve un orden arbitrario entre empates)
      const sp = await db.subPrinciple.findFirst({
        where: { phase: "OFF_TRANSITION" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
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
      const sp = await db.subPrinciple.findFirst({
        where: { phase: "DEFENSIVE" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
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

  // Scouting del rival (P4.1): cada debilidad del informe semanal entra como
  // hallazgo TACTICAL de SU fase (subprincipio determinista de la biblioteca,
  // mismo patrón que las heurísticas de partido). El clamp 1-5 blinda el
  // dominio de severity: un informe mal editado nunca desborda la escala.
  // La consulta ya trae las debilidades ordenadas (severity desc → id asc):
  // la prioridad de explotación es determinista, NUNCA el orden de inserción.
  if (opponent) {
    for (const w of opponent.weaknesses) {
      const sp = await db.subPrinciple.findFirst({
        where: { phase: w.phase },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      drafts.push({
        kind: "TACTICAL",
        source: "OPPONENT_SCOUTING",
        phase: w.phase,
        subPrincipleId: sp?.id,
        severity: Math.min(5, Math.max(1, w.severity)),
        evidence: `Rival ${opponent.opponentName}: ${w.description}`,
        metric: {
          source: "OPPONENT_SCOUTING",
          opponent: opponent.opponentName,
          severityReportada: w.severity,
          matchId: opponent.matchId ?? null,
          comportamientos: opponent.scoutingEvents.length,
        },
      });
    }
  }

  if (drafts.length === 0) {
    const sp = await db.subPrinciple.findFirst({
      where: { phase: "OFFENSIVE" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
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
 * Racha de resultados (cacheada en TeamPulse.resultsStreak):
 * +N = N victorias seguidas · -N = N derrotas · 0 = empates.
 * Se recalcula al guardar cada ingesta para que el Pulso esté vivo.
 */
export async function computeResultsStreak(
  db: Pick<PrismaClient, "match">,
  teamId: string,
): Promise<number> {
  const matches = await db.match.findMany({
    where: {
      teamId,
      status: { in: ["PLAYED", "ANALYZED"] },
      goalsFor: { not: null },
      goalsAgainst: { not: null },
    },
    orderBy: [{ kickoffAt: "desc" }, { id: "asc" }],
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
