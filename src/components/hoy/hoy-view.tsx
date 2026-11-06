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
import { startOfWeek } from "date-fns";
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
import { AcceptPlanButton } from "@/components/hoy/accept-plan-button";
import { EnsureProposalButton } from "@/components/hoy/ensure-proposal-button";
import { PersistActiveTeam } from "@/components/hoy/persist-active-team";
import { UserMenu } from "@/components/hoy/user-menu";

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  PROPOSED: { label: "Propuesta lista — pendiente de tu visto bueno", cls: "bg-amber-400/15 text-amber-300 border-amber-400/40" },
  ACCEPTED: { label: "Plan aceptado — a entrenar", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  ADJUSTED: { label: "Ajustado por el cuerpo técnico", cls: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30" },
  COMPLETED: { label: "Semana completada", cls: "bg-zinc-800 text-zinc-300 border-zinc-600" },
};

const KIND_CHIP: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  TACTICAL: { label: "Táctico", cls: "bg-rose-500/15 text-rose-300 border-rose-500/40", icon: Shield },
  PHYSICAL: { label: "Físico", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40", icon: Dumbbell },
  MORALE: { label: "Ánimo", cls: "bg-violet-500/15 text-violet-300 border-violet-500/40", icon: HeartPulse },
};

const INTENSITY_CHIP: Record<string, string> = {
  LOW: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  MEDIUM: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  HIGH: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

const PHASE_LABEL: Record<string, string> = {
  OFFENSIVE: "Ofensiva",
  DEFENSIVE: "Defensiva",
  OFF_TRANSITION: "Trans. ofensiva",
  DEF_TRANSITION: "Trans. defensiva",
  SET_PIECE: "ABP",
};

function gaugeColor(value: number) {
  if (value >= 7) return "bg-rose-400";
  if (value >= 4) return "bg-amber-400";
  return "bg-emerald-400";
}

export async function HoyView() {
  const { db, team, clubId, user } = await requireTenantContext();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

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

  const dateLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: es });

  return (
    <main className="min-h-screen bg-zinc-950 pb-16">
      <PersistActiveTeam teamId={team.id} />

      {/* ---------- Cabecera ---------- */}
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Trophy className="w-6 h-6 text-emerald-400" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 leading-tight truncate">CF Método · Fase 1</p>
              <p className="text-lg font-bold text-zinc-50 leading-tight truncate">
                {team.name}
              </p>
            </div>
          </div>
          <UserMenu userName={user.name} role={user.role} />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 space-y-6 pt-6">
        {/* ---------- Título + fecha ---------- */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Hoy</h1>
            <p className="text-zinc-400 flex items-center gap-2 mt-1">
              <CalendarDays className="w-4 h-4" aria-hidden />
              {dateLabel}
            </p>
          </div>
          <p className="text-sm text-zinc-500">
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
              <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
                <CardContent className="p-4 space-y-3">
                  <p className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                    <HeartPulse className="w-4 h-4 text-violet-300" aria-hidden /> INERCIA ANÍMICA
                  </p>
                  <p className="text-3xl font-black text-zinc-50">{pulse.moraleScore}<span className="text-sm text-zinc-500 font-bold">/10</span></p>
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div className={`h-full ${gaugeColor(pulse.moraleScore)}`} style={{ width: `${pulse.moraleScore * 10}%` }} />
                  </div>
                  {pulse.resultsStreak != null && (
                    <p className="text-xs text-zinc-400 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" aria-hidden />
                      Racha: {pulse.resultsStreak > 0 ? `+${pulse.resultsStreak} victorias` : pulse.resultsStreak < 0 ? `${pulse.resultsStreak} derrotas` : "empates"}
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
                <CardContent className="p-4 space-y-3">
                  <p className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                    <Dumbbell className="w-4 h-4 text-amber-300" aria-hidden /> FATIGA GRUPAL
                  </p>
                  <p className="text-3xl font-black text-zinc-50">{pulse.fatigueScore}<span className="text-sm text-zinc-500 font-bold">/10</span></p>
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div className={`h-full ${gaugeColor(pulse.fatigueScore)}`} style={{ width: `${pulse.fatigueScore * 10}%` }} />
                  </div>
                  <p className="text-xs text-zinc-500">
                    {pulse.fatigueScore >= 7 ? "Carga alta: semana controlada" : "Nivel de carga asumible"}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
          <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-emerald-300" aria-hidden /> ÚLTIMO PARTIDO
              </p>
              {lastMatch ? (
                <>
                  <p className="text-2xl font-black text-zinc-50">
                    {lastMatch.goalsFor ?? 0} - {lastMatch.goalsAgainst ?? 0}
                  </p>
                  <p className="text-xs text-zinc-400 truncate">
                    vs {lastMatch.opponent} · {lastMatch.isHome ? "en casa" : "fuera"}
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-500">Sin partidos aún</p>
              )}
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-zinc-400" aria-hidden /> PRÓXIMO PARTIDO
              </p>
              {nextMatch ? (
                <>
                  <p className="text-lg font-black text-zinc-50 truncate">vs {nextMatch.opponent}</p>
                  <p className="text-xs text-zinc-400">
                    {format(nextMatch.kickoffAt, "EEE d MMM · HH:mm'h'", { locale: es })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-500">Calendario por definir</p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ---------- Plan de la semana ---------- */}
        <section aria-labelledby="plan-title">
          <h2 id="plan-title" className="sr-only">Plan de la semana</h2>
          {!microcycle ? (
            <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
              <CardContent className="p-8 text-center space-y-4">
                <Sparkles className="w-10 h-10 text-amber-300 mx-auto" aria-hidden />
                <p className="text-lg font-bold text-zinc-100">
                  El motor no tiene propuesta cocinada para esta semana
                </p>
                <p className="text-sm text-zinc-400 max-w-md mx-auto">
                  Con un toque, cocinamos el microciclo a partir del último partido y del
                  pulso del vestuario.
                </p>
                <EnsureProposalButton />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              <Card className="bg-zinc-900 border-zinc-800 rounded-3xl overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-xl font-black text-zinc-50">
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
                      <div key={i} className="flex items-start gap-2 rounded-2xl bg-zinc-800/60 px-4 py-3">
                        <Shield className="w-5 h-5 text-emerald-300 mt-0.5 shrink-0" aria-hidden />
                        <p className="text-sm font-semibold text-zinc-100">{d}</p>
                      </div>
                    ))}
                  </div>

                  {microcycle.diagnosisSummary && (
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      <span className="font-semibold text-zinc-300">Diagnóstico del motor: </span>
                      {microcycle.diagnosisSummary}
                    </p>
                  )}

                  {microcycle.issues.length > 0 && (
                    <div className="space-y-2">
                      <Separator className="bg-zinc-800" />
                      <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                        Qué falló ({microcycle.engineVersion ?? "motor"})
                      </p>
                      <div className="space-y-2">
                        {microcycle.issues.map((issue) => {
                          const chip = KIND_CHIP[issue.kind] ?? KIND_CHIP.TACTICAL;
                          const Icon = chip.icon;
                          return (
                            <div key={issue.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className={`rounded-full text-xs ${chip.cls}`}>
                                  <Icon className="w-3 h-3 mr-1" aria-hidden />
                                  {chip.label}
                                </Badge>
                                {issue.phase && (
                                  <Badge variant="outline" className="rounded-full text-xs bg-zinc-800 text-zinc-300 border-zinc-700">
                                    {PHASE_LABEL[issue.phase] ?? issue.phase}
                                  </Badge>
                                )}
                                <span className="text-xs text-zinc-500 flex items-center gap-0.5" title={`Severidad ${issue.severity}/5`}>
                                  {Array.from({ length: 5 }).map((_, s) => (
                                    <AlertTriangle
                                      key={s}
                                      className={`w-3 h-3 ${s < issue.severity ? "text-amber-400" : "text-zinc-700"}`}
                                      aria-hidden
                                    />
                                  ))}
                                </span>
                              </div>
                              <p className="text-sm text-zinc-300">{issue.evidence}</p>
                              {issue.subPrinciple && (
                                <p className="text-xs text-zinc-500">
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
                <Card key={session.id} className="bg-zinc-900 border-zinc-800 rounded-3xl">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Badge className="rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/15 px-3 py-1 font-bold">
                          {session.label}
                        </Badge>
                        <CardTitle className="text-lg font-bold text-zinc-50">
                          {format(session.date, "EEEE d", { locale: es })}
                        </CardTitle>
                      </div>
                      <p className="text-xs text-zinc-500 flex items-center gap-1">
                        <Timer className="w-3.5 h-3.5" aria-hidden />
                        {session.durationMin ? `${session.durationMin} min` : "—"}
                      </p>
                    </div>
                    {session.objective && (
                      <p className="text-sm text-zinc-400 pt-1">{session.objective}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {session.tasks.length === 0 && (
                      <p className="text-sm text-zinc-500">Sesión libre — aún sin tareas asignadas.</p>
                    )}
                    {session.tasks.map((st) => (
                      <div key={st.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-2">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <p className="font-bold text-zinc-100">
                            <span className="text-emerald-400 mr-2">{st.order}.</span>
                            {st.task.title}
                          </p>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`rounded-full text-xs ${INTENSITY_CHIP[st.task.intensity] ?? ""}`}>
                              {st.task.intensity}
                            </Badge>
                            <Badge variant="outline" className="rounded-full text-xs bg-zinc-800 text-zinc-300 border-zinc-700">
                              {st.durationMin ?? st.task.durationMin} min
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-zinc-400">{st.task.objective}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                          {st.task.spaceLengthM && st.task.spaceWidthM && (
                            <span className="rounded-lg bg-zinc-800/80 px-2 py-1">
                              Espacio {st.task.spaceLengthM}×{st.task.spaceWidthM} m
                            </span>
                          )}
                          <span className="rounded-lg bg-zinc-800/80 px-2 py-1 flex items-center gap-1">
                            <Users className="w-3 h-3" aria-hidden />
                            {st.task.playersMin}{st.task.playersMax ? `–${st.task.playersMax}` : ""} jugadores
                          </span>
                          {st.task.phases.map((ph) => (
                            <span key={ph} className="rounded-lg bg-zinc-800/80 px-2 py-1">
                              {PHASE_LABEL[ph] ?? ph}
                            </span>
                          ))}
                        </div>
                        {st.rationale && (
                          <p className="text-sm italic text-zinc-500 border-l-2 border-emerald-500/40 pl-3">
                            Por qué esta tarea: {st.rationale}
                          </p>
                        )}
                        {st.issue && (
                          <p className="text-xs text-amber-300/80 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" aria-hidden />
                            Corrige: {st.issue.evidence}
                          </p>
                        )}
                        {st.task.rulesOfProvocation.length > 0 && (
                          <p className="text-xs text-zinc-500">
                            Reglas: {st.task.rulesOfProvocation.join(" · ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}

              {/* ---------- CTA: decisión con un toque ---------- */}
              {microcycle.status === "PROPOSED" ? (
                <AcceptPlanButton microcycleId={microcycle.id} />
              ) : (
                <div className="rounded-3xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-center">
                  <p className="text-lg font-bold text-emerald-300 flex items-center justify-center gap-2">
                    <Trophy className="w-5 h-5" aria-hidden />
                    {STATUS_CHIP[microcycle.status]?.label ?? microcycle.status}
                  </p>
                  <p className="text-sm text-emerald-200/70 mt-1">
                    Plan de la semana cerrado. Toca cualquier tarea para retocarla (próxima fase).
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
