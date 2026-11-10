// ============================================================================
// PILAR 3 — PIZARRA TÁCTICA GLOBAL /dashboard/pizarra — STICKY MASTER
// ----------------------------------------------------------------------------
// Mock del míster: la pizarra sale del detalle del partido y pasa a ser una
// pestaña GLOBAL al mismo nivel que Hoy, Biblioteca, Plantilla y Partidos.
// Desde aquí se firma la pizarra en directo de CUALQUIER sesión (vídeo de la
// grabación, directo o análisis previo) y hay campo libre de preparación
// (pizarra previa, sin sellar). Anatomía ultra-compacta: zona FIJA arriba y
// contenido con scroll propio.
// ============================================================================
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronRight, Presentation, Radio } from "lucide-react";
import { AppShell } from "@/components/dashboard/app-shell";
import { PrepWhiteboard, type PrepLineupData } from "@/components/match/prep-whiteboard";
import { requireTenantContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PizarraPage() {
  const { db, team, user } = await requireTenantContext();
  const now = new Date();

  const [matches, players] = await Promise.all([
    db.match.findMany({
      where: { teamId: team.id },
      orderBy: { kickoffAt: "desc" },
      take: 8,
    }),
    db.player.findMany({
      where: { teamId: team.id, isActive: true },
      orderBy: [{ shirtNumber: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        shirtNumber: true,
      },
    }),
  ]);

  // Alineaciones confirmadas (isStarter=true) de esos partidos — mock del
  // míster: "Alineación Sincronizada Automáticamente" con la pizarra.
  const starterEvals = matches.length
    ? await db.liveMatchEvaluation.findMany({
        where: {
          matchId: { in: matches.map((m) => m.id) },
          isStarter: true,
        },
        include: {
          player: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              shirtNumber: true,
              primaryPosition: true,
            },
          },
        },
        orderBy: { timestamp: "asc" },
      })
    : [];

  const lineups: PrepLineupData[] = matches
    .map((m) => ({
      matchId: m.id,
      label: `${m.isHome ? "vs" : "@"} ${m.opponent} · ${format(m.kickoffAt, "d MMM", { locale: es })}`,
      starters: starterEvals
        .filter((e) => e.matchId === m.id)
        .map((e) => ({
          id: e.player.id,
          firstName: e.player.firstName,
          lastName: e.player.lastName,
          shirtNumber: e.player.shirtNumber,
          position: e.player.primaryPosition,
        })),
    }))
    .filter((l) => l.starters.length > 0);

  return (
    <AppShell active="pizarra" userName={user.name} role={user.role}>
      <main className="h-full flex flex-col overflow-hidden bg-cream">
        {/* ================= ZONA FIJA (sticky master) ================= */}
        <div className="flex-none border-b border-cream-border bg-white/85 backdrop-blur z-10">
          <header className="mx-auto max-w-5xl px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-brand-600/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Presentation className="w-5 h-5 text-brand-600" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-[#6c8070] leading-tight truncate">Pilar 3 · {team.name}</p>
                <h1 className="text-base font-black text-peel leading-tight truncate">Pizarra Táctica</h1>
              </div>
            </div>
            <span
              className="shrink-0 text-[10px] font-bold uppercase tracking-wide rounded-full bg-brand-600/15 text-brand-600 border border-emerald-500/40 px-2.5 py-1"
              title="Herramienta disponible para cualquier sesión"
            >
              Herramienta activa
            </span>
          </header>
        </div>

        {/* ================= SCROLL: sesiones + pizarra libre ================= */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-5xl px-4 py-3 space-y-4">

            {/* ---------- Sesiones con pizarra en directo ---------- */}
            <section aria-labelledby="sessions-title" className="space-y-2">
              <h2
                id="sessions-title"
                className="text-[11px] font-black uppercase tracking-widest text-[#6c8070] flex items-center gap-1.5"
              >
                <Radio className="w-3.5 h-3.5 text-brand-600" aria-hidden />
                Sesiones con pizarra en directo · vídeo, directo o análisis
              </h2>
              {matches.length === 0 && (
                <p className="rounded-2xl border border-dashed border-cream-border px-5 py-6 text-center text-[#6c8070] text-sm">
                  Crea un partido en la pestaña Partidos y su pizarra aparecerá aquí.
                </p>
              )}
              {matches.map((m) => {
                const isUpcoming = m.kickoffAt >= now;
                return (
                  <Link
                    key={m.id}
                    href={`/dashboard/match/live?g=${m.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-cream-border bg-white px-3 py-2.5 transition hover:border-brand-600/50 active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${isUpcoming ? "bg-amber-400" : "bg-emerald-500"}`}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-peel truncate">
                          {m.isHome ? "vs" : "@"} {m.opponent}
                        </p>
                        <p className="text-[11px] text-[#6c8070]">
                          {format(m.kickoffAt, "EEE d MMM · HH:mm'h'", { locale: es })}
                          {m.competition ? ` · ${m.competition}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${
                          isUpcoming
                            ? "bg-amber-500/15 text-[#8a6206] border-amber-500/40"
                            : "bg-brand-600/15 text-brand-600 border-emerald-500/40"
                        }`}
                      >
                        {isUpcoming ? "Previa · Directo" : "Análisis"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-[#8a9a8d]" aria-hidden />
                    </div>
                  </Link>
                );
              })}
            </section>

            {/* ---------- Pizarra libre (preparación, sin sellar) ---------- */}
            <section aria-labelledby="prep-title" className="space-y-2">
              <h2
                id="prep-title"
                className="text-[11px] font-black uppercase tracking-widest text-[#6c8070]"
              >
                Pizarra libre · preparación (nada se sella aquí)
              </h2>
              <p className="text-xs text-[#6c8070] leading-snug">
                Campo libre para preparar y explicar: VUELCA el once confirmado de cualquier
                partido (alineación sincronizada), saca las fichas de la plantilla real, los
                rivales y el balón y arrástralos con el dedo o el ratón (el balón soltado junto a
                un jugador queda a su pie); también puedes tocar el campo para colocar eventos del
                vocabulario de la ingesta. Para registrar hechos contra el vídeo y el reloj, abre
                la pizarra en directo del partido.
              </p>
              <div className="rounded-2xl border border-cream-border bg-white/70 p-3">
                <PrepWhiteboard
                  players={players.map((p) => ({
                    id: p.id,
                    firstName: p.firstName,
                    lastName: p.lastName,
                    shirtNumber: p.shirtNumber,
                  }))}
                  lineups={lineups}
                />
              </div>
            </section>

          </div>
        </div>
      </main>
    </AppShell>
  );
}
