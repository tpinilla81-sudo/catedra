// ============================================================================
// PILAR 3 — SUITE TÁCTICA MAESTRA /dashboard/suite
// (mock del míster 'MetodoTacticalSuiteMasterApp' · MÉTODO // TACTICAL SUITE
// MASTER V3: 4 pestañas — Directo & Vídeo · Biblioteca Taxonomía · Plantilla
// & Capacidades · Módulo A.B.P.)
// ----------------------------------------------------------------------------
// Server Component: carga la plantilla del equipo (Tenant Guard) y las fichas
// de rendimiento VIGENTES (PlayerEvaluation) para alimentar la pestaña
// Plantilla & Capacidades con las notas REALES (4 bloques × 6 métricas del
// mock). El resto de la Suite (cronómetro libre, vídeo local, libreta de
// eventos, A.B.P.) es cliente: sin escrituras en BD.
// ============================================================================
import { AppShell } from "@/components/dashboard/app-shell";
import {
  TacticalSuiteMaster,
  type SuitePlayerData,
} from "@/components/suite/tactical-suite-master";
import { requireTenantContext } from "@/lib/session";
import {
  EVAL_BLOCK_DEFAULTS,
  blockAverage,
  normalizeEvaluationData,
  type PlayerEvaluationData,
} from "@/lib/player-evaluation";
import { SUITE_CAPACITY_BLOCKS } from "@/lib/tactical-suite";

export const dynamic = "force-dynamic";

export default async function SuitePage() {
  const { db, team, user } = await requireTenantContext();

  const players = await db.player.findMany({
    where: { teamId: team.id, isActive: true },
    orderBy: [{ shirtNumber: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      shirtNumber: true,
      primaryPosition: true,
    },
  });

  // Fichas vigentes de toda la plantilla en UNA consulta (evaluación única
  // por jugador: @@unique playerId)
  const ids = players.map((p) => p.id);
  const evaluations = await db.playerEvaluation.findMany({
    where: { playerId: { in: ids } },
    select: { playerId: true, data: true },
  });
  const evalByPlayer = new Map(evaluations.map((e) => [e.playerId, e.data]));

  const data: SuitePlayerData[] = players.map((p) => {
    let parsed: PlayerEvaluationData | null = null;
    try {
      const raw = evalByPlayer.get(p.id);
      parsed = raw ? normalizeEvaluationData(raw) : null;
    } catch {
      parsed = null;
    }

    const blocks = SUITE_CAPACITY_BLOCKS.map((cap) => {
      // Labels de la FICHA REAL si existe; si no, defaults de la taxonomía
      const source =
        parsed?.find((b) => b.key === cap.key) ??
        EVAL_BLOCK_DEFAULTS.find((b) => b.key === cap.key)!;
      return {
        key: cap.key,
        title: cap.title,
        accent: cap.accent,
        headerClass: cap.headerClass,
        metrics: source.metrics.slice(0, 6).map((m) => ({
          label: m.label,
          score: parsed ? m.score : null,
        })),
        avg: parsed ? blockAverage(source) : null,
      };
    });

    return {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      shirtNumber: p.shirtNumber,
      position: p.primaryPosition,
      hasEval: parsed != null,
      overall: parsed
        ? (
            parsed.flatMap((b) => b.metrics.map((m) => m.score)).reduce((a, b) => a + b, 0) /
            Math.max(
              1,
              parsed.reduce((acc, b) => acc + b.metrics.length, 0),
            )
          ).toFixed(1)
        : null,
      blocks,
    };
  });

  return (
    <AppShell active="suite" userName={user.name} role={user.role}>
      <main className="h-full bg-cream overflow-hidden">
        <TacticalSuiteMaster players={data} />
      </main>
    </AppShell>
  );
}
