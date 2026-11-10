"use client";

// ============================================================================
// PILAR 1 — TAXONOMÍA JERÁRQUICA (pestaña "Taxonomía")
// ----------------------------------------------------------------------------
// Árbol de subprincipios organizado por las 5 fases del juego (GamePhase):
//   fase → subprincipio (raíz) → detalle (2 niveles máximo).
// Convivencia de contenidos:
//   • Cátedra global (clubId = null)  → SOLO LECTURA + "Duplicar a mi club".
//   • Contenido del club (clubId = X) → crear / editar / eliminar / anidar.
// Cada subprincipio muestra sus RECETAS: las tareas que lo resuelven,
// ordenadas por relevancia del motor (3 → 1), y si el diagnóstico semanal
// tiene un hallazgo ABIERTO que apunta aquí (⚠ falla esta semana).
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  CopyPlus,
  CornerDownRight,
  Landmark,
  Loader2,
  PenLine,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  deleteSubPrinciple,
  duplicateSubPrincipleToClub,
  saveSubPrinciple,
} from "@/app/dashboard/library/actions";
import {
  INTENSITY_META,
  ORIGIN_META,
  PHASE_META,
  PHASE_ORDER,
  RELEVANCE_META,
} from "@/lib/taxonomy";
import { tasksForSubPrinciple, type LibraryData, type SPNode, type TaskCard } from "@/components/library/types";
import { useToast } from "@/hooks/use-toast";

// ---------- Fila de subprincipio (raíz o detalle) ----------

