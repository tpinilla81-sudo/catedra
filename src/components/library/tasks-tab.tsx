"use client";

// ============================================================================
// PILAR 1 — CATÁLOGO DE TAREAS: BUSCADOR REFORZADO + ÁRBOL OFICIAL (vista única)
// ----------------------------------------------------------------------------
// • Búsqueda de DEPÓSITO: multi-palabra (Y, orden libre), sin acentos y en TODA
//   la ficha vía task-search.ts (título, objetivo, comentarios, reglas,
//   co-achéo, materiales, categorías Nivel 3, subprincipios, fases…).
//   Barra sticky: siempre visible mientras se recorre el árbol, con contador
//   de resultados, botón limpiar, atajo «/» y Esc para vaciar.
// • Resaltado <mark> de las coincidencias en título y objetivo.
// • Filtros de un toque: fase, intensidad y origen (Cátedra global vs. club).
// • TaskDetailSheet: ficha COMPLETA (espacio, carga, reglas de provocación,
//   co-achéo, materiales) + recetas bidireccionales + trazabilidad de uso
//   ("prescrita N veces por el motor").
// ============================================================================

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Clock,
  CopyPlus,
  Loader2,
  MapPin,
  MonitorPlay,
  Network,
  PenLine,
  Ruler,
  Search,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fieldZoneLabel } from "@/lib/field-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  deleteTask,
  duplicateTaskToClub,
} from "@/app/dashboard/library/actions";
import {
  INTENSITY_META,
  ORIGIN_META,
  PHASE_META,
  PHASE_ORDER,
  RELEVANCE_META,
} from "@/lib/taxonomy";
import type { LibraryData, TaskCard } from "@/components/library/types";
import { taskLevel3Meta } from "@/lib/task-taxonomy";
import { taskHaystack, taskMatches, queryTokens } from "@/lib/task-search";
import { seleccionarAnimacion } from "@/lib/animaciones-ejercicio";
import { PizarraAnimada } from "@/components/library/pizarra-animada";
import { TasksTree } from "@/components/library/tasks-tree";
import { useToast } from "@/hooks/use-toast";

// ---------- Vista única: buscador reforzado + árbol oficial ----------

