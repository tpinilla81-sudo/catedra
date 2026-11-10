"use client";

// ============================================================================
// PILAR 1 — EDITOR DE FICHA DE TAREA (creación / edición)
// ----------------------------------------------------------------------------
// Ficha profesional completa con todos los metadatos de ingeniería:
//   • Dimensiones del espacio (largo/ancho en m + nota)
//   • Jugadores mín/máx, duración, repeticiones, intensidad
//   • Reglas de provocación / puntos de co-achéo / materiales (listas rápidas)
//   • Fases del juego (multi-selección)
//   • MOTOR DE RECETAS: conexión bidireccional con la taxonomía ponderando
//     relevancia 1-3 (Núcleo / Refuerza / Apoyo) + nota de uso.
// El contenido de la Cátedra no llega aquí (solo lectura) — se abre siempre
// sobre una copia del club o sobre una tarea nueva.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { saveTask, type TaskInput } from "@/app/dashboard/library/actions";
import {
  INTENSITY_META,
  ORIGIN_META,
  PHASE_META,
  PHASE_ORDER,
  RELEVANCE_META,
  normalizeName,
} from "@/lib/taxonomy";
import type { SPNode, TaskCard } from "@/components/library/types";
import type { Animacion } from "@/lib/animaciones-ejercicio";
import { TacticalAnimationBuilder } from "@/components/library/tactical-animation-builder";
import { useToast } from "@/hooks/use-toast";

type RecipeDraft = { subPrincipleId: string; relevance: number; usageNote: string };

type Draft = {
  title: string;
  objective: string;
  phases: string[];
  spaceLengthM: string;
  spaceWidthM: string;
  spaceNote: string;
  playersMin: number;
  playersMax: string;
  durationMin: number;
  repetitions: string;
  intensity: string;
  rules: string[];
  points: string[];
  materials: string[];
  diagramUrl: string;
  /** Pizarra animada personalizada (null = sin pizarra propia) */
  animationData: Animacion | null;
  recipes: RecipeDraft[];
};

function initialDraft(task: TaskCard | null): Draft {
  return {
    title: task?.title ?? "",
    objective: task?.objective ?? "",
    phases: task ? [...task.phases] : [],
    spaceLengthM: task?.spaceLengthM != null ? String(task.spaceLengthM) : "",
    spaceWidthM: task?.spaceWidthM != null ? String(task.spaceWidthM) : "",
    spaceNote: task?.spaceNote ?? "",
    playersMin: task?.playersMin ?? 10,
    playersMax: task?.playersMax != null ? String(task.playersMax) : "",
    durationMin: task?.durationMin ?? 20,
    repetitions: task?.repetitions ?? "",
    intensity: task?.intensity ?? "MEDIUM",
    rules: task ? [...task.rulesOfProvocation] : [],
    points: task ? [...task.coachingPoints] : [],
    materials: task ? [...task.materials] : [],
    diagramUrl: task?.diagramUrl ?? "",
    animationData: task?.animationData ?? null,
    recipes: task
      ? task.recipes.map((r) => ({
          subPrincipleId: r.subPrincipleId,
          relevance: r.relevance,
          usageNote: r.usageNote ?? "",
        }))
      : [],
  };
}

// ---------- Editor de listas rápidas (Enter o [+], chip con X) ----------