function SPRow({
  node,
  child,
  recipeCount,
  childCount,
  onOpen,
}: {
  node: SPNode;
  child?: boolean;
  recipeCount: number;
  childCount: number;
  onOpen: (s: SPNode) => void;
}) {
  const origin = node.clubId === null ? ORIGIN_META.cathedral : ORIGIN_META.club;
  const OriginIcon = origin.icon;

  return (
    <button
      onClick={() => onOpen(node)}
      className={`w-full rounded-2xl border text-left transition hover:border-[#b9b49c] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 ${
        child
          ? "border-cream-border/80 bg-white/80"
          : "border-cream-border bg-white"
      }`}
      aria-label={`Abrir subprincipio ${node.name}`}
    >
      <div className={`flex items-start gap-2 ${child ? "px-3 py-2.5" : "px-3.5 py-3"}`}>
        {child && (
          <CornerDownRight className="w-4 h-4 text-[#8a9a8d] shrink-0 mt-0.5" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`font-bold text-peel leading-snug ${child ? "text-sm" : "text-[15px]"}`}>
              {node.name}
            </p>
            <span
              className={`shrink-0 inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[10px] font-black ${origin.chip}`}
              title={origin.hint}
            >
              <OriginIcon className="w-3 h-3" aria-hidden />
              {origin.label}
            </span>
          </div>
          {node.description && (
            <p className="text-xs text-[#6c8070] mt-0.5 line-clamp-1 leading-snug">
              {node.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {recipeCount > 0 ? (
              <span className="rounded-md bg-amber-500/15 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-bold text-[#8a6206] inline-flex items-center gap-1">
                <BookOpen className="w-3 h-3" aria-hidden /> {recipeCount} tarea
                {recipeCount > 1 ? "s" : ""}
              </span>
            ) : (
              <span className="rounded-md bg-cream-dark px-1.5 py-0.5 text-[10px] font-bold text-[#6c8070]">
                sin recetas
              </span>
            )}
            {childCount > 0 && (
              <span className="rounded-md bg-cream-dark px-1.5 py-0.5 text-[10px] font-bold text-[#5d7263]">
                {childCount} detalle{childCount > 1 ? "s" : ""}
              </span>
            )}
            {node.issue && (
              <span
                className="rounded-md bg-[#c62f32]/15 border border-rose-500/50 px-1.5 py-0.5 text-[10px] font-black text-[#b4232a] inline-flex items-center gap-1"
                title={node.issue.evidence}
              >
                <AlertTriangle className="w-3 h-3" aria-hidden /> falla esta semana
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ---------- Editor de subprincipio (crear / editar) ----------

function SPEditorSheet({
  editor,
  data,
  platform,
  onClose,
}: {
  editor: { node: SPNode | null; phase: string; parent: SPNode | null };
  data: LibraryData;
  platform: boolean;
  onClose: () => void;
}) {
  const node = editor.node;
  const [name, setName] = useState(node?.name ?? "");
  const [description, setDescription] = useState(node?.description ?? "");
  const [parentId, setParentId] = useState<string | null>(editor.parent?.id ?? null);
  const [saving, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const phaseMeta = PHASE_META[editor.phase] ?? PHASE_META.OFFENSIVE;
  const nodeHasChildren = node ? data.subprinciples.some((s) => s.parentId === node.id) : false;

  // Raíces candidatas de la misma fase (excluye el propio nodo)
  const parentOptions = data.subprinciples.filter(
    (s) => s.phase === editor.phase && !s.parentId && s.id !== node?.id,
  );

  function save() {
    startTransition(async () => {
      const res = await saveSubPrinciple({
        id: node?.id ?? "",
        phase: editor.phase,
        name,
        description: description.trim() || null,
        parentId: nodeHasChildren ? null : parentId,
      });
      if (res.ok) {
        toast({
          title: node
            ? "Subprincipio actualizado"
            : platform
              ? "Subprincipio creado en la Cátedra"
              : "Subprincipio creado en tu club",
          description: name,
          duration: 2000,
        });
        router.refresh();
        onClose();
      } else {
        toast({ title: "No se pudo guardar", description: res.error, duration: 5000 });
      }
    });
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="bg-white border-cream-border rounded-t-3xl max-h-[92vh] overflow-y-auto px-4 pb-6 pt-2"
      >
        <SheetHeader className="text-left pb-1">
          <SheetTitle className="text-xl font-black text-peel">
            {node ? "Editar subprincipio" : editor.parent ? "Nuevo detalle" : "Nuevo subprincipio"}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-1.5 text-sm">
            <span
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-black ${phaseMeta.chip}`}
            >
              {(() => {
                const Icon = phaseMeta.icon;
                return <Icon className="w-3.5 h-3.5" aria-hidden />;
              })()}
              {phaseMeta.label}
            </span>
            <span className="text-[#6c8070]">· la fase no se puede cambiar tras crear</span>
          </SheetDescription>
        </SheetHeader>

        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre — ej. «Salida de balón desde presión rival en 3/4»"
          maxLength={120}
          className="mt-2 min-h-[48px] rounded-2xl bg-cream-dark/70 border-cream-border text-peel placeholder:text-[#8a9a8d] font-semibold"
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción metodológica (opcional)"
          maxLength={500}
          rows={3}
          className="mt-2 rounded-2xl bg-cream-dark/70 border-cream-border text-peel placeholder:text-[#8a9a8d]"
        />

        {/* Jerarquía (solo si el nodo no tiene hijos) */}
        {nodeHasChildren ? (
          <p className="mt-3 text-xs text-[#6c8070]">
            Este subprincipio tiene detalles propios: se mantiene como raíz de la jerarquía.
          </p>
        ) : (
          <>
            <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest mt-4 mb-2">
              Jerarquía — ¿raíz o detalle de otro subprincipio?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setParentId(null)}
                aria-pressed={parentId === null}
                className={`min-h-[44px] px-3.5 rounded-2xl border text-sm font-bold transition ${
                  parentId === null
                    ? "bg-brand-600/15 border-emerald-500/50 text-brand-600"
                    : "bg-cream-dark/70 border-cream-border text-[#5d7263]"
                }`}
              >
                Raíz de la fase
              </button>
              {parentOptions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setParentId(p.id)}
                  aria-pressed={parentId === p.id}
                  className={`min-h-[44px] max-w-[48%] px-3.5 rounded-2xl border text-sm font-bold transition truncate ${
                    parentId === p.id
                      ? "bg-brand-600/15 border-emerald-500/50 text-brand-600"
                      : "bg-cream-dark/70 border-cream-border text-[#5d7263]"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}

        <Button
          onClick={save}
          disabled={saving}
          className="mt-4 w-full min-h-[56px] rounded-2xl bg-brand-600 hover:bg-brand text-white font-black text-base"
        >
          {saving ? (
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
          ) : (
            <>
              <PenLine className="w-5 h-5" aria-hidden />
              {node ? "Guardar cambios" : "Crear"}
            </>
          )}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

// ---------- Pestaña principal ----------

export function TaxonomyTab({
  data,
  canWrite,
  platform,
  onOpenTask,
  onEditTask,
  onNewTask,
}: {
  data: LibraryData;
  /** RBAC de presentación (el guard real vive en cada Server Action) */
  canWrite: boolean;
  /** Modo Plataforma: se edita el contenido global de la Cátedra */
  platform: boolean;
  onOpenTask: (t: TaskCard) => void;
  onEditTask: (t: TaskCard) => void;
  onNewTask: () => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    // Fases PLEGADAS por defecto (anatomía compacta del míster): un toque
    // abre cada fase; la página nunca arranca llena.
    Object.fromEntries(PHASE_ORDER.map((p) => [p, false])),
  );
  const [detail, setDetail] = useState<SPNode | null>(null);
  const [editor, setEditor] = useState<{
    node: SPNode | null;
    phase: string;
    parent: SPNode | null;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const rootsOf = (phase: string) =>
    data.subprinciples
      .filter((s) => s.phase === phase && !s.parentId)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const childrenOf = (id: string) =>
    data.subprinciples.filter((s) => s.parentId === id).sort((a, b) => a.order - b.order);
  const recipeCountOf = (id: string) =>
    data.tasks.reduce((acc, t) => acc + (t.recipes.some((r) => r.subPrincipleId === id) ? 1 : 0), 0);

  function runDuplicate(node: SPNode) {
    startTransition(async () => {
      const res = await duplicateSubPrincipleToClub(node.id);
      if (res.ok) {
        toast({
          title: "Subprincipio duplicado a tu club",
          description: "Ya puedes editarlo y anidar detalles propios.",
          duration: 2200,
        });
        router.refresh();
        setDetail(null);
      } else {
        toast({ title: "No se pudo duplicar", description: res.error, duration: 5000 });
      }
    });
  }

  function runDelete() {
    if (!detail) return;
    const target = detail;
    startTransition(async () => {
      const res = await deleteSubPrinciple(target.id);
      if (res.ok) {
        toast({ title: "Subprincipio eliminado", description: target.name, duration: 2000 });
        router.refresh();
        setConfirmDelete(false);
        setDetail(null);
      } else {
        toast({ title: "No se pudo eliminar", description: res.error, duration: 5000 });
        setConfirmDelete(false);
      }
    });
  }

  return (
    <div className="space-y-3">
      {PHASE_ORDER.map((phase) => {
        const meta = PHASE_META[phase];
        const Icon = meta.icon;
        const roots = rootsOf(phase);
        const phaseSPs = data.subprinciples.filter((s) => s.phase === phase);
        const hasIssue = phaseSPs.some((s) => s.issue);
        const expanded = open[phase] ?? false;

        return (
          <section
            key={phase}
            aria-label={`Fase ${meta.label}`}
            className="rounded-3xl border border-cream-border bg-white/65 overflow-hidden"
          >
            {/* Cabecera de fase */}
            <div className="flex items-center gap-2 px-3 py-3">
              <button
                onClick={() => setOpen((o) => ({ ...o, [phase]: !expanded }))}
                className="flex-1 min-w-0 flex items-center gap-2.5 text-left min-h-[44px]"
                aria-expanded={expanded}
              >
                <span
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${meta.chip}`}
                >
                  <Icon className="w-4.5 h-4.5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-black text-peel text-[15px] leading-tight truncate">
                    {meta.label}
                    {hasIssue && (
                      <AlertTriangle className="w-4 h-4 text-[#b4232a] inline ml-1.5 -mt-0.5" aria-label="Con hallazgos abiertos esta semana" />
                    )}
                  </span>
                  <span className="block text-[11px] text-[#6c8070] leading-tight truncate">
                    {roots.length} subprincipio{roots.length !== 1 ? "s" : ""} · {meta.desc}
                  </span>
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-[#6c8070] shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
                  aria-hidden
                />
              </button>
              {canWrite && (
                <button
                  onClick={() => setEditor({ node: null, phase, parent: null })}
                  className="shrink-0 min-h-[44px] min-w-[44px] rounded-xl border border-emerald-500/40 bg-brand-600/10 text-brand-600 flex items-center justify-center hover:bg-brand-600/20 transition"
                  aria-label={`Añadir subprincipio a ${meta.label}`}
                  title={platform ? "Añadir subprincipio de la Cátedra" : "Añadir subprincipio del club"}
                >
                  <Plus className="w-5 h-5" aria-hidden />
                </button>
              )}
            </div>

            {/* Árbol */}
            {expanded && (
              <div className="px-3 pb-3 space-y-2">
                {roots.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-cream-border px-4 py-4 text-center text-sm text-[#6c8070]">
                    Sin subprincipios en esta fase todavía.
                  </p>
                )}
                {roots.map((root) => {
                  const children = childrenOf(root.id);
                  return (
                    <div key={root.id} className="space-y-1.5">
                      <SPRow
                        node={root}
                        recipeCount={recipeCountOf(root.id)}
                        childCount={children.length}
                        onOpen={setDetail}
                      />
                      {children.map((c) => (
                        <div key={c.id} className="pl-5">
                          <SPRow
                            node={c}
                            child
                            recipeCount={recipeCountOf(c.id)}
                            childCount={0}
                            onOpen={setDetail}
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {/* ---------- Hoja de detalle del subprincipio ---------- */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent
          side="bottom"
          className="bg-white border-cream-border rounded-t-3xl max-h-[92vh] overflow-y-auto px-4 pb-8 pt-2"
        >
          {detail && (
            <>
              <SheetHeader className="text-left pb-1">
                <SheetTitle className="text-xl font-black text-peel leading-snug">
                  {detail.name}
                </SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-1.5 pt-1">
                  {(() => {
                    const origin = detail.clubId === null ? ORIGIN_META.cathedral : ORIGIN_META.club;
                    const OriginIcon = origin.icon;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-black ${origin.chip}`}
                        title={origin.hint}
                      >
                        <OriginIcon className="w-3.5 h-3.5" aria-hidden /> {origin.label}
                      </span>
                    );
                  })()}
                  {(() => {
                    const pMeta = PHASE_META[detail.phase] ?? PHASE_META.OFFENSIVE;
                    const Icon = pMeta.icon;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-black ${pMeta.chip}`}
                      >
                        <Icon className="w-3.5 h-3.5" aria-hidden /> {pMeta.label}
                      </span>
                    );
                  })()}
                </SheetDescription>
              </SheetHeader>

              {detail.description && (
                <p className="text-sm text-[#3d5844] leading-relaxed mt-1">{detail.description}</p>
              )}

              {/* Hallazgo del motor */}
              {detail.issue && (
                <div className="mt-3 rounded-2xl bg-[#c62f32]/10 border border-rose-500/40 px-3.5 py-3 flex gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-[#b4232a] shrink-0 mt-0.5" aria-hidden />
                  <div>
                    <p className="text-sm font-black text-[#b4232a]">
                      Falla esta semana (severidad {detail.issue.severity}/5)
                    </p>
                    <p className="text-sm text-[#8f1d22] mt-0.5 leading-snug">
                      {detail.issue.evidence}
                    </p>
                    <p className="text-[11px] text-[#6c8070] mt-1">
                      Las tareas con receta núcleo hacia aquí son la primera opción del motor para
                      el lunes.
                    </p>
                  </div>
                </div>
              )}

              {/* Detalles (hijos) */}
              {childrenOf(detail.id).length > 0 && (
                <>
                  <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest mt-5 mb-2">
                    Detalles del subprincipio
                  </p>
                  <div className="space-y-1.5">
                    {childrenOf(detail.id).map((c) => (
                      <SPRow
                        key={c.id}
                        node={c}
                        child
                        recipeCount={recipeCountOf(c.id)}
                        childCount={0}
                        onOpen={setDetail}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* RECETAS: tareas que lo resuelven (motor relacional bidireccional) */}
              <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest mt-5 mb-2">
                Tareas que lo resuelven (recetas del motor)
              </p>
              {(() => {
                const links = tasksForSubPrinciple(data.tasks, detail.id);
                if (links.length === 0)
                  return (
                    <p className="rounded-2xl border border-dashed border-cream-border-strong px-4 py-3 text-sm text-[#6c8070]">
                      Ninguna tarea conectada todavía. Abre una tarea de tu club y añade una receta
                      hacia este subprincipio — o crea una nueva.
                    </p>
                  );
                return (
                  <ul className="space-y-2">
                    {links.map(({ task, relevance, usageNote }) => {
                      const rel = RELEVANCE_META[relevance] ?? RELEVANCE_META[2];
                      const intensity = INTENSITY_META[task.intensity] ?? INTENSITY_META.MEDIUM;
                      return (
                        <li key={task.id}>
                          <button
                            onClick={() => onOpenTask(task)}
                            className="w-full rounded-2xl bg-cream-dark/60 border border-cream-border px-3 py-2.5 text-left hover:border-[#b9b49c] transition"
                            aria-label={`Abrir tarea ${task.title}`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black ${rel.chip}`}
                                title={rel.hint}
                              >
                                {relevance} · {rel.label}
                              </span>
                              <p className="text-sm font-bold text-peel flex-1 min-w-[50%] leading-snug">
                                {task.title}
                              </p>
                              <span
                                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold inline-flex items-center gap-1 ${intensity.chip}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${intensity.dot}`} aria-hidden />
                                {intensity.label}
                              </span>
                            </div>
                            {usageNote && (
                              <p className="text-xs italic text-[#5d7263] mt-1.5 leading-snug">
                                «{usageNote}»
                              </p>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}

              {/* Acciones (RBAC: solo roles de escritura; el alcance depende del modo) */}
              <div className="mt-5 space-y-2">
                {canWrite && (!platform || detail.clubId === null) && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() =>
                          setEditor({
                            node: detail,
                            phase: detail.phase,
                            parent: null,
                          })
                        }
                        className="min-h-[52px] rounded-2xl bg-brand-600 hover:bg-brand text-white font-black"
                      >
                        <PenLine className="w-5 h-5" aria-hidden /> Editar
                      </Button>
                      <Button
                        onClick={() => setEditor({ node: null, phase: detail.phase, parent: detail })}
                        className="min-h-[52px] rounded-2xl bg-cream-dark hover:bg-cream-border-strong text-peel font-black border border-cream-border-strong"
                      >
                        <Plus className="w-5 h-5" aria-hidden /> Detalle
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmDelete(true)}
                      disabled={busy}
                      className="w-full min-h-[48px] rounded-2xl border-cream-border-strong bg-cream text-[#b4232a] hover:bg-[#c62f32]/10 hover:text-[#b4232a] font-bold"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden /> Eliminar subprincipio
                    </Button>
                  </>
                )}
                {canWrite && detail.clubId === null && !platform && (
                  <Button
                    onClick={() => runDuplicate(detail)}
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
                    Solo lectura: tu rol consulta la biblioteca sin modificarla.
                  </p>
                )}
                {canWrite && (
                  <Button
                    variant="ghost"
                    onClick={onNewTask}
                    className="w-full min-h-[44px] rounded-2xl text-[#5d7263] hover:text-[#2a4630] font-bold"
                  >
                    <BookOpen className="w-4 h-4" aria-hidden /> Crear una tarea para este objetivo
                  </Button>
                )}
              </div>

              <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent className="bg-white border-cream-border rounded-3xl max-w-sm mx-auto">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-peel">
                      ¿Eliminar «{detail.name}»?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-[#5d7263]">
                      Sus detalles quedarán como raíces y las recetas conectadas se desconectarán.
                      Los hallazgos históricos del motor conservan su evidencia.
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

      {/* ---------- Editor ---------- */}
      {editor && (
        <SPEditorSheet editor={editor} data={data} platform={platform} onClose={() => setEditor(null)} />
      )}
    </div>
  );
}
