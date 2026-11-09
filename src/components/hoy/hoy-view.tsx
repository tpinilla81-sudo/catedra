// ============================================================================
// VISTA "HOY" — Dashboard principal en Modo Vestuario (server component)
// ----------------------------------------------------------------------------
// Regla de oro: CERO PANTALLAS EN BLANCO. El míster abre la app y encuentra:
//   1. El pulso del vestuario (ánimo / fatiga / contexto de partidos)
//   2. La propuesta del microciclo semanal YA COCINADA por el motor
//   3. Un solo toque para aceptar el plan (✅ Aceptar Plan)
// Botones grandes (≥44px), semáforos de color, sin formularios largos.
// ============================================================================
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { mondayOf } from "@/lib/utils/dates";
import {
  AlertTriangle,
  CalendarDays,
  Dumbbell,
  HeartPulse,
  MapPin,
  Shield,
  Sparkles,
  Timer,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireTenantContext } from "@/lib/session";
import { AppShell } from "@/components/dashboard/app-shell";
import { AcceptPlanButton } from "@/components/hoy/accept-plan-button";
import { EnsureProposalButton } from "@/components/hoy/ensure-proposal-button";
import { PersistActiveTeam } from "@/components/hoy/persist-active-team";
import type { DiscardedCandidate, PrescriptionAudit } from "@/lib/engine/pipeline";

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  PROPOSED: { label: "Propuesta lista — pendiente de tu visto bueno", cls: "bg-[#e3a93c]/15 text-[#8a6206] border-amber-400/40" },
  ACCEPTED: { label: "Plan aceptado — a entrenar", cls: "bg-brand-600/15 text-brand-600 border-emerald-500/40" },
  ADJUSTED: { label: "Ajustado por el cuerpo técnico", cls: "bg-brand-600/10 text-brand border-emerald-500/30" },
  COMPLETED: { label: "Semana completada", cls: "bg-cream-dark text-[#3d5844] border-[#b9b49c]" },
};

const KIND_CHIP: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  TACTICAL: { label: "Táctico", cls: "bg-[#c62f32]/15 text-[#b4232a] border-rose-500/40", icon: Shield },
  PHYSICAL: { label: "Físico", cls: "bg-amber-500/15 text-[#8a6206] border-amber-500/40", icon: Dumbbell },
  MORALE: { label: "Ánimo", cls: "bg-violet-500/15 text-[#6d28d9] border-violet-500/40", icon: HeartPulse },
};

const TRIGGER_LABEL: Record<string, string> = {
  WEEKLY_PROPOSAL: "Cocinado el lunes",
  EVIDENCE_REFRESH: "Actualizado con la última ingesta",
};

const INTENSITY_CHIP: Record<string, string> = {
  LOW: "bg-brand-600/15 text-brand-600 border-emerald-500/40",
  MEDIUM: "bg-amber-500/15 text-[#8a6206] border-amber-500/40",
  HIGH: "bg-[#c62f32]/15 text-[#b4232a] border-rose-500/40",
};

const PHASE_LABEL: Record<string, string> = {
  OFFENSIVE: "Ofensiva",
  DEFENSIVE: "Defensiva",
  OFF_TRANSITION: "Trans. ofensiva",
  DEF_TRANSITION: "Trans. defensiva",
  SET_PIECE: "ABP",
};

function gaugeColor(value: number) {
  if (value >= 7) return "bg-[#e05252]";
  if (value >= 4) return "bg-[#e3a93c]";
  return "bg-brand-400";
}

