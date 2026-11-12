"use client";

// ============================================================================
// ÁRBOL DE TAREAS DE ENTRENAMIENTO — organización OFICIAL del míster
// ----------------------------------------------------------------------------
//   [ TAREAS DE ENTRENAMIENTO EN FÚTBOL ]
//   └── 1. CLASIFICACIÓN GENERAL
//       ├── FÍSICAS ── Fuerza · Resistencia · Velocidad · Flexibilidad · Coordinación
//       ├── TÉCNICAS ── Pase · Control · Conducción · Regate · Tiro · Juego aéreo · Entrada
//       ├── TÁCTICAS ── Ofensiva · Defensiva · Transiciones · Estrategia
//       ├── PSICOLÓGICAS ── Concentración · Motivación · Confianza · Gestión emocional · Cohesión grupal
//       └── INTEGRADAS O GLOBALES ── Juegos de posición · Juegos de conservación · Rondos ·
//                                     Juegos reducidos · Partidos condicionados · Situaciones reales
//
// • Cada hoja (categoría Nivel 3) cuelga SUS tareas (una tarea multiselección
//   aparece en todas sus hojas — multiselección cruzada del editor).
// • Tareas legacy (nivel3Ids vacío) se clasifican EN LECTURA con
//   deriveLevel3Ids (familia Nivel 2 + palabras clave) y las que no encajan
//   caen en el nodo «Sin clasificar».
// • Con búsqueda/filtros activos el árbol se auto-expande y solo muestra
//   hojas con resultados.
// ============================================================================

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  ListTree,
  Network,
  Users,
} from "lucide-react";
import {
  INTENSITY_META,
  ORIGIN_META,
  PHASE_META,
  RELEVANCE_META,
} from "@/lib/taxonomy";
import {
  LEVEL3_BLOQUES,
  TASK_TAXONOMY_LEVEL3,
  deriveLevel3Ids,
} from "@/lib/task-taxonomy";
import type { TaskCard } from "@/components/library/types";
import { seleccionarAnimacion } from "@/lib/animaciones-ejercicio";
import { PizarraAnimada } from "@/components/library/pizarra-animada";

// ---------- Tarjeta compacta (hoja del árbol) ----------

export function TaskCardItem({
  task,
  onOpen,
}: {
  task: TaskCard;
  onOpen: (t: TaskCard) => void;
}) {
  const origin = task.clubId === null ? ORIGIN_META.cathedral : ORIGIN_META.club;
  const intensity = INTENSITY_META[task.intensity] ?? INTENSITY_META.MEDIUM;
  const topRecipes = [...task.recipes].sort((a, b) => b.relevance - a.relevance).slice(0, 2);
  // Pizarra de la tarea: la PERSONALIZADA del míster si existe; si no, la
  // plantilla determinista de la mecánica (misma tarea → misma pizarra)
  const anim = useMemo(() => task.animationData ?? seleccionarAnimacion(task), [task]);

  return (
    <button
      onClick={() => onOpen(task)}
      className="w-full rounded-3xl border border-cream-border bg-white p-4 text-left transition hover:border-[#b9b49c] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
      aria-label={`Abrir ficha de la tarea ${task.title}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-peel leading-snug">{task.title}</p>
        <span
          className={`shrink-0 rounded-lg border px-1.5 py-0.5 text-[10px] font-black ${origin.chip}`}
          title={origin.hint}
        >
          {origin.label}
        </span>
      </div>

      <p className="text-sm text-[#5d7263] mt-1 line-clamp-2 leading-snug">{task.objective}</p>

      {/* Mini-pizarra animada: la mecánica del ejercicio, en movimiento */}
      <div className="mt-2.5">
        <PizarraAnimada animacion={anim} variante="mini" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        {task.phases.map((p) => {
          const meta = PHASE_META[p] ?? PHASE_META.OFFENSIVE;
          return (
            <span
              key={p}
              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${meta.chip}`}
            >
              {meta.label}
            </span>
          );
        })}
        <span
          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold inline-flex items-center gap-1 ${intensity.chip}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${intensity.dot}`} aria-hidden />
          {intensity.label}
        </span>
        <span className="rounded-md bg-cream-dark px-1.5 py-0.5 text-[10px] font-bold text-[#3d5844] inline-flex items-center gap-1">
          <Clock className="w-3 h-3" aria-hidden /> {task.durationMin}′
        </span>
        <span className="rounded-md bg-cream-dark px-1.5 py-0.5 text-[10px] font-bold text-[#3d5844] inline-flex items-center gap-1">
          <Users className="w-3 h-3" aria-hidden />
          {task.playersMin}
          {task.playersMax ? `–${task.playersMax}` : "+"}
        </span>
      </div>

      {task.recipes.length > 0 ? (
        <div className="flex items-center flex-wrap gap-1.5 mt-2">
          <Network className="w-3.5 h-3.5 text-[#8a6206]/90" aria-hidden />
          {topRecipes.map((r) => {
            const rel = RELEVANCE_META[r.relevance] ?? RELEVANCE_META[2];
            return (
              <span
                key={r.subPrincipleId}
                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold max-w-[45%] truncate ${rel.chip}`}
                title={`${rel.label}: ${r.spName}`}
              >
                {r.spName}
              </span>
            );
          })}
          {task.recipes.length > topRecipes.length && (
            <span className="text-[10px] font-bold text-[#6c8070]">
              +{task.recipes.length - topRecipes.length}
            </span>
          )}
        </div>
      ) : (
        <p className="text-[10px] text-[#8a9a8d] mt-2 font-semibold">
          Sin recetas — el motor no la prescribirá todavía
        </p>
      )}

      {task.usageCount > 0 && (
        <p className="text-[10px] text-brand-600/90 mt-1.5 font-semibold">
          Prescrita {task.usageCount} vez{task.usageCount > 1 ? "es" : ""} por el motor
        </p>
      )}
    </button>
  );
}

