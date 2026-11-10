// ============================================================================
// APP NAV — Barra de navegación inferior en Modo Vestuario
// ----------------------------------------------------------------------------
// Táctil (≥ 60px de alto por pestaña), fija abajo, con badge de "ingesta
// pendiente" en Partidos. Server Component: el badge se calcula en el servidor.
// ============================================================================
import Link from "next/link";
import { BookOpen, CalendarDays, Home, Users } from "lucide-react";
import { requireTenantContext } from "@/lib/session";

const ITEMS = [
  { key: "today", href: "/dashboard/today", label: "Hoy", icon: Home },
  { key: "library", href: "/dashboard/library", label: "Biblioteca", icon: BookOpen },
  { key: "players", href: "/dashboard/players", label: "Plantilla", icon: Users },
  { key: "matches", href: "/dashboard/matches", label: "Partidos", icon: CalendarDays },
] as const;

export type AppNavKey = (typeof ITEMS)[number]["key"];

export async function AppNav({ active }: { active: AppNavKey }) {
  const { db, team } = await requireTenantContext();

  // Partidos ya jugados cuya ingesta sigue pendiente (kickoff pasado, sin ANALYZED)
  const pendingIngest = await db.match.count({
    where: {
      teamId: team.id,
      status: { not: "ANALYZED" },
      kickoffAt: { lt: new Date() },
    },
  });

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed bottom-0 inset-x-0 z-30 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto max-w-5xl grid grid-cols-4">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 min-h-[60px] py-2 text-xs font-semibold transition-colors ${
                isActive
                  ? "text-emerald-400 bg-emerald-500/10"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden />
              {item.label}
              {item.key === "matches" && pendingIngest > 0 && (
                <span
                  className="absolute top-2 right-1/2 translate-x-5 flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white"
                  title={`${pendingIngest} ingesta${pendingIngest > 1 ? "s" : ""} pendiente${pendingIngest > 1 ? "s" : ""}`}
                >
                  {pendingIngest}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
