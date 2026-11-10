// ============================================================================
// VISTA "HOY" — STICKY MASTER en Modo Vestuario (server component)
// ----------------------------------------------------------------------------
// Anatomía ultra-compacta a petición del míster: zona FIJA arriba (cabecera del
// equipo + 4 cuadros pequeños: inercia / fatiga / último partido / próximo
// rival) y el plan de la semana con scroll propio debajo. Sin scroll de página.
// Regla de oro intacta: CERO PANTALLAS EN BLANCO y decisión con un toque.
// ============================================================================
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { mondayOf } from "@/lib/utils/dates";
import {
  AlertTriangle,
  ChevronDown,
  Dumbbell,
  HeartPulse,
  MapPin,
  Shield,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

// Chip corto para la zona fija (la etiqueta larga vive en el detalle del plan)
const STATUS_CHIP_SHORT: Record<string, string> = {
  PROPOSED: "Propuesta lista",
  ACCEPTED: "Plan aceptado",
  ADJUSTED: "Ajustado",
  COMPLETED: "Completada",
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
  // Fecha corta para la cabecera fija ("Hoy, martes 11") e ISO de HOY según el
  // calendario de Madrid (misma convención @db.Date que el motor — sin rotar
  // el día por la zona horaria del navegador).
  const dateLabel = format(new Date(), "EEEE d", { locale: es });
  const madridToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const todayIso = `${madridToday}T00:00:00.000Z`;
  const sessions = microcycle?.sessions ?? [];
  const todaySession = sessions.find((s) => s.date.toISOString() === todayIso) ?? null;
  const otherSessions = sessions.filter((s) => s !== todaySession);

  return (
    <AppShell active="today" userName={user.name} role={user.role}>
    <main className="h-full flex flex-col overflow-hidden bg-cream">
      <PersistActiveTeam teamId={team.id} />

      {/* ================= ZONA FIJA (sticky master) ================= */}
      <div className="flex-none border-b border-cream-border bg-white/85 backdrop-blur z-10">
        <header className="mx-auto max-w-5xl px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-brand-600/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5 text-brand-600" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#6c8070] leading-tight truncate capitalize">
                Primer Equipo · Hoy, {dateLabel}
              </p>
              <p className="text-base font-black text-peel leading-tight truncate">
                {team.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {microcycle ? (
              <>
                <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[11px] font-bold hidden sm:inline-flex ${STATUS_CHIP[microcycle.status]?.cls ?? ""}`}>
                  {STATUS_CHIP_SHORT[microcycle.status] ?? microcycle.status}
                </Badge>
                {microcycle.status === "PROPOSED" && (
                  <AcceptPlanButton microcycleId={microcycle.id} compact />
                )}
              </>
            ) : (
              <EnsureProposalButton compact />
            )}
          </div>
        </header>

        {/* Cuadros compactos del vestuario */}
        <div className="mx-auto max-w-5xl px-4 pb-2">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
            {pulse && (
              <>
                <div className="rounded-xl bg-white border border-cream-border px-2.5 py-1.5">
                  <p className="text-[9px] font-bold text-[#6c8070] uppercase tracking-wide flex items-center gap-1">
                    <HeartPulse className="w-3 h-3 text-[#6d28d9]" aria-hidden /> Inercia anímica
                  </p>
                  <p className="text-sm font-black text-peel leading-tight mt-0.5">
                    {pulse.moraleScore}<span className="text-[10px] text-[#6c8070]">/10</span>
                  </p>
                  <div className="h-1 rounded-full bg-cream-dark overflow-hidden mt-1">
                    <div className={`h-full ${gaugeColor(pulse.moraleScore)}`} style={{ width: `${pulse.moraleScore * 10}%` }} />
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-cream-border px-2.5 py-1.5">
                  <p className="text-[9px] font-bold text-[#6c8070] uppercase tracking-wide flex items-center gap-1">
                    <Dumbbell className="w-3 h-3 text-[#8a6206]" aria-hidden /> Fatiga grupal
                  </p>
                  <p className={`text-sm font-black leading-tight mt-0.5 ${pulse.fatigueScore >= 7 ? "text-[#b4232a]" : "text-peel"}`}>
                    {pulse.fatigueScore >= 7 ? "Carga alta" : "Controlada"}
                  </p>
                  <div className="h-1 rounded-full bg-cream-dark overflow-hidden mt-1">
                    <div className={`h-full ${gaugeColor(pulse.fatigueScore)}`} style={{ width: `${pulse.fatigueScore * 10}%` }} />
                  </div>
                </div>
              </>
            )}
            <div className="rounded-xl bg-white border border-cream-border px-2.5 py-1.5">
              <p className="text-[9px] font-bold text-[#6c8070] uppercase tracking-wide flex items-center gap-1">
                <Trophy className="w-3 h-3 text-brand-600" aria-hidden /> Último partido
              </p>
              {lastMatch ? (
                <p className="text-sm font-black text-peel leading-tight mt-0.5 truncate">
                  {lastMatch.goalsFor ?? 0} - {lastMatch.goalsAgainst ?? 0}
                  <span className="ml-1 text-[10px] font-semibold text-[#6c8070]">vs {lastMatch.opponent}</span>
                </p>
              ) : (
                <p className="text-sm font-black text-[#6c8070] leading-tight mt-0.5">Sin partidos aún</p>
              )}
              {lastMatch && (
                <p className="text-[10px] text-[#8a9a8d] mt-0.5 truncate">{lastMatch.isHome ? "En casa" : "A domicilio"}</p>
              )}
            </div>
            <div className="rounded-xl bg-white border border-cream-border px-2.5 py-1.5">
              <p className="text-[9px] font-bold text-[#6c8070] uppercase tracking-wide flex items-center gap-1">
                <MapPin className="w-3 h-3 text-[#5d7263]" aria-hidden /> Próximo rival
              </p>
              {nextMatch ? (
                <>
                  <p className="text-sm font-black text-peel leading-tight mt-0.5 truncate">vs {nextMatch.opponent}</p>
                  <p className="text-[10px] text-[#8a9a8d] mt-0.5 truncate">
                    {format(nextMatch.kickoffAt, "EEE d · HH:mm'h'", { locale: es })} · {nextMatch.isHome ? "En casa" : "A domicilio"}
                  </p>
                </>
              ) : (
                <p className="text-sm font-black text-[#6c8070] leading-tight mt-0.5">Por definir</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================= SCROLL: plan de la semana ================= */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-5xl px-4 py-3 space-y-2.5">

          {!microcycle ? (
            <div className="rounded-3xl border border-dashed border-cream-border-strong bg-white/70 px-6 py-10 text-center space-y-3">
              <Sparkles className="w-10 h-10 text-[#8a6206] mx-auto" aria-hidden />
              <p className="text-lg font-bold text-peel">
                El motor no tiene propuesta cocinada para esta semana
              </p>
              <p className="text-sm text-[#5d7263] max-w-md mx-auto">
                Toca «Cocinar propuesta» arriba: cocinamos el microciclo a partir
                del último partido y del pulso del vestuario.
              </p>
            </div>
          ) : (
            <>
              {/* ---------- Microciclo: directrices + diagnóstico (compacto) ---------- */}
              <section className="rounded-2xl border border-cream-border bg-white px-3 py-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-black uppercase tracking-wide text-[#6c8070]">
                    Microciclo · semana del {format(weekStart, "d MMM", { locale: es })}
                  </p>
                  {latestRun && (
                    <span className="text-[10px] font-semibold text-[#8a9a8d] shrink-0">
                      motor {latestRun.version}{latestRun.durationMs != null && ` · ${latestRun.durationMs} ms`}
                    </span>
                  )}
                </div>
                {microcycle.tacticalDirectives.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl bg-cream-dark/70 px-2.5 py-1.5">
                    <Shield className="w-3.5 h-3.5 text-brand-600 mt-0.5 shrink-0" aria-hidden />
                    <p className="text-[13px] font-semibold text-peel leading-snug">{d}</p>
                  </div>
                ))}
                {microcycle.diagnosisSummary && (
                  <p className="text-xs text-[#5d7263] leading-snug">
                    <span className="font-semibold text-[#3d5844]">Diagnóstico del motor: </span>
                    {microcycle.diagnosisSummary}
                  </p>
                )}
              </section>

              {/* ---------- Qué falló (plegado) ---------- */}
              {microcycle.issues.length > 0 && (
                <details className="group rounded-2xl border border-cream-border bg-white overflow-hidden">
                  <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-2 hover:bg-cream-dark/40">
                    <p className="text-[13px] font-bold text-peel flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-[#8a6206]" aria-hidden />
                      Qué falló ({microcycle.issues.length})
                    </p>
                    <ChevronDown className="w-4 h-4 text-[#8a9a8d] transition-transform group-open:rotate-180 shrink-0" aria-hidden />
                  </summary>
                  <div className="px-3 pb-2.5 space-y-1.5">
                    {microcycle.issues.map((issue) => {
                      const chip = KIND_CHIP[issue.kind] ?? KIND_CHIP.TACTICAL;
                      const Icon = chip.icon;
                      return (
                        <div key={issue.id} className="rounded-xl border border-cream-border bg-cream-dark/60 px-2.5 py-1.5 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className={`rounded-full text-[10px] px-2 py-0 ${chip.cls}`}>
                              <Icon className="w-2.5 h-2.5 mr-1" aria-hidden />
                              {chip.label}
                            </Badge>
                            {issue.phase && (
                              <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0 bg-white text-[#3d5844] border-cream-border-strong">
                                {PHASE_LABEL[issue.phase] ?? issue.phase}
                              </Badge>
                            )}
                            <span className="text-[10px] text-[#6c8070] flex items-center gap-0.5" title={`Severidad ${issue.severity}/5`}>
                              {Array.from({ length: 5 }).map((_, s) => (
                                <AlertTriangle
                                  key={s}
                                  className={`w-2.5 h-2.5 ${s < issue.severity ? "text-[#8a6206]" : "text-[#b9b49c]"}`}
                                  aria-hidden
                                />
                              ))}
                            </span>
                          </div>
                          <p className="text-xs text-[#3d5844] leading-snug">{issue.evidence}</p>
                          {issue.subPrinciple && (
                            <p className="text-[10px] text-[#6c8070]">Subprincipio: {issue.subPrinciple.name}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}

              {/* ---------- Tareas de entrenamiento del DÍA ---------- */}
              {todaySession ? (
                <section className="rounded-2xl border border-emerald-500/30 bg-white overflow-hidden" aria-label="Tareas de entrenamiento del día">
                  <div className="bg-brand-600/10 border-b border-emerald-500/30 px-3 py-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-black uppercase tracking-wide text-brand-600 capitalize truncate">
                      {todaySession.label} · Tareas de entrenamiento del día
                    </p>
                    <p className="text-[11px] text-[#5d7263] shrink-0 flex items-center gap-1">
                      {todaySession.durationMin ? `${todaySession.durationMin}′` : "—"} · {todaySession.tasks.length} tareas
                    </p>
                  </div>
                  <div className="p-2 space-y-1.5">
                    {todaySession.objective && (
                      <p className="text-xs text-[#5d7263] px-1 pb-0.5 leading-snug">{todaySession.objective}</p>
                    )}
                    {todaySession.tasks.length === 0 && (
                      <p className="text-sm text-[#6c8070] px-1 py-2">Sesión libre — aún sin tareas asignadas.</p>
                    )}
                    {todaySession.tasks.map((st) => (
                      <div key={st.id} className="rounded-xl border border-cream-border bg-cream/60 px-2.5 py-1.5 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13px] font-bold text-peel leading-snug min-w-0">
                            <span className="text-brand-600 mr-1.5">{st.order}.</span>
                            {st.task.title}
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge variant="outline" className={`rounded-full text-[10px] px-2 py-0 ${INTENSITY_CHIP[st.task.intensity] ?? ""}`}>
                              {st.task.intensity}
                            </Badge>
                            <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0 bg-white text-[#3d5844] border-cream-border-strong">
                              {st.durationMin ?? st.task.durationMin}′
                            </Badge>
                          </div>
                        </div>
                        {st.task.objective && (
                          <p className="text-xs text-[#5d7263] leading-snug">{st.task.objective}</p>
                        )}
                        {(st.rationale || st.issue || st.task.rulesOfProvocation.length > 0 || (st.task.spaceLengthM && st.task.spaceWidthM)) && (
                          <details className="group/rt">
                            <summary className="text-[11px] font-bold text-brand-600 cursor-pointer list-none flex items-center gap-1 select-none w-fit">
                              Receta
                              <ChevronDown className="w-3 h-3 transition-transform group-open/rt:rotate-180" aria-hidden />
                            </summary>
                            <div className="pt-1 space-y-1">
                              <div className="flex flex-wrap gap-1.5 text-[10px] text-[#6c8070]">
                                {st.task.spaceLengthM && st.task.spaceWidthM && (
                                  <span className="rounded-md bg-cream-dark/85 px-1.5 py-0.5">
                                    Espacio {st.task.spaceLengthM}×{st.task.spaceWidthM} m
                                  </span>
                                )}
                                <span className="rounded-md bg-cream-dark/85 px-1.5 py-0.5 flex items-center gap-1">
                                  <Users className="w-2.5 h-2.5" aria-hidden />
                                  {st.task.playersMin}{st.task.playersMax ? `–${st.task.playersMax}` : ""}
                                </span>
                                {st.task.phases.map((ph) => (
                                  <span key={ph} className="rounded-md bg-cream-dark/85 px-1.5 py-0.5">
                                    {PHASE_LABEL[ph] ?? ph}
                                  </span>
                                ))}
                              </div>
                              {st.rationale && (
                                <p className="text-xs italic text-[#6c8070] border-l-2 border-emerald-500/40 pl-2 leading-snug">
                                  Por qué esta tarea: {st.rationale}
                                </p>
                              )}
                              {st.issue && (
                                <p className="text-[11px] text-[#8a6206]/90 flex items-start gap-1 leading-snug">
                                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden />
                                  Corrige: {st.issue.evidence}
                                </p>
                              )}
                              {st.task.rulesOfProvocation.length > 0 && (
                                <p className="text-[10px] text-[#6c8070] leading-snug">
                                  Reglas: {st.task.rulesOfProvocation.join(" · ")}
                                </p>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                sessions.length > 0 && (
                  <p className="rounded-2xl border border-dashed border-cream-border-strong bg-white/70 px-3 py-2 text-xs text-[#6c8070] text-center">
                    Hoy no hay sesión programada — la semana sigue abajo.
                  </p>
                )
              )}

              {/* ---------- Resto de días (filas compactas plegadas) ---------- */}
              {otherSessions.map((session) => (
                <details key={session.id} className="group rounded-2xl border border-cream-border bg-white overflow-hidden">
                  <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-2 hover:bg-cream-dark/40">
                    <span className="text-[13px] font-bold text-peel capitalize truncate">
                      {session.label} · {format(session.date, "EEEE d", { locale: es })}
                    </span>
                    <span className="text-[11px] text-[#6c8070] shrink-0 flex items-center gap-1.5">
                      {session.durationMin ? `${session.durationMin}′` : "—"} · {session.tasks.length} tareas
                      <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" aria-hidden />
                    </span>
                  </summary>
                  <div className="px-3 pb-2.5 pt-2 border-t border-cream-border/60 space-y-1.5">
                    {session.objective && (
                      <p className="text-xs text-[#5d7263] leading-snug">{session.objective}</p>
                    )}
                    {session.tasks.length === 0 && (
                      <p className="text-sm text-[#6c8070]">Sesión libre — aún sin tareas asignadas.</p>
                    )}
                    {session.tasks.map((st) => (
                      <div key={st.id} className="rounded-xl bg-cream-dark/60 px-2.5 py-1.5 flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-peel leading-snug min-w-0">
                          <span className="text-brand-600 mr-1">{st.order}.</span>
                          {st.task.title}
                        </p>
                        <span className="text-[10px] text-[#6c8070] shrink-0 flex items-center gap-1">
                          {st.task.intensity} · {st.durationMin ?? st.task.durationMin}′
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}

              {/* ---------- Por qué este plan (plegado) ---------- */}
              {latestRun && (
                <details className="group rounded-2xl border border-cream-border bg-white overflow-hidden">
                  <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-2 hover:bg-cream-dark/40">
                    <p className="text-[13px] font-bold text-peel flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#8a6206]" aria-hidden />
                      Por qué este plan
                    </p>
                    <ChevronDown className="w-4 h-4 text-[#8a9a8d] transition-transform group-open:rotate-180 shrink-0" aria-hidden />
                  </summary>
                  <div className="px-3 pb-2.5 space-y-1.5">
                    {latestRun.trigger && (
                      <p className="text-[11px] text-[#8a9a8d] flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3" aria-hidden />
                        {TRIGGER_LABEL[latestRun.trigger] ?? latestRun.trigger}
                      </p>
                    )}
                    {runPrescriptions.length > 0 ? (
                      runPrescriptions.map((p, i) => (
                        <div key={i} className="rounded-xl border border-emerald-500/20 bg-brand-600/5 px-2.5 py-1.5 flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-brand-600/15 text-brand-600 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-peel leading-snug">
                              {p.taskTitle}
                              {p.sessionLabel && (
                                <span className="ml-1.5 text-[10px] font-semibold text-brand-600">{p.sessionLabel}</span>
                              )}
                            </p>
                            <p className="text-[11px] text-[#5d7263] leading-snug mt-0.5">{p.rationale}</p>
                            {p.relevance != null && (
                              <p className="text-[10px] text-[#6c8070] mt-0.5">
                                {p.relevance === 3 ? "Núcleo" : p.relevance === 2 ? "Refuerza" : "Apoyo"}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-[#6c8070]">
                        El motor no encontró tareas conectadas en la receta para los hallazgos de esta semana.
                      </p>
                    )}
                    {runDiscarded.length > 0 && (
                      <details className="group/dc rounded-xl border border-cream-border bg-cream-dark/60 overflow-hidden">
                        <summary className="cursor-pointer list-none px-2.5 py-1.5 text-[11px] font-semibold text-[#5d7263] flex items-center justify-between hover:text-[#2a4630]">
                          Candidatas descartadas ({runDiscarded.length})
                          <ChevronDown className="w-3 h-3 transition-transform group-open/dc:rotate-180" aria-hidden />
                        </summary>
                        <div className="px-2.5 pb-2 space-y-1">
                          {runDiscarded.map((d, i) => (
                            <div key={i} className="rounded-lg bg-white/90 px-2 py-1 flex items-start justify-between gap-2">
                              <p className="text-[11px] text-[#3d5844] min-w-0 leading-snug">{d.taskTitle}</p>
                              <p className="text-[10px] text-[#6c8070] text-right shrink-0 leading-snug">{d.reason}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </details>
              )}

              {/* ---------- Plan cerrado: confirmación discreta ---------- */}
              {microcycle.status !== "PROPOSED" && (
                <p className="rounded-2xl border border-emerald-500/40 bg-brand-600/10 px-3 py-2 text-center text-[13px] font-bold text-brand-600">
                  {STATUS_CHIP[microcycle.status]?.label ?? microcycle.status}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
    </AppShell>
  );
}
