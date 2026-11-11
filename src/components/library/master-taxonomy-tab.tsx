"use client";

// ============================================================================
// PILAR 1 — BIBLIOTECA MAESTRA · TAXONOMÍA OFICIAL COMPLETA DE TAREAS
// (mock del míster 'MasterLibraryTaxonomyView')
// ----------------------------------------------------------------------------
// La clasificación oficial por NATURALEZA de la tarea: 5 categorías plegables
// (Físicas · Técnicas · Tácticas · Psicológicas · Integradas) que despliegan
// sus 14 FAMILIAS con descriptor y chip de color. Cada familia muestra SUS
// tareas (Task.family) — clic abre la ficha completa; el + de la familia crea
// una tarea YA CLASIFICADA. Buscador que filtra familias y tareas (al buscar
// se despliegan solas las secciones con resultados) y bloque "Sin clasificar"
// para que nada se quede huérfano.
// Estilo de la casa (crema/verde): NO se adopta el slate oscuro del mock.
// ============================================================================

import { useMemo, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { TASK_TAXONOMY, taskFamilyMeta } from "@/lib/task-taxonomy";
import { INTENSITY_META, normalizeName } from "@/lib/taxonomy";
import type { LibraryData, TaskCard } from "@/components/library/types";

export function MasterTaxonomyTab({
  data,
  canWrite,
  onOpenTask,
  onEditTask,
  onNewTask,
}: {
  data: LibraryData;
  canWrite: boolean;
  onOpenTask: (t: TaskCard) => void;
  onEditTask: (t: TaskCard) => void;
  onNewTask: (familyId?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [openFams, setOpenFams] = useState<Record<string, boolean>>({});

  const q = normalizeName(query.trim());

  // ---------- Índices de la taxonomía contra los datos reales ----------
  const tasksByFamily = useMemo(() => {
    const m = new Map<string, TaskCard[]>();
    for (const t of data.tasks) {
      if (!t.family) continue;
      const list = m.get(t.family) ?? [];
      list.push(t);
      m.set(t.family, list);
    }
    return m;
  }, [data.tasks]);

  const unclassified = useMemo(
    () => data.tasks.filter((t) => !taskFamilyMeta(t.family)),
    [data.tasks],
  );

  /** true si la categoría tiene alguna coincidencia con la búsqueda */
  const catMatches = useMemo(() => {
    if (!q) return null; // sin búsqueda → mostrar todo según estado plegado
    const m = new Map<string, { famIds: Set<string>; taskIds: Set<string> }>();
    for (const cat of TASK_TAXONOMY) {
      const catHit =
        normalizeName(cat.label).includes(q) || normalizeName(cat.hint).includes(q);
      const famIds = new Set<string>();
      const taskIds = new Set<string>();
      for (const fam of cat.families) {
        const famHit =
          catHit ||
          normalizeName(fam.name).includes(q) ||
          normalizeName(fam.descriptor).includes(q) ||
          normalizeName(fam.chip).includes(q);
        const famTasks = tasksByFamily.get(fam.id) ?? [];
        const hits = famTasks.filter(
          (t) => famHit || normalizeName(t.title).includes(q) || normalizeName(t.objective).includes(q),
        );
        if (famHit) famIds.add(fam.id);
        for (const t of hits) {
          famIds.add(fam.id);
          taskIds.add(t.id);
        }
      }
      if (catHit || famIds.size) m.set(cat.id, { famIds, taskIds });
    }
    // Además: tareas sin clasificar cuyo título/objective coincide
    if (unclassified.some((t) => normalizeName(t.title).includes(q) || normalizeName(t.objective).includes(q))) {
      m.set("sin-clasificar", { famIds: new Set(), taskIds: new Set() });
    }
    return m;
  }, [q, tasksByFamily, unclassified]);

  const searching = q.length > 0;
  const totalResults = searching
    ? (catMatches?.size ?? 0)
    : 0;

  const isOpenCat = (catId: string) => (searching ? (catMatches?.has(catId) ?? false) : !!openCats[catId]);
  const isOpenFam = (famId: string) => !!openFams[famId];

  return (
    <div className="space-y-2" data-testid="maestra-root">
      {/* ---------- Buscador (mock: cabecera fija con lupa + Tarea) ---------- */}
      <div className="sticky top-0 z-[1] rounded-2xl border border-cream-border bg-white/90 backdrop-blur p-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9a8d]" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en la biblioteca — familia, descriptor o tarea…"
            data-testid="maestra-search"
            className="w-full min-h-[44px] rounded-xl bg-cream border border-cream-border-strong pl-9 pr-8 text-sm font-semibold text-peel placeholder:text-[#8a9a8d] placeholder:font-normal focus:outline-none focus:border-brand-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-[#6c8070] hover:bg-cream-dark"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          )}
        </div>
        {canWrite && (
          <button
            onClick={() => onNewTask()}
            data-testid="maestra-new-task"
            className="shrink-0 min-h-[44px] px-3.5 rounded-xl bg-brand-600 hover:bg-brand text-white font-black text-sm transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden /> Tarea
          </button>
        )}
      </div>

      {searching && (
        <p className="text-[11px] font-bold text-[#6c8070] px-1" data-testid="maestra-search-state">
          {totalResults
            ? `${totalResults} sección${totalResults > 1 ? "es" : ""} con resultados`
            : "Sin resultados en la taxonomía oficial"}
        </p>
      )}

      {/* ---------- 5 categorías plegables ---------- */}
      {TASK_TAXONOMY.map((cat, idx) => {
        const open = isOpenCat(cat.id);
        const match = catMatches?.get(cat.id);
        const catTasks = cat.families.reduce(
          (acc, f) => acc + (tasksByFamily.get(f.id)?.length ?? 0),
          0,
        );
        return (
          <div
            key={cat.id}
            className="rounded-2xl border border-cream-border bg-white overflow-hidden"
            data-testid={`maestra-cat-${cat.id}`}
          >
            <button
              onClick={() => setOpenCats((p) => ({ ...p, [cat.id]: !p[cat.id] }))}
              aria-expanded={open}
              data-testid={`maestra-cat-btn-${cat.id}`}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-cream hover:bg-cream-dark/70 transition text-left"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-black text-peel">
                  <span aria-hidden>{cat.emoji}</span>
                  {idx + 1}. {cat.label}
                </span>
                <span className="block text-[10px] text-[#8a9a8d] truncate">({cat.hint})</span>
              </span>
              <span className="shrink-0 flex items-center gap-2">
                <span className="text-[10px] font-black text-[#6c8070] bg-white border border-cream-border rounded-lg px-1.5 py-0.5">
                  {catTasks} tareas
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-brand-600 transition-transform ${open ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </span>
            </button>

            {open && (
              <div className="p-2 space-y-1.5 border-t border-cream-border" data-testid={`maestra-cat-body-${cat.id}`}>
                {cat.families
                  .filter((f) => (match ? match.famIds.has(f.id) : true))
                  .map((fam) => {
                    const famTasks = tasksByFamily.get(fam.id) ?? [];
                    const famOpen = isOpenFam(fam.id);
                    return (
                      <div
                        key={fam.id}
                        className="rounded-xl border border-cream-border bg-cream/60 overflow-hidden"
                        data-testid={`maestra-family-${fam.id}`}
                      >
                        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                          <button
                            onClick={() => setOpenFams((p) => ({ ...p, [fam.id]: !p[fam.id] }))}
                            aria-expanded={famOpen}
                            data-testid={`maestra-family-btn-${fam.id}`}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-bold text-[#2a4630]">{fam.name}</span>
                              <span
                                className={`text-[9px] font-black border rounded-md px-1.5 py-0.5 ${fam.chipClass}`}
                                data-testid={`maestra-chip-${fam.id}`}
                              >
                                {fam.chip}
                              </span>
                            </span>
                            <span className="block text-[10px] text-[#8a9a8d]">({fam.descriptor})</span>
                          </button>
                          <span className="shrink-0 flex items-center gap-1.5">
                            <span
                              className="text-[10px] font-black text-brand-600"
                              data-testid={`maestra-count-${fam.id}`}
                            >
                              {famTasks.length} tarea{famTasks.length === 1 ? "" : "s"}
                            </span>
                            {canWrite && (
                              <button
                                onClick={() => onNewTask(fam.id)}
                                title={`Nueva tarea en: ${fam.name}`}
                                aria-label={`Nueva tarea en: ${fam.name}`}
                                data-testid={`maestra-add-${fam.id}`}
                                className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center hover:bg-brand transition"
                              >
                                <Plus className="w-4 h-4" aria-hidden />
                              </button>
                            )}
                            <ChevronDown
                              className={`w-4 h-4 text-[#6c8070] transition-transform ${famOpen ? "rotate-180" : ""}`}
                              aria-hidden
                            />
                          </span>
                        </div>

                        {famOpen && (
                          <div className="border-t border-cream-border p-1.5 space-y-1" data-testid={`maestra-family-tasks-${fam.id}`}>
                            {famTasks.length === 0 && (
                              <p className="text-[11px] text-[#8a9a8d] px-2 py-1.5">
                                Aún no hay tareas de esta familia{" "}
                                {canWrite ? "— usa el + para crear la primera ya clasificada." : "."}
                              </p>
                            )}
                            {famTasks.map((t) => {
                              const im = INTENSITY_META[t.intensity] ?? INTENSITY_META.MEDIUM;
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => onOpenTask(t)}
                                  data-testid={`maestra-task-${t.id}`}
                                  className="w-full rounded-lg bg-white border border-cream-border px-2.5 py-2 flex items-center justify-between gap-2 hover:border-brand-500 transition text-left"
                                >
                                  <span className="min-w-0">
                                    <span className="block text-[13px] font-bold text-peel truncate">
                                      {t.title}
                                    </span>
                                    <span className="block text-[10px] text-[#8a9a8d] truncate">
                                      {t.durationMin}′ · {t.playersMin}
                                      {t.playersMax ? `-${t.playersMax}` : ""} jug · {t.recipes.length} recetas
                                    </span>
                                  </span>
                                  <span className="shrink-0 flex items-center gap-1.5">
                                    {t.clubId === null && (
                                      <span className="text-[9px] font-black text-[#6d28d9] border border-violet-500/40 bg-violet-500/10 rounded-md px-1 py-0.5">
                                        Cátedra
                                      </span>
                                    )}
                                    <span
                                      className={`text-[9px] font-black border rounded-md px-1 py-0.5 ${im.chip}`}
                                    >
                                      {im.label}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}

      {/* ---------- Sin clasificar: ninguna tarea se queda huérfana ---------- */}
      <div
        className="rounded-2xl border border-dashed border-cream-border-strong bg-white/70 overflow-hidden"
        data-testid="maestra-unclassified"
      >
        <button
          onClick={() =>
            setOpenCats((p) => ({ ...p, "sin-clasificar": !p["sin-clasificar"] }))
          }
          aria-expanded={!!openCats["sin-clasificar"] || searching}
          data-testid="maestra-unclassified-btn"
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
        >
          <span>
            <span className="text-sm font-bold text-[#5d7263]">
              📥 Tareas sin familia oficial
            </span>
            <span className="block text-[10px] text-[#8a9a8d]">
              Clasifícalas desde su ficha para que aparezcan en su sección
            </span>
          </span>
          <span className="shrink-0 text-[10px] font-black text-[#6c8070] bg-cream border border-cream-border rounded-lg px-1.5 py-0.5">
            {unclassified.length}
          </span>
        </button>
        {(!!openCats["sin-clasificar"] || searching) && unclassified.length > 0 && (
          <div className="border-t border-cream-border p-1.5 space-y-1">
            {unclassified
              .filter(
                (t) =>
                  !searching ||
                  normalizeName(t.title).includes(q) ||
                  normalizeName(t.objective).includes(q),
              )
              .map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg bg-cream/60 border border-cream-border px-2.5 py-2 flex items-center justify-between gap-2"
                >
                  <button
                    onClick={() => onOpenTask(t)}
                    data-testid={`maestra-unclassified-task-${t.id}`}
                    className="min-w-0 text-left flex-1"
                  >
                    <span className="block text-[13px] font-bold text-[#3d5844] truncate">{t.title}</span>
                    <span className="block text-[10px] text-[#8a9a8d]">{t.durationMin}′ · sin familia</span>
                  </button>
                  {canWrite && (
                    <button
                      onClick={() => onEditTask(t)}
                      title="Clasificar esta tarea"
                      data-testid={`maestra-classify-${t.id}`}
                      className="shrink-0 min-h-[36px] px-2.5 rounded-lg border border-cream-border-strong bg-white text-[11px] font-bold text-[#2a4630] hover:border-brand-500 transition"
                    >
                      Clasificar
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
