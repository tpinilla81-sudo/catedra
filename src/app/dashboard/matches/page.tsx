// ============================================================================
// PILAR 3 — PARTIDOS /dashboard/matches — STICKY MASTER (Modo Vestuario)
// ----------------------------------------------------------------------------
// Anatomía ultra-compacta: zona FIJA arriba (cabecera) y calendario con scroll
// propio debajo. El próximo partido manda en una tarjeta destacada (VS), los
// siguientes van en filas compactas y el historial analizados concentrado.
// El flujo exprés post-pitido sigue intacto: los partidos con ingesta
// pendiente encabezan SIEMPRE la lista con anillo ámbar pulsante.
// ============================================================================
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  Radio,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/dashboard/app-shell";
import { NewMatchDialog } from "@/components/match/new-match-dialog";
import { mondayOf } from "@/lib/utils/dates";
import { SEMAPHORE_META } from "@/lib/taxonomy";
import { requireTenantContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const { db, team, user } = await requireTenantContext();
  const now = new Date();

  const matches = await db.match.findMany({
    where: { teamId: team.id },
    orderBy: { kickoffAt: "desc" },
    take: 15,
    include: { report: { select: { id: true, sensation: true } } },
  });

  const pending = matches.filter(
    (m) => m.kickoffAt < now && m.status !== "ANALYZED",
  );
  const upcoming = matches
    .filter((m) => m.kickoffAt >= now)
    .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
  const analyzed = matches
    .filter((m) => m.status === "ANALYZED")
    .slice(0, 5);

  // El partido destacado: el próximo. Si cae dentro de la semana en curso
  // (lunes a domingo de Madrid), la etiqueta manda "Esta semana".
  const featured = upcoming[0] ?? null;
  const weekEnd = mondayOf(new Date()).getTime() + 7 * 24 * 60 * 60 * 1000;
  const featuredLabel =
    featured && featured.kickoffAt.getTime() < weekEnd ? "Partido de esta semana" : "Próximo partido";

  return (
    <AppShell
      active="matches"
      userName={user.name}
      role={user.role}
      pendingIngest={pending.length}
    >
    <main className="h-full flex flex-col overflow-hidden bg-cream">
      {/* ================= ZONA FIJA (sticky master) ================= */}
      <div className="flex-none border-b border-cream-border bg-white/85 backdrop-blur z-10">
        <header className="mx-auto max-w-5xl px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-brand-600/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5 text-brand-600" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#6c8070] leading-tight truncate">Pilar 3 · {team.name}</p>
              <h1 className="text-base font-black text-peel leading-tight truncate">Partidos</h1>
            </div>
          </div>
          <NewMatchDialog />
        </header>
      </div>

      {/* ================= SCROLL: calendario ================= */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-5xl px-4 py-3 space-y-3">

          {/* ---------- Ingesta pendiente (encabeza SIEMPRE) ---------- */}
          {pending.length > 0 && (
            <section aria-labelledby="pending-title" className="space-y-2">
              <h2 id="pending-title" className="text-[11px] font-black uppercase tracking-widest text-[#8a6206] flex items-center gap-1.5">
                <TriangleAlert className="w-3.5 h-3.5" aria-hidden />
                Ingesta pendiente · regístrala en menos de 3 min
              </h2>
              {pending.map((m) => (
                <div key={m.id} className="flex flex-col sm:flex-row gap-2">
                  <Link
                    href={`/dashboard/match?g=${m.id}`}
                    className="block flex-1 rounded-2xl border-2 border-amber-500/50 bg-amber-500/5 p-3 transition hover:border-amber-400 active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-peel truncate">
                          {m.isHome ? "vs" : "@"} {m.opponent}
                        </p>
                        <p className="text-[11px] text-[#5d7263]">
                          {format(m.kickoffAt, "EEE d MMM · HH:mm'h'", { locale: es })}
                          {m.competition ? ` · ${m.competition}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="rounded-full bg-amber-500/15 text-[#8a6206] border-amber-500/40 font-bold text-[10px] animate-pulse">
                          Registrar ingesta
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-[#8a6206]" aria-hidden />
                      </div>
                    </div>
                  </Link>
                  <Link
                    href={`/dashboard/match/live?g=${m.id}`}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-brand-600/50 bg-brand-600/10 px-4 py-2.5 sm:py-0 text-xs font-bold text-brand-600 transition hover:bg-brand-600/20 active:scale-[0.99]"
                  >
                    <Radio className="w-3.5 h-3.5" aria-hidden /> Pizarra en directo
                  </Link>
                </div>
              ))}
            </section>
          )}

          {/* ---------- Partido destacado (VS, estilo pizarra) ---------- */}
          {featured && (
            <Link
              href={`/dashboard/match?g=${featured.id}`}
              className="block rounded-2xl border-2 border-brand-600/40 bg-gradient-to-r from-brand-600/10 to-white px-3 py-2.5 transition hover:border-brand-600/60 active:scale-[0.99]"
            >
              <div className="flex justify-between items-center mb-1.5 gap-2">
                <span className="text-[9px] bg-brand-600 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wide shrink-0">
                  {featuredLabel}
                </span>
                <span className="text-[10px] text-brand-600 font-bold text-right">
                  {format(featured.kickoffAt, "EEE d MMM · HH:mm'h'", { locale: es })} · {featured.isHome ? "En casa" : "A domicilio"}
                </span>
              </div>
              <div className="flex justify-between items-center px-1 gap-2">
                <span className="text-sm font-black text-peel truncate">
                  {featured.isHome ? team.name : featured.opponent}
                </span>
                <span className="text-[10px] text-[#8a9a8d] font-black shrink-0">VS</span>
                <span className="text-sm font-black text-peel truncate text-right">
                  {featured.isHome ? featured.opponent : team.name}
                </span>
              </div>
              {(featured.competition || featured.location) && (
                <p className="text-[10px] text-[#6c8070] text-center mt-1 truncate">
                  {featured.competition}
                  {featured.competition && featured.location ? " · " : ""}
                  {featured.location}
                </p>
              )}
            </Link>
          )}

          {/* ---------- Otros próximos (filas compactas) ---------- */}
          {upcoming.length > 1 && (
            <section aria-labelledby="upcoming-title" className="space-y-1.5">
              <h2 id="upcoming-title" className="text-[11px] font-black uppercase tracking-widest text-[#6c8070] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" aria-hidden /> Otros próximos
              </h2>
              {upcoming.slice(1).map((m) => (
                <div key={m.id} className="flex items-stretch gap-2">
                  <Link
                    href={`/dashboard/match?g=${m.id}`}
                    className="flex-1 min-w-0 rounded-xl border border-cream-border bg-white px-3 py-2 transition hover:border-[#b9b49c] active:scale-[0.99] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-peel truncate">
                        {m.isHome ? "vs" : "@"} {m.opponent}
                      </p>
                      <p className="text-[10px] text-[#6c8070] flex items-center gap-1.5 flex-wrap">
                        <span>{format(m.kickoffAt, "EEE d MMM · HH:mm'h'", { locale: es })}</span>
                        {m.competition && <span className="text-[#8a9a8d]">· {m.competition}</span>}
                        {m.location && (
                          <span className="text-[#8a9a8d] inline-flex items-center gap-0.5">
                            <MapPin className="w-2.5 h-2.5" aria-hidden /> {m.location}
                          </span>
                        )}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#8a9a8d] shrink-0" aria-hidden />
                  </Link>
                  <Link
                    href={`/dashboard/match/live?g=${m.id}`}
                    className="flex items-center gap-1.5 rounded-xl border border-cream-border bg-cream-dark px-3 text-[11px] font-bold text-[#5d7263] transition hover:border-brand-600/50 hover:text-brand-600 active:scale-[0.99] shrink-0"
                    aria-label={`Pizarra en directo vs ${m.opponent}`}
                  >
                    <Radio className="w-3.5 h-3.5" aria-hidden />
                    <span className="hidden sm:inline">Directo</span>
                  </Link>
                </div>
              ))}
            </section>
          )}

          {/* ---------- Analizados (historial concentrado) ---------- */}
          <section aria-labelledby="analyzed-title" className="space-y-1.5">
            <h2 id="analyzed-title" className="text-[11px] font-black uppercase tracking-widest text-[#6c8070] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> Analizados
            </h2>
            {analyzed.length === 0 && (
              <p className="rounded-xl border border-dashed border-cream-border px-3 py-4 text-center text-[#6c8070] text-xs">
                Aún no hay partidos con ingesta completada. Cuando juegues, el
                registro aparecerá aquí con su semáforo.
              </p>
            )}
            {analyzed.map((m) => {
              const sem = SEMAPHORE_META[m.report?.sensation ?? "AMBER"];
              return (
                <div key={m.id} className="flex items-stretch gap-2">
                  <Link
                    href={`/dashboard/match?g=${m.id}`}
                    className="flex-1 min-w-0 flex items-center justify-between gap-2 rounded-xl border border-cream-border bg-white px-3 py-2 transition hover:border-[#b9b49c] active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sem.dot}`} title={`Sensación: ${sem.label}`} aria-label={`Sensación ${sem.label}`} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-peel truncate">
                          {m.isHome ? "vs" : "@"} {m.opponent}
                        </p>
                        <p className="text-[10px] text-[#6c8070]">
                          {format(m.kickoffAt, "d MMM · HH:mm'h'", { locale: es })}
                          {m.competition ? ` · ${m.competition}` : ""}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-black text-peel shrink-0" aria-label={`Resultado ${m.goalsFor}-${m.goalsAgainst}`}>
                      {m.goalsFor ?? 0}-{m.goalsAgainst ?? 0}
                    </p>
                  </Link>
                  <Link
                    href={`/dashboard/match/live?g=${m.id}`}
                    className="flex items-center gap-1.5 rounded-xl border border-cream-border bg-cream-dark px-3 text-[11px] font-bold text-[#5d7263] transition hover:border-brand-600/50 hover:text-brand-600 active:scale-[0.99] shrink-0"
                    aria-label={`Análisis en directo vs ${m.opponent}`}
                  >
                    <Radio className="w-3.5 h-3.5" aria-hidden />
                    <span className="hidden sm:inline">Análisis</span>
                  </Link>
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </main>
    </AppShell>
  );
}
