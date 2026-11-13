"use client";

// ============================================================================
// PILAR 1 — VISTA BIBLIOTECA (Modo Vestuario, táctil) — STICKY MASTER
// ----------------------------------------------------------------------------
// Anatomía ultra-compacta: zona FIJA arriba (solo la cabecera con «+ Tarea»)
// y el contenido con scroll propio debajo. Sin scroll de página.
// VISTA ÚNICA: el ÁRBOL DE TAREAS («Tareas de entrenamiento en fútbol» →
// 1. Clasificación General → 5 bloques → 27 hojas) es la organización oficial
// de la biblioteca que pide el míster — sin cuadros de estadísticas ni
// pestañas: entran, ven el catálogo y buscan.
// El buscador REFORZADO vive en la barra fija del scroll (siempre a la vista)
// y el detalle de tarea y su editor se abren aquí arriba.
// ============================================================================

import { useState } from "react";
import { Landmark, Plus, ShieldCheck } from "lucide-react";
import type { Role } from "@/types/auth";
import { canWriteCatedra, canWriteClubContent } from "@/utils/permissions";
import type { LibraryData, TaskCard } from "@/components/library/types";
import { TaskDetailSheet, TasksTab } from "@/components/library/tasks-tab";
import { TaskEditor } from "@/components/library/task-editor";
import { UserMenu } from "@/components/hoy/user-menu";

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
  const [taskDetail, setTaskDetail] = useState<TaskCard | null>(null);
  const [taskEditor, setTaskEditor] = useState<{
    task: TaskCard | null;
    /** Familia preseleccionada al crear desde la Biblioteca */
    presetFamily?: string;
  } | null>(null);

  // RBAC de presentación: el guard real vive en cada Server Action.
  const canWrite = platform ? canWriteCatedra(role) : canWriteClubContent(role);

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
      </div>

      {/* ================= SCROLL: árbol + buscador reforzado ================= */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <TasksTab
            data={data}
            canWrite={canWrite}
            platform={platform}
            onOpenTask={(t) => setTaskDetail(t)}
            onNewTask={openNewTask}
          />
        </div>
      </div>

      {/* ---------- Hoja de detalle de tarea ---------- */}
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