export function TasksTab({
  data,
  canWrite,
  platform,
  onOpenTask,
  onNewTask,
}: {
  data: LibraryData;
  /** RBAC de presentación (el guard real vive en cada Server Action) */
  canWrite: boolean;
  /** Modo Plataforma: se edita el contenido global de la Cátedra */
  platform: boolean;
  onOpenTask: (t: TaskCard) => void;
  onNewTask: () => void;
}) {
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState("ALL");
  const [intensity, setIntensity] = useState("ALL");
  const [origin, setOrigin] = useState<"ALL" | "cathedral" | "club">("ALL");
  const searchRef = useRef<HTMLInputElement>(null);

  // Atajo «/»: enfoca el buscador desde cualquier punto de la Biblioteca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Con cualquier filtro activo el árbol se auto-expande (hojas con resultados)
  const tokens = useMemo(() => queryTokens(q), [q]);
  const filtersActive =
    tokens.length > 0 || phase !== "ALL" || intensity !== "ALL" || origin !== "ALL";

  // BUSCADOR REFORZADO: cada palabra debe aparecer en ALGÚN campo de la ficha
  // completa (título, objetivo, comentarios, reglas, co-achéo, materiales,
  // categorías Nivel 3, subprincipios, fases…) — sin acentos, orden libre.
  const filtered = useMemo(() => {
    return data.tasks.filter((t) => {
      if (phase !== "ALL" && !t.phases.includes(phase)) return false;
      if (intensity !== "ALL" && t.intensity !== intensity) return false;
      if (origin === "cathedral" && t.clubId !== null) return false;
      if (origin === "club" && t.clubId === null) return false;
      if (tokens.length > 0 && !taskMatches(taskHaystack(t), tokens)) return false;
      return true;
    });
  }, [data.tasks, tokens, phase, intensity, origin]);

  const chip = (active: boolean) =>
    `shrink-0 min-h-[44px] px-3.5 py-2 rounded-full border text-sm font-bold transition ${
      active
        ? "bg-brand-600/15 border-emerald-500/50 text-brand-600"
        : "bg-white border-cream-border text-[#5d7263] hover:text-[#2a4630]"
    }`;

  return (
    <div className="space-y-4">
      {/* Búsqueda REFORZADA — barra fija mientras se recorre el árbol */}
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-1 pb-2.5 -mt-1 bg-white/95 backdrop-blur border-b border-cream-border/70">
        <div className="relative">
          <Search
            className="w-4 h-4 text-[#6c8070] absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden
          />
          <Input
            ref={searchRef}
            data-testid="library-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && q) {
                e.stopPropagation();
                setQ("");
              }
            }}
            placeholder="Buscar tarea, objetivo, material, categoría…"
            aria-label="Buscar en toda la ficha: título, objetivo, reglas, materiales, categorías y subprincipios (pulsa / para ir aquí)"
            title="Pulsa / para buscar · mira TODA la ficha, sin acentos y multi-palabra"
            className="min-h-[48px] pl-10 pr-11 rounded-2xl bg-white border-cream-border text-peel placeholder:text-[#6c8070]"
          />
          {q !== "" && (
            <button
              type="button"
              data-testid="search-clear"
              onClick={() => setQ("")}
              aria-label="Limpiar búsqueda"
              title="Limpiar búsqueda"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-cream border border-cream-border-strong text-[#5d7263] hover:text-[#2a4630] flex items-center justify-center transition"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          )}
        </div>
        {tokens.length > 0 && (
          <p data-testid="search-count" className="mt-1.5 px-1 text-[11px] font-bold text-[#6c8070]">
            {filtered.length === 0
              ? `Sin resultados para «${q.trim()}»`
              : `${filtered.length} ${filtered.length === 1 ? "tarea encontrada" : "tareas encontradas"} para «${q.trim()}»`}
            <span className="font-semibold text-[#8a9a8d]">
              {" "}
              · toda la ficha, sin acentos, multi-palabra
            </span>
          </p>
        )}
      </div>

      {/* Filtros: fase */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <button onClick={() => setPhase("ALL")} aria-pressed={phase === "ALL"} className={chip(phase === "ALL")}>
          Todas las fases
        </button>
        {PHASE_ORDER.map((p) => {
          const meta = PHASE_META[p];
          return (
            <button key={p} onClick={() => setPhase(p)} aria-pressed={phase === p} className={chip(phase === p)}>
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Filtros: intensidad + origen */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <button onClick={() => setIntensity("ALL")} aria-pressed={intensity === "ALL"} className={chip(intensity === "ALL")}>
          Toda intensidad
        </button>
        {(["LOW", "MEDIUM", "HIGH"] as const).map((i) => (
          <button key={i} onClick={() => setIntensity(i)} aria-pressed={intensity === i} className={chip(intensity === i)}>
            {INTENSITY_META[i].label}
          </button>
        ))}
        <span className="w-px bg-cream-dark shrink-0" aria-hidden />
        <button
          onClick={() => setOrigin("cathedral")}
          aria-pressed={origin === "cathedral"}
          className={chip(origin === "cathedral")}
        >
          Cátedra
        </button>
        <button onClick={() => setOrigin("club")} aria-pressed={origin === "club"} className={chip(origin === "club")}>
          Mi club
        </button>
      </div>

      {/* ÁRBOL OFICIAL: raíz → 1. CLASIFICACIÓN GENERAL → bloques → categorías → tareas */}
      {filtered.length === 0 && tokens.length > 0 ? (
        <div className="rounded-3xl border border-dashed border-cream-border px-6 py-10 text-center">
          <p className="text-[#6c8070]">
            Sin resultados para «{q.trim()}». El buscador mira TODA la ficha — título, objetivo,
            reglas, materiales, categorías Nivel 3 y subprincipios — sin acentos.{" "}
            <span className="text-[#5d7263]">Prueba con menos palabras.</span>
          </p>
          <Button
            variant="outline"
            onClick={() => setQ("")}
            className="mt-4 min-h-[44px] rounded-2xl border-cream-border-strong bg-cream text-[#2a4630] font-black"
          >
            Limpiar búsqueda
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-cream-border px-6 py-10 text-center">
          <p className="text-[#6c8070]">
            No hay tareas con estos filtros.{" "}
            {canWrite ? (
              <span className="text-[#5d7263]">
                Crea una nueva con el botón «+ Tarea» de la cabecera.
              </span>
            ) : (
              <span className="text-[#5d7263]">
                Tu rol consulta el catálogo en modo lectura.
              </span>
            )}
          </p>
          {canWrite && (
            <Button
              onClick={onNewTask}
              className="mt-4 min-h-[48px] rounded-2xl bg-brand-600 hover:bg-brand text-white font-black"
            >
              {platform ? "Crear la primera tarea de la Cátedra" : "Crear la primera tarea del club"}
            </Button>
          )}
        </div>
      ) : (
        <TasksTree
          tasks={filtered}
          onOpenTask={onOpenTask}
          filtersActive={filtersActive}
          tokens={tokens}
        />
      )}
    </div>
  );
}

// ---------- Hoja de detalle: FICHA COMPLETA ----------

function MetaBox({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-cream-dark/60 px-3 py-2.5">
      <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" aria-hidden /> {label}
      </p>
      <p className="text-sm font-black text-peel mt-1">{value}</p>
      {hint && <p className="text-[11px] text-[#6c8070] mt-0.5 leading-tight">{hint}</p>}
    </div>
  );
}

function ChipList({ title, items, numbered }: { title: string; items: string[]; numbered?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest mb-1.5">{title}</p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={it} className="flex gap-2 text-sm text-[#3d5844] leading-snug">
            {numbered ? (
              <span className="shrink-0 w-5 h-5 rounded-md bg-cream-dark text-[11px] font-black text-[#8a6206] flex items-center justify-center">
                {i + 1}
              </span>
            ) : (
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-brand-400/70 mt-2" aria-hidden />
            )}
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TaskDetailSheet({
  task,
  canWrite,
  platform,
  onClose,
  onEdit,
}: {
  task: TaskCard | null;
  /** RBAC de presentación (el guard real vive en cada Server Action) */
  canWrite: boolean;
  /** Modo Plataforma: se edita el contenido global de la Cátedra */
  platform: boolean;
  onClose: () => void;
  onEdit: (t: TaskCard) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  // Pizarra: la PERSONALIZADA guardada si existe; si no, plantilla (null sin tarea)
  const anim = useMemo(
    () => (task ? task.animationData ?? seleccionarAnimacion(task) : null),
    [task],
  );

  const isClub = task ? task.clubId !== null : false;
  const origin = task ? (isClub ? ORIGIN_META.club : ORIGIN_META.cathedral) : ORIGIN_META.cathedral;
  const OriginIcon = origin.icon;

  function runDuplicate() {
    if (!task) return;
    startTransition(async () => {
      const res = await duplicateTaskToClub(task.id);
      if (res.ok) {
        toast({
          title: "Tarea duplicada a tu club",
          description: "Ya puedes editarla sin tocar la Cátedra.",
          duration: 2200,
        });
        router.refresh();
        onClose();
      } else {
        toast({ title: "No se pudo duplicar", description: res.error, duration: 5000 });
      }
    });
  }

  function runDelete() {
    if (!task) return;
    startTransition(async () => {
      const res = await deleteTask(task.id);
      if (res.ok) {
        toast({ title: "Tarea eliminada", description: task.title, duration: 2000 });
        router.refresh();
        setConfirmDelete(false);
        onClose();
      } else {
        toast({ title: "No se pudo eliminar", description: res.error, duration: 5000 });
        setConfirmDelete(false);
      }
    });
  }

  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="bg-white border-cream-border rounded-t-3xl max-h-[94vh] overflow-y-auto px-4 pb-8 pt-2"
      >
        {task && (
          <>
            <SheetHeader className="text-left pb-1">
              <div className="flex items-start justify-between gap-2">
                <SheetTitle className="text-xl font-black text-peel leading-snug">
                  {task.title}
                </SheetTitle>
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-1.5 pt-1">
                <span
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-black ${origin.chip}`}
                  title={origin.hint}
                >
                  <OriginIcon className="w-3.5 h-3.5" aria-hidden /> {origin.label}
                </span>
                {task.phases.map((p) => {
                  const meta = PHASE_META[p] ?? PHASE_META.OFFENSIVE;
                  return (
                    <span
                      key={p}
                      className={`rounded-lg border px-2 py-0.5 text-[11px] font-black ${meta.chip}`}
                    >
                      {meta.label}
                    </span>
                  );
                })}
                {task.createdByName && (
                  <span className="text-xs text-[#6c8070]">· creada por {task.createdByName}</span>
                )}
              </SheetDescription>
            </SheetHeader>

            <p className="text-sm text-[#3d5844] leading-relaxed mt-1">{task.objective}</p>

            {/* Sección de Trabajo del mock: comentarios, etapas y Nivel 3 */}
            {task.workComments && (
              <div
                className="mt-2 rounded-2xl border border-brand-500/25 bg-brand-600/[0.04] px-3 py-2.5"
                data-testid="task-detail-comentarios"
              >
                <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest">
                  Comentarios sobre el Trabajo
                </p>
                <p className="text-sm text-[#3d5844] leading-relaxed mt-1 whitespace-pre-wrap">
                  {task.workComments}
                </p>
              </div>
            )}
            {task.etapasFormacion.length > 0 && (
              <div className="mt-3" data-testid="task-detail-etapas">
                <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest">
                  Etapas del proceso de formación
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {task.etapasFormacion.map((e) => (
                    <span
                      key={e}
                      className="rounded-lg border border-brand-600/30 bg-brand-600/10 px-2 py-1 text-[11px] font-bold text-brand-600"
                    >
                      {e}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {task.nivel3Ids.length > 0 && (
              <div className="mt-3" data-testid="task-detail-nivel3">
                <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest">
                  Taxonomía Nivel 3
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {task.nivel3Ids.map((id) => {
                    const meta = taskLevel3Meta(id);
                    if (!meta) return null;
                    return (
                      <span
                        key={id}
                        className="rounded-lg border border-cream-border-strong bg-cream px-2 py-1 text-[11px] font-bold text-[#3d5844]"
                      >
                        {meta.nombre}
                        <span className="text-[9px] text-[#6c8070] ml-1">{meta.bloque}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pizarra animada: patrón de movimiento, carriles de pase y rotaciones */}
            <div className="mt-4 rounded-3xl border border-cream-border bg-cream-dark/30 p-3">
              <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <MonitorPlay className="w-3.5 h-3.5" aria-hidden /> Pizarra en movimiento
                {task.animationData && (
                  <span className="rounded-md bg-brand-600/15 border border-emerald-500/50 px-1.5 py-0.5 text-[9px] font-black text-brand-600 normal-case">
                    diseñada por el míster
                  </span>
                )}
              </p>
              {anim && (
                <div className="mx-auto max-w-md">
                  <PizarraAnimada animacion={anim} variante="detalle" />
                </div>
              )}
            </div>

            {/* Metadatos de ingeniería */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <MetaBox
                icon={Ruler}
                label="ESPACIO"
                value={
                  task.spaceLengthM
                    ? `${task.spaceLengthM} × ${task.spaceWidthM ?? "?"} m`
                    : "Libre"
                }
                hint={task.spaceNote ?? undefined}
              />
              <MetaBox
                icon={MapPin}
                label="ZONA DEL CAMPO"
                value={fieldZoneLabel(task.fieldZoneLabel)}
              />
              <MetaBox
                icon={Users}
                label="JUGADORES"
                value={`${task.playersMin}${task.playersMax ? `–${task.playersMax}` : "+"}`}
              />
              <MetaBox
                icon={Clock}
                label="DURACIÓN"
                value={`${task.durationMin} min`}
                hint={task.repetitions ?? undefined}
              />
              <MetaBox
                icon={CalendarClock}
                label="INTENSIDAD"
                value={INTENSITY_META[task.intensity]?.label ?? task.intensity}
                hint={
                  task.intensity === "LOW"
                    ? "Ideal con fatiga alta"
                    : task.intensity === "HIGH"
                      ? "El motor la evita si hay fatiga ≥ 7"
                      : undefined
                }
              />
            </div>

            {/* Conocimiento entrenable */}
            <div className="space-y-4 mt-5 rounded-3xl bg-cream-dark/40 border border-cream-border p-4">
              <ChipList title="Reglas de provocación" items={task.rulesOfProvocation} numbered />
              <ChipList title="Puntos de co-achéo" items={task.coachingPoints} />
              <ChipList title="Materiales" items={task.materials} />
              {task.diagramUrl && (
                <p className="text-xs">
                  <a
                    href={task.diagramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 underline underline-offset-2 break-all"
                  >
                    Ver diagrama de la tarea ↗
                  </a>
                </p>
              )}

              {/* Vídeo REAL de la tarea (grabado en su zona y metros) */}
              {task.videoUrl && (
                <div className="pt-1">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#6c8070]">
                    <Video className="h-3.5 w-3.5" aria-hidden /> Vídeo real ·{" "}
                    {fieldZoneLabel(task.fieldZoneLabel)}
                  </p>
                  {/\.(mp4|webm|ogg|mov)(\?|$)/i.test(task.videoUrl) ? (
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      src={task.videoUrl}
                      className="mt-2 w-full rounded-xl border border-cream-border bg-black"
                    />
                  ) : (
                    <p className="mt-1 text-xs">
                      <a
                        href={task.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-600 underline underline-offset-2 break-all"
                      >
                        Ver el vídeo grabado en esta zona ↗
                      </a>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Recetas: conexión bidireccional con la taxonomía */}
            <p className="text-xs font-bold text-[#6c8070] uppercase tracking-widest mt-5 mb-2">
              Recetas — subprincipios que aborda
            </p>
            {task.recipes.length > 0 ? (
              <ul className="space-y-2">
                {[...task.recipes]
                  .sort((a, b) => b.relevance - a.relevance)
                  .map((r) => {
                    const rel = RELEVANCE_META[r.relevance] ?? RELEVANCE_META[2];
                    const pMeta = PHASE_META[r.spPhase] ?? PHASE_META.OFFENSIVE;
                    return (
                      <li
                        key={r.subPrincipleId}
                        className="rounded-2xl bg-cream-dark/60 border border-cream-border px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black ${rel.chip}`}
                            title={rel.hint}
                          >
                            {r.relevance} · {rel.label}
                          </span>
                          <p className="text-sm font-bold text-peel flex-1 min-w-[50%]">
                            {r.spName}
                          </p>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${pMeta.chip}`}
                          >
                            {pMeta.label}
                          </span>
                        </div>
                        {r.usageNote && (
                          <p className="text-xs italic text-[#5d7263] mt-1.5 leading-snug">
                            «{r.usageNote}»
                          </p>
                        )}
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-cream-border-strong px-4 py-3 text-sm text-[#6c8070]">
                Esta tarea no está conectada a la taxonomía. El motor solo prescribe tareas con
                recetas —{" "}
                {canWrite && (!platform || !isClub)
                  ? "edítala y añade sus subprincipios."
                  : "solicita al míster conectarla."}
              </p>
            )}

            {/* Trazabilidad */}
            {task.usageCount > 0 && (
              <p className="text-xs text-brand-600/90 mt-3 font-semibold">
                ✓ Prescrita {task.usageCount} vez{task.usageCount > 1 ? "es" : ""} en microciclos del
                motor (trazabilidad completa).
              </p>
            )}

            {/* Acciones (RBAC: solo roles de escritura; el alcance depende del modo) */}
            <div className="mt-5 space-y-2">
              {canWrite && (!platform || !isClub) && (
                <>
                  <Button
                    onClick={() => onEdit(task)}
                    className="w-full min-h-[52px] rounded-2xl bg-brand-600 hover:bg-brand text-white font-black"
                  >
                    <PenLine className="w-5 h-5" aria-hidden /> Editar ficha
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy}
                    className="w-full min-h-[48px] rounded-2xl border-cream-border-strong bg-cream text-[#b4232a] hover:bg-[#c62f32]/10 hover:text-[#b4232a] font-bold"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden /> Eliminar tarea
                  </Button>
                </>
              )}
              {canWrite && !isClub && !platform && (
                <Button
                  onClick={runDuplicate}
                  disabled={busy}
                  className="w-full min-h-[52px] rounded-2xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-black"
                >
                  {busy ? (
                    <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
                  ) : (
                    <>
                      <CopyPlus className="w-5 h-5" aria-hidden /> Duplicar a mi club para
                      personalizar
                    </>
                  )}
                </Button>
              )}
              {!canWrite && (
                <p className="rounded-2xl border border-cream-border bg-white/80 px-3.5 py-2.5 text-xs text-[#6c8070] font-semibold">
                  Solo lectura: tu rol consulta el catálogo sin modificarlo.
                </p>
              )}
            </div>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <AlertDialogContent className="bg-white border-cream-border rounded-3xl max-w-sm mx-auto">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-peel">
                    ¿Eliminar «{task.title}»?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-[#5d7263]">
                    Se desconectarán sus recetas. Si el motor la prescribió en algún microciclo,
                    el histórico se conserva y la eliminación quedará bloqueada.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row gap-2">
                  <AlertDialogCancel className="rounded-2xl border-cream-border-strong bg-cream text-[#2a4630] mt-0">
                    Cancelar
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      runDelete();
                    }}
                    className="rounded-2xl bg-[#c62f32] text-white hover:bg-[#a81f24] mt-0"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : "Eliminar"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
