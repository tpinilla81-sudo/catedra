"use client";

// ============================================================================
// PILAR 1 — VISTA BIBLIOTECA (Modo Vestuario, táctil)
// ----------------------------------------------------------------------------
// Contenedor con estadísticas de la biblioteca + pestañas Taxonomía / Tareas.
// El detalle de tarea y su editor viven aquí arriba: ambas pestañas pueden
// abrirlos (conexión bidireccional subprincipio ↔ tarea sin recargar nada).
// ============================================================================

import { useMemo, useState } from "react";
import { BookOpen, GitBranch, Landmark, Network, Plus, Users } from "lucide-react";
import { PHASE_ORDER } from "@/lib/taxonomy";
import type { LibraryData, TaskCard } from "@/components/library/types";
import { TaskDetailSheet, TasksTab } from "@/components/library/tasks-tab";
import { TaxonomyTab } from "@/components/library/taxonomy-tab";
import { TaskEditor } from "@/components/library/task-editor";

function StatCard({
  label,
  value,
  hint,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="rounded-3xl bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className={`w-3.5 h-3.5 ${accent}`} aria-hidden />}
        <p className="text-xs font-semibold text-zinc-400 tracking-wide">{label}</p>
      </div>
      <p className={`text-2xl font-black mt-1 ${accent}`}>{value}</p>
      {hint && <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">{hint}</p>}
    </div>
  );
}

export function LibraryView({ data }: { data: LibraryData }) {
  const [tab, setTab] = useState<"taxonomy" | "tasks">("taxonomy");
  const [taskDetail, setTaskDetail] = useState<TaskCard | null>(null);
  const [taskEditor, setTaskEditor] = useState<{ task: TaskCard | null } | null>(null);

  const stats = useMemo(() => {
    const catedralSP = data.subprinciples.filter((s) => s.clubId === null).length;
    const clubSP = data.subprinciples.length - catedralSP;
    const catedralT = data.tasks.filter((t) => t.clubId === null).length;
    const clubT = data.tasks.length - catedralT;
    const recipes = data.tasks.reduce((acc, t) => acc + t.recipes.length, 0);
    const phasesCovered = PHASE_ORDER.filter((p) =>
      data.subprinciples.some((s) => s.phase === p),
    ).length;
    return { catedralSP, clubSP, catedralT, clubT, recipes, phasesCovered };
  }, [data]);

  const openNewTask = () => setTaskEditor({ task: null });
  const openEditTask = (t: TaskCard) => {
    setTaskDetail(null);
    setTaskEditor({ task: t });
  };

  return (
    <div>
      {/* ---------- Cabecera ---------- */}
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 leading-tight truncate flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-violet-300" aria-hidden />
              Pilar 1 · Biblioteca de Sabiduría
            </p>
            <h1 className="text-2xl font-black text-zinc-50 leading-tight">La Cátedra</h1>
          </div>
          <button
            onClick={openNewTask}
            className="shrink-0 min-h-[44px] px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-sm transition flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            <Plus className="w-4 h-4" aria-hidden /> Tarea
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 space-y-5 pt-5">
        {/* ---------- Estadísticas de la biblioteca ---------- */}
        <section
          aria-label="Resumen de la biblioteca"
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          <StatCard
            label="SUBPRINCIPIOS"
            value={data.subprinciples.length}
            hint={`${stats.catedralSP} Cátedra · ${stats.clubSP} club`}
            accent="text-zinc-50"
            icon={GitBranch}
          />
          <StatCard
            label="TAREAS"
            value={data.tasks.length}
            hint={`${stats.catedralT} Cátedra · ${stats.clubT} club`}
            accent="text-zinc-50"
            icon={BookOpen}
          />
          <StatCard
            label="RECETAS"
            value={stats.recipes}
            hint="conexiones ponderadas 1-3"
            accent="text-amber-300"
            icon={Network}
          />
          <StatCard
            label="FASES CUBIERTAS"
            value={`${stats.phasesCovered}/5`}
            hint="fases con taxonomía"
            accent="text-emerald-300"
            icon={Users}
          />
        </section>

        {/* ---------- Pestañas ---------- */}
        <section aria-label="Secciones de la biblioteca">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-3xl bg-zinc-900 border border-zinc-800">
            {(
              [
                { key: "taxonomy", label: "Taxonomía", icon: GitBranch, count: data.subprinciples.length },
                { key: "tasks", label: "Tareas", icon: BookOpen, count: data.tasks.length },
              ] as const
            ).map((t) => {
              const active = tab === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-pressed={active}
                  className={`min-h-[48px] rounded-2xl px-3 py-2 text-sm font-black transition flex items-center justify-center gap-2 ${
                    active
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                      : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden />
                  {t.label}
                  <span className={`text-xs font-black ${active ? "text-emerald-400/80" : "text-zinc-600"}`}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ---------- Contenido de la pestaña activa ---------- */}
        {tab === "taxonomy" ? (
          <TaxonomyTab
            data={data}
            onOpenTask={(t) => {
              setTaskDetail(t);
            }}
            onEditTask={openEditTask}
            onNewTask={openNewTask}
          />
        ) : (
          <TasksTab
            data={data}
            onOpenTask={(t) => setTaskDetail(t)}
            onNewTask={openNewTask}
          />
        )}
      </div>

      {/* ---------- Hoja de detalle de tarea (compartida entre pestañas) ---------- */}
      <TaskDetailSheet
        task={taskDetail}
        onClose={() => setTaskDetail(null)}
        onEdit={openEditTask}
      />

      {/* ---------- Editor de ficha de tarea (crear / editar) ---------- */}
      {taskEditor && (
        <TaskEditor
          task={taskEditor.task}
          subprinciples={data.subprinciples}
          onClose={() => setTaskEditor(null)}
        />
      )}
    </div>
  );
}