function ListEditor({
  label,
  placeholder,
  items,
  onChange,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [v, setV] = useState("");

  function add() {
    const s = v.trim().slice(0, 160);
    if (!s || items.includes(s)) {
      setV("");
      return;
    }
    onChange([...items, s]);
    setV("");
  }

  return (
    <div className="rounded-2xl bg-cream-dark/60 p-3">
      <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest">{label}</p>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {items.map((it) => (
            <span
              key={it}
              className="inline-flex items-center gap-1 rounded-lg bg-white border border-cream-border-strong pl-2 pr-1 py-1 text-xs font-semibold text-[#2a4630]"
            >
              {it}
              <button
                type="button"
                onClick={() => onChange(items.filter((x) => x !== it))}
                aria-label={`Quitar: ${it}`}
                className="w-6 h-6 rounded-md flex items-center justify-center text-[#6c8070] hover:text-[#b4232a] hover:bg-[#c62f32]/10"
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-2">
        <Input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          maxLength={160}
          className="min-h-[44px] rounded-xl bg-cream border-cream-border-strong text-peel placeholder:text-[#8a9a8d]"
        />
        <Button
          type="button"
          size="icon"
          onClick={add}
          aria-label={`Añadir a ${label}`}
          className="h-11 w-11 shrink-0 rounded-xl bg-cream border border-cream-border-strong text-brand-600 hover:bg-brand-600/10"
        >
          <Plus className="w-5 h-5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

// ---------- Stepper táctil (jugadores / duración) ----------

function Stepper({
  label,
  suffix,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  suffix?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-cream-dark/70 px-3 py-2">
      <span className="text-sm font-semibold text-[#3d5844]">
        {label}
        {suffix ? <span className="text-[#6c8070]"> ({suffix})</span> : null}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-2xl border-cream-border-strong bg-cream text-[#2a4630] hover:bg-cream-dark"
          onClick={() => onChange(Math.max(min, value - step))}
          aria-label={`Bajar ${label}`}
        >
          <Minus className="w-5 h-5" aria-hidden />
        </Button>
        <span className="w-10 text-center text-xl font-black text-peel" aria-live="polite">
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-2xl border-cream-border-strong bg-cream text-[#2a4630] hover:bg-cream-dark"
          onClick={() => onChange(Math.min(max, value + step))}
          aria-label={`Subir ${label}`}
        >
          <Plus className="w-5 h-5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold text-[#6c8070] uppercase tracking-widest mt-5 mb-2 first:mt-1">
      {children}
    </p>
  );
}

// ---------- Editor principal ----------

export function TaskEditor({
  task,
  subprinciples,
  platform = false,
  onClose,
}: {
  task: TaskCard | null;
  subprinciples: SPNode[];
  /** Modo Plataforma: la ficha se crea/edita como contenido global de la Cátedra */
  platform?: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(task));
  const [spQuery, setSpQuery] = useState("");
  const [saving, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Subprincipios disponibles para conectar (visible para el club y aún no conectados)
  const spCandidates = useMemo(() => {
    const q = normalizeName(spQuery);
    const connected = new Set(draft.recipes.map((r) => r.subPrincipleId));
    return subprinciples
      .filter((s) => !connected.has(s.id))
      .filter((s) => (q ? normalizeName(s.name).includes(q) : true))
      .slice(0, 8);
  }, [subprinciples, draft.recipes, spQuery]);

  function addRecipe(sp: SPNode) {
    setDraft((d) => ({
      ...d,
      recipes: [...d.recipes, { subPrincipleId: sp.id, relevance: 3, usageNote: "" }].slice(0, 12),
    }));
    setSpQuery("");
  }

  function save() {
    const payload: TaskInput = {
      id: task?.id ?? "",
      title: draft.title,
      objective: draft.objective,
      phases: draft.phases,
      spaceLengthM: draft.spaceLengthM.trim() ? Number(draft.spaceLengthM) : null,
      spaceWidthM: draft.spaceWidthM.trim() ? Number(draft.spaceWidthM) : null,
      spaceNote: draft.spaceNote,
      playersMin: draft.playersMin,
      playersMax: draft.playersMax.trim() ? Number(draft.playersMax) : null,
      durationMin: draft.durationMin,
      repetitions: draft.repetitions,
      intensity: draft.intensity,
      rulesOfProvocation: draft.rules,
      coachingPoints: draft.points,
      materials: draft.materials,
      diagramUrl: draft.diagramUrl,
      // La pizarra viaja con la ficha: guardar la tarea guarda la animación
      animationData: draft.animationData,
      recipes: draft.recipes.map((r) => ({
        subPrincipleId: r.subPrincipleId,
        relevance: r.relevance,
        usageNote: r.usageNote.trim() || null,
      })),
    };

    startTransition(async () => {
      const res = await saveTask(payload);
      if (res.ok) {
        toast({
          title: task
            ? "Ficha actualizada"
            : platform
              ? "Tarea creada en la Cátedra"
              : "Tarea creada en tu club",
          description: draft.title,
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
        className="bg-white border-cream-border rounded-t-3xl max-h-[94vh] px-4 pb-4 pt-2 overflow-y-auto"
      >
        <SheetHeader className="text-left pb-1">
          <SheetTitle className="text-xl font-black text-peel">
            {task ? "Editar tarea" : platform ? "Nueva tarea de la Cátedra" : "Nueva tarea del club"}
          </SheetTitle>
          <SheetDescription className="text-[#5d7263] text-sm">
            Ficha de ingeniería: espacio, jugadores, intensidad y recetas hacia la taxonomía.
          </SheetDescription>
        </SheetHeader>

        {/* ---------- Identidad ---------- */}
        <SectionTitle>Identidad de la tarea</SectionTitle>
        <Input
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Título — ej. «Salida de balón 4+3 bajo presión media»"
          maxLength={120}
          className="min-h-[48px] rounded-2xl bg-cream-dark/70 border-cream-border text-peel placeholder:text-[#8a9a8d] font-semibold"
        />
        <Textarea
          value={draft.objective}
          onChange={(e) => set("objective", e.target.value)}
          placeholder="Objetivo en lenguaje de míster — ¿qué se busca entrenar?"
          maxLength={600}
          rows={3}
          className="mt-2 rounded-2xl bg-cream-dark/70 border-cream-border text-peel placeholder:text-[#8a9a8d]"
        />

        {/* ---------- Fases del juego ---------- */}
        <SectionTitle>Fases del juego que trabaja</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {PHASE_ORDER.map((p) => {
            const meta = PHASE_META[p];
            const Icon = meta.icon;
            const selected = draft.phases.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() =>
                  set(
                    "phases",
                    selected ? draft.phases.filter((x) => x !== p) : [...draft.phases, p],
                  )
                }
                aria-pressed={selected}
                className={`min-h-[52px] rounded-2xl border px-3 py-2 text-left text-sm font-bold transition ${
                  selected ? meta.chip : "bg-cream-dark/70 border-cream-border text-[#5d7263]"
                }`}
              >
                <Icon className="w-4 h-4 inline mr-1.5 -mt-0.5" aria-hidden />
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* ---------- Ingeniería del espacio y la carga ---------- */}
        <SectionTitle>Ingeniería del espacio y la carga</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-cream-dark/70 px-3 py-2">
            <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest">
              LARGO (M)
            </p>
            <Input
              type="number"
              inputMode="numeric"
              min={3}
              max={140}
              value={draft.spaceLengthM}
              onChange={(e) => set("spaceLengthM", e.target.value)}
              placeholder="—"
              className="mt-1 h-11 rounded-xl bg-cream border-cream-border-strong text-peel text-lg font-black placeholder:text-[#8a9a8d]"
            />
          </div>
          <div className="rounded-2xl bg-cream-dark/70 px-3 py-2">
            <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest">
              ANCHO (M)
            </p>
            <Input
              type="number"
              inputMode="numeric"
              min={3}
              max={140}
              value={draft.spaceWidthM}
              onChange={(e) => set("spaceWidthM", e.target.value)}
              placeholder="—"
              className="mt-1 h-11 rounded-xl bg-cream border-cream-border-strong text-peel text-lg font-black placeholder:text-[#8a9a8d]"
            />
          </div>
        </div>
        <Input
          value={draft.spaceNote}
          onChange={(e) => set("spaceNote", e.target.value)}
          placeholder="Nota del espacio — ej. «con dos zonas laterales libres»"
          maxLength={200}
          className="mt-2 min-h-[44px] rounded-2xl bg-cream-dark/70 border-cream-border text-peel placeholder:text-[#8a9a8d]"
        />

        <div className="space-y-2 mt-2">
          <Stepper
            label="Jugadores mínimo"
            value={draft.playersMin}
            onChange={(v) => set("playersMin", v)}
            min={1}
            max={40}
          />
          <div className="flex items-center justify-between rounded-2xl bg-cream-dark/70 px-3 py-2">
            <span className="text-sm font-semibold text-[#3d5844]">Jugadores máximo</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={40}
              value={draft.playersMax}
              onChange={(e) => set("playersMax", e.target.value)}
              placeholder="libre"
              className="w-24 h-11 rounded-xl bg-cream border-cream-border-strong text-peel text-lg font-black text-center placeholder:text-[#8a9a8d] placeholder:text-sm placeholder:font-semibold"
            />
          </div>
          <Stepper
            label="Duración"
            suffix="min"
            value={draft.durationMin}
            onChange={(v) => set("durationMin", v)}
            min={1}
            max={180}
            step={5}
          />
          <Input
            value={draft.repetitions}
            onChange={(e) => set("repetitions", e.target.value)}
            placeholder="Repeticiones — ej. «3 series x 6'»"
            maxLength={80}
            className="min-h-[44px] rounded-2xl bg-cream-dark/70 border-cream-border text-peel placeholder:text-[#8a9a8d]"
          />
        </div>

        {/* ---------- Intensidad ---------- */}
        <SectionTitle>Intensidad — el motor la cruza con la fatiga del Pulso</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {(["LOW", "MEDIUM", "HIGH"] as const).map((i) => {
            const meta = INTENSITY_META[i];
            const selected = draft.intensity === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => set("intensity", i)}
                aria-pressed={selected}
                className={`min-h-[52px] rounded-2xl border text-sm font-bold transition flex items-center justify-center gap-2 ${
                  selected ? meta.chip : "bg-cream-dark/70 border-cream-border text-[#5d7263]"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} aria-hidden />
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* ---------- Listas de conocimiento ---------- */}
        <SectionTitle>Reglas de provocación</SectionTitle>
        <ListEditor
          label="Reglas que provocan el comportamiento objetivo"
          placeholder="ej. «robo en 5s = gol vale doble»"
          items={draft.rules}
          onChange={(items) => set("rules", items)}
        />

        <SectionTitle>Puntos de co-achéo</SectionTitle>
        <ListEditor
          label="Claves para el segundo entrenador en el campo"
          placeholder="ej. «ángulos de pase superiores a 45°»"
          items={draft.points}
          onChange={(items) => set("points", items)}
        />

        <SectionTitle>Materiales</SectionTitle>
        <ListEditor
          label="Material necesario"
          placeholder="ej. «conos», «petos 2 colores»…"
          items={draft.materials}
          onChange={(items) => set("materials", items)}
        />

        <SectionTitle>Diagrama (opcional)</SectionTitle>
        <Input
          value={draft.diagramUrl}
          onChange={(e) => set("diagramUrl", e.target.value)}
          placeholder="URL de la pizarra / esquema (http…)"
          maxLength={300}
          inputMode="url"
          className="min-h-[44px] rounded-2xl bg-cream-dark/70 border-cream-border text-peel placeholder:text-[#8a9a8d]"
        />

        {/* ---------- PIZARRA TÁCTICA ANIMADA (se guarda con la ficha) ---------- */}
        <div className="mt-5">
          <TacticalAnimationBuilder
            value={draft.animationData}
            onChange={(anim) => set("animationData", anim)}
          />
        </div>

        {/* ---------- MOTOR DE RECETAS ---------- */}
        <SectionTitle>
          Recetas — qué subprincipios corrige esta tarea (relevancia 1-3)
        </SectionTitle>
        <div className="rounded-2xl bg-cream-dark/60 p-3">
          <Input
            value={spQuery}
            onChange={(e) => setSpQuery(e.target.value)}
            placeholder="Buscar subprincipio para conectar…"
            className="min-h-[44px] rounded-xl bg-cream border-cream-border-strong text-peel placeholder:text-[#8a9a8d]"
            aria-label="Buscar subprincipio"
          />
          {spQuery.trim() && spCandidates.length > 0 && (
            <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-cream-border divide-y divide-cream-border">
              {spCandidates.map((s) => {
                const pMeta = PHASE_META[s.phase] ?? PHASE_META.OFFENSIVE;
                const origin = s.clubId === null ? ORIGIN_META.cathedral : ORIGIN_META.club;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addRecipe(s)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-cream-dark/75 min-h-[44px]"
                  >
                    <span className="text-sm font-semibold text-[#2a4630] flex-1 min-w-0 truncate">
                      {s.name}
                    </span>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black border ${pMeta.chip}`}
                    >
                      {pMeta.label}
                    </span>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black border ${origin.chip}`}
                    >
                      {origin.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {spQuery.trim() && spCandidates.length === 0 && (
            <p className="text-xs text-[#6c8070] mt-2">Sin resultados para «{spQuery}».</p>
          )}

          {/* Recetas conectadas */}
          {draft.recipes.length > 0 ? (
            <div className="mt-3 space-y-2">
              {draft.recipes.map((r) => {
                const sp = subprinciples.find((s) => s.id === r.subPrincipleId);
                return (
                  <div key={r.subPrincipleId} className="rounded-xl bg-white border border-cream-border p-2.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-peel flex-1 min-w-0 truncate">
                        {sp?.name ?? "subprincipio"}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            "recipes",
                            draft.recipes.filter((x) => x.subPrincipleId !== r.subPrincipleId),
                          )
                        }
                        aria-label={`Quitar receta: ${sp?.name ?? ""}`}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6c8070] hover:text-[#b4232a] hover:bg-[#c62f32]/10 shrink-0"
                      >
                        <X className="w-4 h-4" aria-hidden />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                      {([3, 2, 1] as const).map((rel) => {
                        const meta = RELEVANCE_META[rel];
                        const active = r.relevance === rel;
                        return (
                          <button
                            key={rel}
                            type="button"
                            onClick={() =>
                              set(
                                "recipes",
                                draft.recipes.map((x) =>
                                  x.subPrincipleId === r.subPrincipleId
                                    ? { ...x, relevance: rel }
                                    : x,
                                ),
                              )
                            }
                            aria-pressed={active}
                            title={meta.hint}
                            className={`min-h-[40px] rounded-lg border text-xs font-black transition ${
                              active ? meta.btn : "bg-cream border-cream-border text-[#6c8070]"
                            }`}
                          >
                            {rel} · {meta.label}
                          </button>
                        );
                      })}
                    </div>
                    <Input
                      value={r.usageNote}
                      onChange={(e) =>
                        set(
                          "recipes",
                          draft.recipes.map((x) =>
                            x.subPrincipleId === r.subPrincipleId
                              ? { ...x, usageNote: e.target.value }
                              : x,
                          ),
                        )
                      }
                      placeholder="Nota de uso — ¿cuándo usarla para este objetivo?"
                      maxLength={200}
                      className="mt-2 min-h-[40px] rounded-xl bg-cream border-cream-border text-peel text-sm placeholder:text-[#8a9a8d]"
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[#6c8070] mt-2">
              Sin recetas la tarea no aparecerá en la prescripción del motor. Conéctala a la
              taxonomía para que el lunes sepa cuándo usarla.
            </p>
          )}
        </div>

        {/* ---------- Guardar ---------- */}
        <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-1 bg-gradient-to-t from-zinc-900 via-zinc-900 to-transparent">
          <Button
            onClick={save}
            disabled={saving}
            className="w-full min-h-[56px] rounded-2xl bg-brand-600 hover:bg-brand text-white font-black text-base"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
            ) : (
              <>
                <Save className="w-5 h-5" aria-hidden />
                {task ? "Guardar cambios" : "Crear tarea"}
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
