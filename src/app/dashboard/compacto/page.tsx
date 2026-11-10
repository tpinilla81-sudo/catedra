// ============================================================================
// MODO COMPACTO & NO-SCROLL — /dashboard/compacto
// ----------------------------------------------------------------------------
// Vista de banquillo (mock del míster): oscura, tipo terminal, sin scroll de
// página. Server Component: carga datos VIVOS de los pilares (microciclo de la
// semana del Pilar 4 con su diagnóstico y auditoría del motor, catálogo de
// tareas con zona/vídeo, plantilla por posición, calendario de partidos) y los
// pasa al cliente. Sin escrituras aquí: las acciones (Aceptar Plan / cocinar
// propuesta) son las mismas Server Actions de /dashboard/today — fuente única.
// ============================================================================
import { CompactoView, type CompactoData, type CompactoHoy } from "@/components/compacto/compacto-view";
import { requireTenantContext } from "@/lib/session";
import { mondayOf } from "@/lib/utils/dates";
import type { PrescriptionAudit, DiscardedCandidate } from "@/lib/engine/pipeline";

export const dynamic = "force-dynamic";

export default async function CompactoPage() {
  const { db, team } = await requireTenantContext();

  const weekStart = mondayOf(new Date());
  // Hoy según el calendario de Madrid, como medianoche UTC (misma convención
  // que las columnas @db.Date de Session) — para resaltar la sesión del día
  // en el tab Hoy sin que la TZ del navegador rote el día.
  const madridToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const todayIso = `${madridToday}T00:00:00.000Z`;

  const [tasks, players, matches, microcycle, pulse, nextMatch, lastMatch] = await Promise.all([
    // Catálogo visible: propio + Cátedra global (el Tenant Guard inyecta el OR)
    db.task.findMany({
      orderBy: [{ title: "asc" }],
      select: {
        id: true,
        title: true,
        objective: true,
        phases: true,
        playersMin: true,
        playersMax: true,
        durationMin: true,
        intensity: true,
        fieldZoneLabel: true,
        videoUrl: true,
        spaceLengthM: true,
        spaceWidthM: true,
        clubId: true,
      },
    }),
    db.player.findMany({
      where: { teamId: team.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        shirtNumber: true,
        primaryPosition: true,
      },
    }),
    db.match.findMany({
      where: { teamId: team.id },
      orderBy: [{ kickoffAt: "desc" }],
      take: 30,
      select: {
        id: true,
        opponent: true,
        competition: true,
        isHome: true,
        kickoffAt: true,
        goalsFor: true,
        goalsAgainst: true,
        status: true,
      },
    }),
    // ---------- Pilar 4 · microciclo de la semana (misma convención que Hoy) ----------
    db.microcycle.findUnique({
      where: { teamId_weekStart: { teamId: team.id, weekStart } },
      include: {
        issues: { orderBy: [{ severity: "desc" }], include: { subPrinciple: true } },
        sessions: {
          orderBy: { date: "asc" },
          include: {
            tasks: {
              orderBy: { order: "asc" },
              include: { task: true, issue: true },
            },
          },
        },
      },
    }),
    db.teamPulse.findFirst({
      where: { teamId: team.id },
      orderBy: { date: "desc" },
    }),
    db.match.findFirst({
      where: { teamId: team.id, status: "SCHEDULED", kickoffAt: { gte: new Date() } },
      orderBy: { kickoffAt: "asc" },
    }),
    db.match.findFirst({
      where: { teamId: team.id, status: { in: ["PLAYED", "ANALYZED"] } },
      orderBy: { kickoffAt: "desc" },
    }),
  ]);

  // ---------- Auditoría del motor (transparencia: por qué este plan) ----------
  const latestRun = microcycle
    ? await db.engineRun.findFirst({
        where: { microcycleId: microcycle.id },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const runPrescriptions: PrescriptionAudit[] = Array.isArray(latestRun?.prescriptions)
    ? (latestRun!.prescriptions as unknown as PrescriptionAudit[])
    : [];
  const runDiscarded: DiscardedCandidate[] = Array.isArray(latestRun?.discarded)
    ? (latestRun!.discarded as unknown as DiscardedCandidate[])
    : [];

  const hoy: CompactoHoy | null = microcycle
    ? {
        weekStartIso: microcycle.weekStart.toISOString(),
        microcycleId: microcycle.id,
        status: microcycle.status,
        engineVersion: microcycle.engineVersion,
        tacticalDirectives: microcycle.tacticalDirectives,
        diagnosisSummary: microcycle.diagnosisSummary,
        issues: microcycle.issues.map((i) => ({
          kind: i.kind,
          phase: i.phase,
          severity: i.severity,
          evidence: i.evidence,
          subPrinciple: i.subPrinciple?.name ?? null,
        })),
        sessions: microcycle.sessions.map((s) => ({
          id: s.id,
          label: s.label,
          dateIso: s.date.toISOString(),
          objective: s.objective,
          durationMin: s.durationMin,
          tasks: s.tasks.map((st) => ({
            order: st.order,
            title: st.task.title,
            objective: st.task.objective,
            intensity: st.task.intensity,
            durationMin: st.durationMin ?? st.task.durationMin,
            playersMin: st.task.playersMin,
            playersMax: st.task.playersMax,
            spaceLengthM: st.task.spaceLengthM,
            spaceWidthM: st.task.spaceWidthM,
            rationale: st.rationale,
            corrige: st.issue?.evidence ?? null,
            videoUrl: st.task.videoUrl,
          })),
        })),
        audit: latestRun
          ? {
              version: latestRun.version,
              trigger: latestRun.trigger,
              prescriptions: runPrescriptions.map((p) => ({
                taskTitle: p.taskTitle,
                sessionLabel: p.sessionLabel,
                rationale: p.rationale,
                relevance: p.relevance,
              })),
              discarded: runDiscarded.map((d) => ({
                taskTitle: d.taskTitle,
                reason: d.reason,
              })),
            }
          : null,
      }
    : null;

  const data: CompactoData = {
    teamName: team.name,
    hoy,
    todayIso,
    pulse: pulse
      ? {
          morale: pulse.moraleScore,
          fatigue: pulse.fatigueScore,
          streak: pulse.resultsStreak ?? null,
        }
      : null,
    lastMatch: lastMatch
      ? {
          opponent: lastMatch.opponent,
          isHome: lastMatch.isHome,
          goalsFor: lastMatch.goalsFor ?? 0,
          goalsAgainst: lastMatch.goalsAgainst ?? 0,
        }
      : null,
    nextMatch: nextMatch
      ? {
          opponent: nextMatch.opponent,
          isHome: nextMatch.isHome,
          kickoffIso: nextMatch.kickoffAt.toISOString(),
        }
      : null,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      objective: t.objective,
      phases: t.phases,
      playersMin: t.playersMin,
      playersMax: t.playersMax,
      durationMin: t.durationMin,
      intensity: t.intensity,
      fieldZoneLabel: t.fieldZoneLabel,
      videoUrl: t.videoUrl,
      spaceLengthM: t.spaceLengthM,
      spaceWidthM: t.spaceWidthM,
      isCatedra: t.clubId === null,
    })),
    players: players
      .map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        number: p.shirtNumber,
        position: p.primaryPosition,
      }))
      // Dorsales primero; los sin dorsal al final por nombre
      .sort(
        (a, b) =>
          (a.number ?? 99) - (b.number ?? 99) || a.name.localeCompare(b.name),
      ),
    matches: matches.map((m) => ({
      id: m.id,
      opponent: m.opponent,
      competition: m.competition,
      isHome: m.isHome,
      kickoffAt: m.kickoffAt.toISOString(),
      goalsFor: m.goalsFor,
      goalsAgainst: m.goalsAgainst,
      played: m.status !== "SCHEDULED",
    })),
  };

  return (
    <main className="min-h-screen bg-slate-950">
      <CompactoView data={data} />
    </main>
  );
}
