"use client";

// ============================================================================
// PILAR 1 — VISTA BIBLIOTECA (Modo Vestuario, táctil) — STICKY MASTER
// ----------------------------------------------------------------------------
// Anatomía ultra-compacta: zona FIJA arriba (cabecera + cuadros pequeños de
// la biblioteca + pestañas) y el contenido (Taxonomía / Tareas) con scroll
// propio debajo. Sin scroll de página.
// El detalle de tarea y su editor viven aquí arriba: ambas pestañas pueden
// abrirlos (conexión bidireccional subprincipio ↔ tarea sin recargar nada).
// ============================================================================

import { useMemo, useState } from "react";
import { BookOpen, GitBranch, Landmark, ListTree, Network, Plus, ShieldCheck, Users } from "lucide-react";
import { PHASE_ORDER } from "@/lib/taxonomy";
import type { Role } from "@/types/auth";
import { canWriteCatedra, canWriteClubContent } from "@/utils/permissions";
import type { LibraryData, TaskCard } from "@/components/library/types";
import { TaskDetailSheet, TasksTab } from "@/components/library/tasks-tab";
import { TaxonomyTab } from "@/components/library/taxonomy-tab";
import { MasterTaxonomyTab } from "@/components/library/master-taxonomy-tab";
import { TaskEditor } from "@/components/library/task-editor";
import { UserMenu } from "@/components/hoy/user-menu";
import { TASK_FAMILY_COUNT } from "@/lib/task-taxonomy";

/** Cuadro pequeño estilo vestuario (zona fija) */
function MiniStat({
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
    <div className="rounded-xl bg-white border border-cream-border px-2.5 py-1.5">
      <p className="text-[9px] font-bold text-[#6c8070] uppercase tracking-wide flex items-center gap-1">
        {Icon && <Icon className={`w-3 h-3 ${accent}`} aria-hidden />}
        {label}
      </p>
      <p className={`text-sm font-black leading-tight mt-0.5 ${accent}`}>{value}</p>
      {hint && <p className="text-[9px] text-[#8a9a8d] mt-0.5 leading-tight truncate">{hint}</p>}
    </div>
  );
}

