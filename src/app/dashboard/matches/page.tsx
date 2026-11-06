// ============================================================================
// PILAR 3 — PARTIDOS /dashboard/matches
// ----------------------------------------------------------------------------
// Punto de entrada del flujo exprés post-pitido. Cero fricción: los partidos
// con ingesta pendiente encabezan la lista con un anillo ámbar pulsante; un
// toque sobre la tarjeta abre la ingesta de 3 pasos.
// ============================================================================
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AppNav } from "@/components/dashboard/app-nav";
import { SEMAPHORE_META } from "@/lib/taxonomy";
import { requireTenantContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const { db, team } = await requireTenantContext();
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

  return (
    <main className="min-h-screen bg-zinc-950 pb-28">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <p className="text-xs text-zinc-500 leading-tight truncate">Pilar 3 · {team.name}</p>
          <h1 className="text-2xl font-black text-zinc-50 leading-tight">Partidos</h1>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 space-y-6 pt-5">
        {/* ---------- Ingesta pendiente (encabeza SIEMPRE) ---------- */}
        {pending.length > 0 && (
          <section aria-labelledby="pending-title" className="space-y-3">
            <h2 id="pending-title" className="text-sm font-black uppercase tracking-widest text-amber-300 flex items-center gap-2">
              <TriangleAlert className="w-4 h-4" aria-hidden />
              Ingesta pendiente · regístrala en menos de 3 min
            </h2>
            {pending.map((m) => (
              <Link
                key={m.id}
                href={`/dashboard/match?g=${m.id}`}
                className="block rounded-3xl border-2 border-amber-500/50 bg-amber-500/5 p-5 transition hover:border-amber-400 active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-black text-zinc-50 truncate">
                      {m.isHome ? "vs" : "@"} {m.opponent}
                    </p>
                    <p className="text-sm text-zinc-400">
                      {format(m.kickoffAt, "EEE d MMM · HH:mm'h'", { locale: es })}
                      {m.competition ? ` · ${m.competition}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="rounded-full bg-amber-500/15 text-amber-300 border-amber-500/40 font-bold animate-pulse">
                      Registrar ingesta
                    </Badge>
                    <ChevronRight className="w-5 h-5 text-amber-300" aria-hidden />
                  </div>
                </div>
              </Link>
            ))}
          </section>
        )}

        {/* ---------- Próximos ---------- */}
        {upcoming.length > 0 && (
          <section aria-labelledby="upcoming-title" className="space-y-3">
            <h2 id="upcoming-title" className="text-sm font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <Clock className="w-4 h-4" aria-hidden /> Próximos
            </h2>
            {upcoming.map((m) => (
              <Link
                key={m.id}
                href={`/dashboard/match?g=${m.id}`}
                className="block rounded-3xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600 active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-black text-zinc-50 truncate">
                      {m.isHome ? "vs" : "@"} {m.opponent}
                    </p>
                    <p className="text-sm text-zinc-400 flex items-center gap-2 flex-wrap">
                      <span>{format(m.kickoffAt, "EEE d MMM · HH:mm'h'", { locale: es })}</span>
                      {m.competition && <span className="text-zinc-600">· {m.competition}</span>}
                      {m.location && (
                        <span className="text-zinc-600 inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" aria-hidden /> {m.location}
                        </span>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-600 shrink-0" aria-hidden />
                </div>
              </Link>
            ))}
          </section>
        )}

        {/* ---------- Analizados ---------- */}
        <section aria-labelledby="analyzed-title" className="space-y-3">
          <h2 id="analyzed-title" className="text-sm font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" aria-hidden /> Analizados
          </h2>
          {analyzed.length === 0 && (
            <p className="rounded-3xl border border-dashed border-zinc-800 px-6 py-8 text-center text-zinc-500 text-sm">
              Aún no hay partidos con ingesta completada. Cuando juegues, el
              registro aparecerá aquí con su semáforo.
            </p>
          )}
          {analyzed.map((m) => {
            const sem = SEMAPHORE_META[m.report?.sensation ?? "AMBER"];
            return (
              <Link
                key={m.id}
                href={`/dashboard/match?g=${m.id}`}
                className="block rounded-3xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600 active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full shrink-0 ${sem.dot}`} title={`Sensación: ${sem.label}`} aria-label={`Sensación ${sem.label}`} />
                    <div className="min-w-0">
                      <p className="text-base font-bold text-zinc-100 truncate">
                        {m.isHome ? "vs" : "@"} {m.opponent}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {format(m.kickoffAt, "d MMM · HH:mm'h'", { locale: es })}
                        {m.competition ? ` · ${m.competition}` : ""}
                      </p>
                    </div>
                  </div>
                  <p className="text-2xl font-black text-zinc-50 shrink-0" aria-label={`Resultado ${m.goalsFor}-${m.goalsAgainst}`}>
                    {m.goalsFor ?? 0}-{m.goalsAgainst ?? 0}
                  </p>
                </div>
              </Link>
            );
          })}
        </section>
      </div>

      <AppNav active="matches" />
    </main>
  );
}