export async function HoyView() {
  const { db, team, clubId, user } = await requireTenantContext();
  // Semana ISO decidida por el calendario de Madrid (misma convención que el
  // motor — ver src/lib/utils/dates.ts): sin esto, un servidor UTC y un
  // usuario de Madrid pueden discrepar del lunes de la semana a primera hora.
  const weekStart = mondayOf(new Date());

  const [microcycle, pulse, nextMatch, lastMatch] = await Promise.all([
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

  // ---------- Auditoría del motor (transparencia del plan) ----------
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

  const dateLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: es });

  return (
    <AppShell active="today" userName={user.name} role={user.role}>
    <main className="pb-10">
      <PersistActiveTeam teamId={team.id} />

      {/* ---------- Cabecera ---------- */}
      <header className="border-b border-cream-border bg-white/60">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-brand-600/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Trophy className="w-6 h-6 text-brand-600" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-[#6c8070] leading-tight truncate">CF Método · Fase 2</p>
              <p className="text-lg font-bold text-peel leading-tight truncate">
                {team.name}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 space-y-6 pt-6">
        {/* ---------- Título + fecha ---------- */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Hoy</h1>
            <p className="text-[#5d7263] flex items-center gap-2 mt-1">
              <CalendarDays className="w-4 h-4" aria-hidden />
              {dateLabel}
            </p>
          </div>
          <p className="text-sm text-[#6c8070]">
            Semana del {format(weekStart, "d MMM", { locale: es })}
          </p>
        </div>

        {/* ---------- Pulso Colectivo ---------- */}
        <section aria-labelledby="pulso-title" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <h2 id="pulso-title" className="sr-only">
            Pulso del vestuario
          </h2>
          {pulse && (
            <>
              <Card className="bg-white border-cream-border rounded-3xl">
                <CardContent className="p-4 space-y-3">
                  <p className="text-xs font-semibold text-[#5d7263] flex items-center gap-1.5">
                    <HeartPulse className="w-4 h-4 text-[#6d28d9]" aria-hidden /> INERCIA ANÍMICA
                  </p>
                  <p className="text-3xl font-black text-peel">{pulse.moraleScore}<span className="text-sm text-[#6c8070] font-bold">/10</span></p>
                  <div className="h-2 rounded-full bg-cream-dark overflow-hidden">
                    <div className={`h-full ${gaugeColor(pulse.moraleScore)}`} style={{ width: `${pulse.moraleScore * 10}%` }} />
                  </div>
                  {pulse.resultsStreak != null && (
                    <p className="text-xs text-[#5d7263] flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" aria-hidden />
                      Racha: {pulse.resultsStreak > 0 ? `+${pulse.resultsStreak} victorias` : pulse.resultsStreak < 0 ? `${pulse.resultsStreak} derrotas` : "empates"}
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-white border-cream-border rounded-3xl">
                <CardContent className="p-4 space-y-3">
                  <p className="text-xs font-semibold text-[#5d7263] flex items-center gap-1.5">
                    <Dumbbell className="w-4 h-4 text-[#8a6206]" aria-hidden /> FATIGA GRUPAL
                  </p>
                  <p className="text-3xl font-black text-peel">{pulse.fatigueScore}<span className="text-sm text-[#6c8070] font-bold">/10</span></p>
                  <div className="h-2 rounded-full bg-cream-dark overflow-hidden">
                    <div className={`h-full ${gaugeColor(pulse.fatigueScore)}`} style={{ width: `${pulse.fatigueScore * 10}%` }} />
                  </div>
                  <p className="text-xs text-[#6c8070]">
                    {pulse.fatigueScore >= 7 ? "Carga alta: semana controlada" : "Nivel de carga asumible"}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
          <Card className="bg-white border-cream-border rounded-3xl">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-semibold text-[#5d7263] flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-brand-600" aria-hidden /> ÚLTIMO PARTIDO
              </p>
              {lastMatch ? (
                <>
                  <p className="text-2xl font-black text-peel">
                    {lastMatch.goalsFor ?? 0} - {lastMatch.goalsAgainst ?? 0}
                  </p>
                  <p className="text-xs text-[#5d7263] truncate">
                    vs {lastMatch.opponent} · {lastMatch.isHome ? "en casa" : "fuera"}
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#6c8070]">Sin partidos aún</p>
              )}
            </CardContent>
          </Card>
          <Card className="bg-white border-cream-border rounded-3xl">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-semibold text-[#5d7263] flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#5d7263]" aria-hidden /> PRÓXIMO PARTIDO
              </p>
              {nextMatch ? (
                <>
                  <p className="text-lg font-black text-peel truncate">vs {nextMatch.opponent}</p>
                  <p className="text-xs text-[#5d7263]">
                    {format(nextMatch.kickoffAt, "EEE d MMM · HH:mm'h'", { locale: es })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#6c8070]">Calendario por definir</p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ---------- Plan de la semana ---------- */}
        <section aria-labelledby="plan-title">
          <h2 id="plan-title" className="sr-only">Plan de la semana</h2>
          {!microcycle ? (
            <Card className="bg-white border-cream-border rounded-3xl">
              <CardContent className="p-8 text-center space-y-4">
                <Sparkles className="w-10 h-10 text-[#8a6206] mx-auto" aria-hidden />
                <p className="text-lg font-bold text-peel">
                  El motor no tiene propuesta cocinada para esta semana
                </p>
                <p className="text-sm text-[#5d7263] max-w-md mx-auto">
                  Con un toque, cocinamos el microciclo a partir del último partido y del
                  pulso del vestuario.
                </p>
                <EnsureProposalButton />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              <Card className="bg-white border-cream-border rounded-3xl overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-xl font-black text-peel">
                      Microciclo · {format(microcycle.weekStart, "d MMM", { locale: es })}
                    </CardTitle>
                    <Badge variant="outline" className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CHIP[microcycle.status]?.cls ?? ""}`}>
                      {STATUS_CHIP[microcycle.status]?.label ?? microcycle.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {microcycle.tacticalDirectives.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-2xl bg-cream-dark/70 px-4 py-3">
                        <Shield className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" aria-hidden />
                        <p className="text-sm font-semibold text-peel">{d}</p>
                      </div>
                    ))}
                  </div>

                  {microcycle.diagnosisSummary && (
                    <p className="text-sm text-[#5d7263] leading-relaxed">
                      <span className="font-semibold text-[#3d5844]">Diagnóstico del motor: </span>
                      {microcycle.diagnosisSummary}
                    </p>
                  )}

                  {microcycle.issues.length > 0 && (
                    <div className="space-y-2">
                      <Separator className="bg-cream-dark" />
                      <p className="text-xs font-bold text-[#6c8070] uppercase tracking-wide">
                        Qué falló ({microcycle.engineVersion ?? "motor"})
                      </p>
                      <div className="space-y-2">
                        {microcycle.issues.map((issue) => {
                          const chip = KIND_CHIP[issue.kind] ?? KIND_CHIP.TACTICAL;
                          const Icon = chip.icon;
                          return (
                            <div key={issue.id} className="rounded-2xl border border-cream-border bg-cream-dark/70 px-4 py-3 space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className={`rounded-full text-xs ${chip.cls}`}>
                                  <Icon className="w-3 h-3 mr-1" aria-hidden />
                                  {chip.label}
                                </Badge>
                                {issue.phase && (
                                  <Badge variant="outline" className="rounded-full text-xs bg-cream-dark text-[#3d5844] border-cream-border-strong">
                                    {PHASE_LABEL[issue.phase] ?? issue.phase}
                                  </Badge>
                                )}
                                <span className="text-xs text-[#6c8070] flex items-center gap-0.5" title={`Severidad ${issue.severity}/5`}>
                                  {Array.from({ length: 5 }).map((_, s) => (
                                    <AlertTriangle
                                      key={s}
                                      className={`w-3 h-3 ${s < issue.severity ? "text-[#8a6206]" : "text-[#7c8f7e]"}`}
                                      aria-hidden
                                    />
                                  ))}
                                </span>
                              </div>
                              <p className="text-sm text-[#3d5844]">{issue.evidence}</p>
                              {issue.subPrinciple && (
                                <p className="text-xs text-[#6c8070]">
                                  Subprincipio: {issue.subPrinciple.name}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ---------- Sesiones ---------- */}
              {microcycle.sessions.map((session) => (
                <Card key={session.id} className="bg-white border-cream-border rounded-3xl">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Badge className="rounded-xl bg-brand-600/15 text-brand-600 border border-emerald-500/30 hover:bg-brand-600/15 px-3 py-1 font-bold">
                          {session.label}
                        </Badge>
                        <CardTitle className="text-lg font-bold text-peel">
                          {format(session.date, "EEEE d", { locale: es })}
                        </CardTitle>
                      </div>
                      <p className="text-xs text-[#6c8070] flex items-center gap-1">
                        <Timer className="w-3.5 h-3.5" aria-hidden />
                        {session.durationMin ? `${session.durationMin} min` : "—"}
                      </p>
                    </div>
                    {session.objective && (
                      <p className="text-sm text-[#5d7263] pt-1">{session.objective}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {session.tasks.length === 0 && (
                      <p className="text-sm text-[#6c8070]">Sesión libre — aún sin tareas asignadas.</p>
                    )}
                    {session.tasks.map((st) => (
                      <div key={st.id} className="rounded-2xl border border-cream-border bg-cream-dark/70 p-4 space-y-2">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <p className="font-bold text-peel">
                            <span className="text-brand-600 mr-2">{st.order}.</span>
                            {st.task.title}
                          </p>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`rounded-full text-xs ${INTENSITY_CHIP[st.task.intensity] ?? ""}`}>
                              {st.task.intensity}
                            </Badge>
                            <Badge variant="outline" className="rounded-full text-xs bg-cream-dark text-[#3d5844] border-cream-border-strong">
                              {st.durationMin ?? st.task.durationMin} min
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-[#5d7263]">{st.task.objective}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-[#6c8070]">
                          {st.task.spaceLengthM && st.task.spaceWidthM && (
                            <span className="rounded-lg bg-cream-dark/85 px-2 py-1">
                              Espacio {st.task.spaceLengthM}×{st.task.spaceWidthM} m
                            </span>
                          )}
                          <span className="rounded-lg bg-cream-dark/85 px-2 py-1 flex items-center gap-1">
                            <Users className="w-3 h-3" aria-hidden />
                            {st.task.playersMin}{st.task.playersMax ? `–${st.task.playersMax}` : ""} jugadores
                          </span>
                          {st.task.phases.map((ph) => (
                            <span key={ph} className="rounded-lg bg-cream-dark/85 px-2 py-1">
                              {PHASE_LABEL[ph] ?? ph}
                            </span>
                          ))}
                        </div>
                        {st.rationale && (
                          <p className="text-sm italic text-[#6c8070] border-l-2 border-emerald-500/40 pl-3">
                            Por qué esta tarea: {st.rationale}
                          </p>
                        )}
                        {st.issue && (
                          <p className="text-xs text-[#8a6206]/90 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" aria-hidden />
                            Corrige: {st.issue.evidence}
                          </p>
                        )}
                        {st.task.rulesOfProvocation.length > 0 && (
                          <p className="text-xs text-[#6c8070]">
                            Reglas: {st.task.rulesOfProvocation.join(" · ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}

              {/* ---------- Transparencia del motor (revisión del rationale) ---------- */}
              {latestRun && (
                <Card className="bg-white border-cream-border rounded-3xl">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <CardTitle className="text-lg font-black text-peel flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#8a6206]" aria-hidden />
                        Por qué este plan
                      </CardTitle>
                      <Badge variant="outline" className="rounded-full text-xs bg-cream-dark text-[#5d7263] border-cream-border-strong">
                        motor {latestRun.version}
                        {latestRun.durationMs != null && ` · ${latestRun.durationMs} ms`}
                      </Badge>
                    </div>
                    {latestRun.trigger && (
                      <p className="text-xs text-[#6c8070] flex items-center gap-1.5 pt-1">
                        <TrendingUp className="w-3.5 h-3.5" aria-hidden />
                        {TRIGGER_LABEL[latestRun.trigger] ?? latestRun.trigger}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {runPrescriptions.length > 0 ? (
                      <div className="space-y-2">
                        {runPrescriptions.map((p, i) => (
                          <div key={i} className="rounded-2xl border border-emerald-500/20 bg-brand-600/5 px-4 py-3 flex items-start gap-3">
                            <span className="w-6 h-6 rounded-full bg-brand-600/15 text-brand-600 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-peel">
                                {p.taskTitle}
                                {p.sessionLabel && (
                                  <span className="ml-2 text-xs font-semibold text-brand-600">{p.sessionLabel}</span>
                                )}
                              </p>
                              <p className="text-xs text-[#5d7263] mt-0.5">{p.rationale}</p>
                              {p.relevance != null && (
                                <p className="text-xs text-[#6c8070] mt-1">
                                  Relevancia en la receta: {p.relevance === 3 ? "Núcleo" : p.relevance === 2 ? "Refuerza" : "Apoyo"}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[#6c8070]">
                        El motor no encontró tareas conectadas en la receta para los hallazgos de esta semana.
                      </p>
                    )}

                    {runDiscarded.length > 0 && (
                      <details className="group rounded-2xl border border-cream-border bg-cream-dark/70 overflow-hidden">
                        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#5d7263] flex items-center justify-between hover:text-[#2a4630]">
                          Candidatas evaluadas y descartadas ({runDiscarded.length})
                          <span className="text-xs text-[#8a9a8d] group-open:hidden">ver</span>
                          <span className="hidden text-xs text-[#8a9a8d] group-open:inline">ocultar</span>
                        </summary>
                        <div className="px-4 pb-4 space-y-2">
                          {runDiscarded.map((d, i) => (
                            <div key={i} className="rounded-xl bg-white/90 px-3 py-2 flex items-start justify-between gap-3">
                              <p className="text-sm text-[#3d5844] min-w-0">{d.taskTitle}</p>
                              <p className="text-xs text-[#6c8070] text-right shrink-0">{d.reason}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ---------- CTA: decisión con un toque ---------- */}
              {microcycle.status === "PROPOSED" ? (
                <AcceptPlanButton microcycleId={microcycle.id} />
              ) : (
                <div className="rounded-3xl border border-emerald-500/40 bg-brand-600/10 p-5 text-center">
                  <p className="text-lg font-bold text-brand-600 flex items-center justify-center gap-2">
                    <Trophy className="w-5 h-5" aria-hidden />
                    {STATUS_CHIP[microcycle.status]?.label ?? microcycle.status}
                  </p>
                  <p className="text-sm text-brand/90 mt-1">
                    Plan de la semana cerrado. Toca cualquier tarea para retocarla (próxima fase).
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
    </AppShell>
  );
}