export function LibraryView({
  data,
  role,
  platform = false,
  userName,
}: {
  data: LibraryData;
  /** Rol de la sesión (guard server-side autoritativo; aquí solo pinta UI) */
  role: Role;
  /** true → modo Plataforma: gestión del contenido GLOBAL de la Cátedra */
  platform?: boolean;
  /** Nombre del usuario (solo modo plataforma, para el UserMenu) */
  userName?: string;
}) {
  const [tab, setTab] = useState<"taxonomy" | "tasks" | "maestra">("taxonomy");
  const [taskDetail, setTaskDetail] = useState<TaskCard | null>(null);
  const [taskEditor, setTaskEditor] = useState<{
    task: TaskCard | null;
    /** Familia preseleccionada al crear desde la Biblioteca Maestra */
    presetFamily?: string;
  } | null>(null);

  // RBAC de presentación: el guard real vive en cada Server Action.
  const canWrite = platform ? canWriteCatedra(role) : canWriteClubContent(role);

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

  const openNewTask = (familyId?: string) =>
    setTaskEditor({ task: null, presetFamily: familyId });
  const openEditTask = (t: TaskCard) => {
    setTaskDetail(null);
    setTaskEditor({ task: t });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ================= ZONA FIJA (sticky master) ================= */}
      <div className="flex-none border-b border-cream-border bg-white/85 backdrop-blur z-10">
        <header className="mx-auto max-w-5xl px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-brand-600/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5 text-brand-600" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#6c8070] leading-tight truncate flex items-center gap-1.5">
                Pilar 1 · Biblioteca de Sabiduría
                {platform && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/50 bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-black text-[#6d28d9]">
                    <ShieldCheck className="w-3 h-3" aria-hidden /> Gestión Plataforma
                  </span>
                )}
              </p>
              <h1 className="text-base font-black text-peel leading-tight truncate">La Cátedra</h1>
            </div>
          </div>
          {canWrite ? (
            <button
              onClick={() => openNewTask()}
              className="shrink-0 h-11 px-4 rounded-2xl bg-brand-600 hover:bg-brand text-white font-black text-sm transition flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <Plus className="w-4 h-4" aria-hidden /> Tarea
            </button>
          ) : (
            <span
              className="shrink-0 rounded-xl border border-cream-border bg-white px-3 py-1.5 text-[11px] font-bold text-[#6c8070]"
              title="Tu rol (Analista) es de solo lectura en la biblioteca"
            >
              Solo lectura
            </span>
          )}
          {platform && userName && <UserMenu userName={userName} role={role} />}
        </header>

        {/* Cuadros compactos de la biblioteca */}
        <div className="mx-auto max-w-5xl px-4 pb-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <MiniStat
              label="Subprincipios"
              value={data.subprinciples.length}
              hint={`${stats.catedralSP} Cátedra · ${stats.clubSP} club`}
              accent="text-peel"
              icon={GitBranch}
            />
            <MiniStat
              label="Tareas"
              value={data.tasks.length}
              hint={`${stats.catedralT} Cátedra · ${stats.clubT} club`}
              accent="text-peel"
              icon={BookOpen}
            />
            <MiniStat
              label="Recetas"
              value={stats.recipes}
              hint="conexiones ponderadas 1-3"
              accent="text-[#8a6206]"
              icon={Network}
            />
            <MiniStat
              label="Fases cubiertas"
              value={`${stats.phasesCovered}/5`}
              hint="fases con taxonomía"
              accent="text-brand-600"
              icon={Users}
            />
          </div>
        </div>

        {/* Pestañas (fijas, siempre a la vista) */}
        <div className="mx-auto max-w-5xl px-4 pb-2">
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-cream border border-cream-border">
            {(
              [
                { key: "taxonomy", label: "Taxonomía", icon: GitBranch, count: data.subprinciples.length },
                { key: "tasks", label: "Tareas", icon: BookOpen, count: data.tasks.length },
                { key: "maestra", label: "Maestra", icon: ListTree, count: TASK_FAMILY_COUNT },
              ] as const
            ).map((t) => {
              const active = tab === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-pressed={active}
                  className={`min-h-[44px] rounded-xl px-3 py-1.5 text-sm font-black transition flex items-center justify-center gap-2 ${
                    active
                      ? "bg-brand-600/15 text-brand-600 border border-emerald-500/40"
                      : "text-[#5d7263] hover:text-[#2a4630] border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden />
                  {t.label}
                  <span className={`text-xs font-black ${active ? "text-brand-600/90" : "text-[#8a9a8d]"}`}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================= SCROLL: pestaña activa ================= */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-5xl px-4 py-3">
          {tab === "taxonomy" ? (
            <TaxonomyTab
              data={data}
              canWrite={canWrite}
              platform={platform}
              onOpenTask={(t) => {
                setTaskDetail(t);
              }}
              onEditTask={openEditTask}
              onNewTask={openNewTask}
            />
          ) : tab === "maestra" ? (
            <MasterTaxonomyTab
              data={data}
              canWrite={canWrite}
              onOpenTask={(t) => setTaskDetail(t)}
              onEditTask={openEditTask}
              onNewTask={openNewTask}
            />
          ) : (
            <TasksTab
              data={data}
              canWrite={canWrite}
              platform={platform}
              onOpenTask={(t) => setTaskDetail(t)}
              onNewTask={openNewTask}
            />
          )}
        </div>
      </div>

      {/* ---------- Hoja de detalle de tarea (compartida entre pestañas) ---------- */}
      <TaskDetailSheet
        task={taskDetail}
        canWrite={canWrite}
        platform={platform}
        onClose={() => setTaskDetail(null)}
        onEdit={openEditTask}
      />

      {/* ---------- Editor de ficha de tarea (crear / editar) ---------- */}
      {taskEditor && (
        <TaskEditor
          task={taskEditor.task}
          presetFamily={taskEditor.presetFamily}
          subprinciples={data.subprinciples}
          platform={platform}
          onClose={() => setTaskEditor(null)}
        />
      )}
    </div>
  );
}