// ---------- Piezas del árbol ----------

type TreeRow = {
  label: string;
  hint?: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
};

function TreeBranch({ row, depth, emphasized }: { row: TreeRow; depth: number; emphasized?: boolean }) {
  return (
    <div className={depth > 0 ? "ml-3 border-l-2 border-cream-border/70 pl-2.5" : ""}>
      <button
        onClick={row.onToggle}
        aria-expanded={row.open}
        className={`group flex w-full items-center gap-2 rounded-2xl px-2.5 py-2 min-h-[44px] text-left transition ${
          row.open ? "bg-cream-dark/50" : "hover:bg-cream-dark/30"
        }`}
      >
        {row.open ? (
          <ChevronDown className="w-4 h-4 shrink-0 text-[#6c8070]" aria-hidden />
        ) : (
          <ChevronRight className="w-4 h-4 shrink-0 text-[#6c8070]" aria-hidden />
        )}
        <span
          className={`truncate ${emphasized ? "text-[13px] font-black text-[#2a4630]" : "text-sm font-bold text-[#3d5844]"}`}
        >
          {row.label}
        </span>
        <span
          className="ml-auto shrink-0 rounded-md bg-white border border-cream-border px-1.5 py-0.5 text-[10px] font-black text-[#3d5844]"
          aria-label={`${row.count} tareas`}
        >
          {row.count}
        </span>
      </button>
      {row.open && row.children}
    </div>
  );
}

// ---------- El árbol ----------

const BLOQUE_EMOJI: Record<string, string> = {
  "Físicas": "⚡",
  "Técnicas": "⚽",
  "Tácticas": "🛡️",
  "Psicológicas": "🧠",
  "Integradas o Globales": "🔥",
};

