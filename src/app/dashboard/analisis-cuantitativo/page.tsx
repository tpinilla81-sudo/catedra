// ============================================================================
// ANÁLISIS CUANTITATIVO /dashboard/analisis-cuantitativo — aterrizaje
// (mock del míster: «Análisis Cuantitativo» — NUEVO elemento del sidebar,
// justo debajo de «Análisis Cualitativo»)
// ----------------------------------------------------------------------------
// El mock del sidebar define la ENTRADA; el contenido del módulo llegará con
// su mock específico. Mientras tanto la página no puede ser un 404 ni una
// hoja vacía: SSR honesto con los CONTADORES REALES del equipo (partidos,
// telemetría del tablón, fichas de rendimiento, tareas de la biblioteca) —
// la base cuantitativa que CATEDRA ya acumula — y el chip «Módulo en
// preparación». Paleta crema/verde de la casa.
// ============================================================================
import { AppShell } from "@/components/dashboard/app-shell";
import { requireTenantContext } from "@/lib/session";
import { BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AnalisisCuantitativoPage() {
  const { db, team, user } = await requireTenantContext();

  // Contadores REALES del equipo activo (una consulta por modelo, todo COUNT)
  const [matches, telemetry, evaluations, tasks] = await Promise.all([
    db.match.count({ where: { teamId: team.id } }),
    db.matchTelemetryEvent.count({ where: { teamId: team.id } }),
    db.playerEvaluation.count({ where: { teamId: team.id } }),
    db.task.count({ where: { OR: [{ clubId: team.clubId }, { clubId: null }] } }),
  ]);

  const stats: Array<{ key: string; label: string; value: number; hint: string }> = [
    { key: "partidos", label: "Partidos registrados", value: matches, hint: "Calendario del equipo" },
    { key: "telemetria", label: "Eventos de telemetría", value: telemetry, hint: "Tablón en directo (Pilar 3)" },
    { key: "evaluaciones", label: "Fichas de rendimiento", value: evaluations, hint: "Evaluaciones vigentes" },
    { key: "tareas", label: "Tareas en biblioteca", value: tasks, hint: "Club + Cátedra global" },
  ];

  return (
    <AppShell active="cuantitativo" userName={user.name} role={user.role}>
      <main className="h-full bg-cream overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6" data-testid="cuant-root">
          {/* Cabecera */}
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black text-peel tracking-tight" data-testid="cuant-title">
              MÉTODO // Análisis Cuantitativo
            </h1>
            <span
              className="rounded-xl border border-[#8a6206]/40 bg-[#8a6206]/10 px-2 py-1 text-[10px] font-black text-[#8a6206]"
              data-testid="cuant-chip"
            >
              Módulo en preparación
            </span>
          </div>
          <p className="mt-1.5 text-sm text-[#5d7263] leading-relaxed max-w-2xl">
            La herramienta cuantitativa del cuerpo técnico llegará con sus paneles propios. Esta es
            la radiografía de los datos que CATEDRA ya acumula del equipo: la materia prima con la
            que trabajará.
          </p>

          {/* Radiografía: contadores REALES del equipo */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {stats.map((s) => (
              <div
                key={s.key}
                data-testid={`cuant-stat-${s.key}`}
                className="rounded-2xl border border-cream-border bg-white px-4 py-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-[#6c8070] uppercase tracking-widest">
                    {s.label}
                  </p>
                  <BarChart3 className="w-4 h-4 text-brand-600 shrink-0" aria-hidden />
                </div>
                <p className="mt-1 text-3xl font-black text-peel font-mono" data-testid={`cuant-value-${s.key}`}>
                  {s.value}
                </p>
                <p className="text-[11px] text-[#8a9a8d] font-semibold">{s.hint}</p>
              </div>
            ))}
          </div>

          {/* Nota de estado */}
          <div className="mt-4 rounded-2xl border border-dashed border-cream-border-strong bg-white/70 px-4 py-3">
            <p className="text-xs text-[#5d7263] leading-relaxed">
              <b className="text-peel">¿Qué vivirá aquí?</b> Los paneles de datos objetivos del
              equipo — series temporales de telemetría, distribución de eventos por sección y por
              jugador, evolución de las notas de la Ficha de Rendimiento — cuando el mock del
              módulo defina su estructura exacta.
            </p>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