export function TasksTree({
  tasks,
  onOpenTask,
  filtersActive,
}: {
  /** Tareas YA filtradas por búsqueda/fase/intensidad/origen */
  tasks: TaskCard[];
  onOpenTask: (t: TaskCard) => void;
  /** Con filtros activos el árbol se auto-expande */
  filtersActive: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["cls"]));
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandAll = () =>
    setExpanded(
      new Set([
        "cls",
        ...LEVEL3_BLOQUES.map((b) => `blk:${b}`),
        ...TASK_TAXONOMY_LEVEL3.map((c) => `cat:${c.id}`),
        "unc",
      ]),
    );
  const collapseAll = () => setExpanded(new Set(["cls"]));

  // Clasificación derivada (backfill en cliente, idempotente con la del server)
  const classified = useMemo(
    () =>
      tasks.map((t) => ({
        task: t,
        ids: t.nivel3Ids.length > 0 ? t.nivel3Ids : deriveLevel3Ids(t.nivel3Ids, t.family, `${t.title} ${t.objective}`),
      })),
    [tasks],
  );

  // Hojas: catId → tareas; y las que no encajan en ninguna de las 27
  const byCat = useMemo(() => {
    const map = new Map<string, TaskCard[]>();
    const unclassified: TaskCard[] = [];
    for (const { task, ids } of classified) {
      if (ids.length === 0) {
        unclassified.push(task);
        continue;
      }
      for (const id of ids) {
        const list = map.get(id);
        if (list) list.push(task);
        else map.set(id, [task]);
      }
    }
    return { map, unclassified };
  }, [classified]);

  const open = (id: string) => filtersActive || expanded.has(id);
  const allOpen = LEVEL3_BLOQUES.every((b) => expanded.has(`blk:${b}`));
  const catCount = (id: string) => byCat.map.get(id)?.length ?? 0;
  const bloqueCount = (bloque: string) =>
    TASK_TAXONOMY_LEVEL3.filter((c) => c.bloque === bloque).reduce(
      (acc, c) => acc + catCount(c.id),
      0,
    );
  const showUnclassified = byCat.unclassified.length > 0;

  const hideEmpty = filtersActive;

  return (
    <div data-testid="tasks-tree" className="space-y-2">
      {/* Controles del árbol */}
      <div className="flex items-center justify-end gap-2">
        <button
          data-testid="tree-expand-all"
          onClick={expandAll}
          aria-pressed={allOpen}
          className="rounded-full border border-cream-border bg-white px-3 py-1.5 text-xs font-bold text-[#5d7263] hover:text-[#2a4630] min-h-[36px] transition"
        >
          Expandir todo
        </button>
        <button
          data-testid="tree-collapse-all"
          onClick={collapseAll}
          aria-pressed={expanded.size <= 1}
          className="rounded-full border border-cream-border bg-white px-3 py-1.5 text-xs font-bold text-[#5d7263] hover:text-[#2a4630] min-h-[36px] transition"
        >
          Contraer todo
        </button>
      </div>

      {/* RAÍZ */}
      <div
        data-testid="tree-root"
        className="rounded-3xl border-2 border-cream-border bg-white p-3 sm:p-4"
        aria-label="Tareas de entrenamiento en fútbol"
      >
        <div className="flex items-center gap-2.5 px-1 pb-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-600/10 text-brand-600">
            <ListTree className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] sm:text-base font-black uppercase tracking-tight text-[#2a4630] leading-tight">
              Tareas de entrenamiento en fútbol
            </p>
            <p className="text-[11px] font-semibold text-[#6c8070]">
              {classified.length} tarea{classified.length === 1 ? "" : "s"} en el catálogo · organización oficial por clasificación general
            </p>
          </div>
        </div>

        {/* 1. CLASIFICACIÓN GENERAL (abierto por defecto) */}
        <TreeBranch
          emphasized
          depth={0}
          row={{
            label: "1. CLASIFICACIÓN GENERAL",
            count: classified.length,
            open: open("cls"),
            onToggle: () => toggle("cls"),
            children: (
              <div className="space-y-1.5 pt-1.5">
                {LEVEL3_BLOQUES.map((bloque) => {
                  const cats = TASK_TAXONOMY_LEVEL3.filter((c) => c.bloque === bloque);
                  const visibleCats = hideEmpty ? cats.filter((c) => catCount(c.id) > 0) : cats;
                  if (hideEmpty && visibleCats.length === 0 && bloqueCount(bloque) === 0) return null;
                  return (
                    <TreeBranch
                      key={bloque}
                      depth={1}
                      row={{
                        label: `${BLOQUE_EMOJI[bloque] ?? "•"} ${bloque.toUpperCase()}`,
                        count: bloqueCount(bloque),
                        open: open(`blk:${bloque}`),
                        onToggle: () => toggle(`blk:${bloque}`),
                        children: (
                          <div className="space-y-1.5 pt-1.5">
                            {visibleCats.map((cat) => {
                              const tareas = byCat.map.get(cat.id) ?? [];
                              const catOpen = open(`cat:${cat.id}`);
                              return (
                                <div key={cat.id} data-cat={cat.id} data-testid="tree-cat">
                                  <TreeBranch
                                    depth={2}
                                    row={{
                                      label: cat.nombre,
                                      count: tareas.length,
                                      open: catOpen,
                                      onToggle: () => toggle(`cat:${cat.id}`),
                                      children:
                                        tareas.length > 0 ? (
                                          <div className="grid grid-cols-1 gap-2.5 pt-1.5 pb-1 lg:grid-cols-2 xl:grid-cols-3">
                                            {tareas.map((t) => (
                                              <TaskCardItem key={`${cat.id}:${t.id}`} task={t} onOpen={onOpenTask} />
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="px-2 py-1.5 text-[11px] font-semibold text-[#8a9a8d]">
                                            Sin tareas todavía — clasifica una desde el editor
                                          </p>
                                        ),
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ),
                      }}
                    />
                  );
                })}

                {/* Nodo de cortesía: tareas que ninguna hoja acoge (todavía) */}
                {showUnclassified && (
                  <TreeBranch
                    depth={1}
                    row={{
                      label: "SIN CLASIFICAR",
                      count: byCat.unclassified.length,
                      open: open("unc"),
                      onToggle: () => toggle("unc"),
                      children: (
                        <div className="grid grid-cols-1 gap-2.5 pt-1.5 pb-1 lg:grid-cols-2 xl:grid-cols-3">
                          {byCat.unclassified.map((t) => (
                            <TaskCardItem key={t.id} task={t} onOpen={onOpenTask} />
                          ))}
                        </div>
                      ),
                    }}
                  />
                )}

                {classified.length === 0 && (
                  <p className="px-2 py-6 text-center text-sm font-semibold text-[#6c8070]">
                    No hay tareas con estos filtros.
                  </p>
                )}
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
}
