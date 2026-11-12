"use client";

// ============================================================================
// PILAR 2 — FICHA DE RENDIMIENTO COMPLETA DEL JUGADOR /dashboard/players/[id]
// (mock del míster 'PlayerProfileEvaluationView' · MÉTODO // SUITE TÁCTICA)
// ----------------------------------------------------------------------------
// Evaluación 1:1 con 6 bloques × 8 métricas (nota 1-10 con steppers ±),
// media por bloque en la cabecera de cada bloque, métricas «Libre N» con
// nombre editable (Principios Tácticos: los 8 configurables) y — mock
// 'FichaRendimiento' — AÑADIR MÉTRICAS DINÁMICAS por bloque: input «Añadir
// nueva métrica...» + «+ Añadir» que engancha una fila custom (nota 5,
// editable) al bloque. Botones «Exportar Informe» (.txt descargable) y
// «Guardar Evaluación» (Server Action con upsert). Estilo de la casa:
// crema/verde — NADA del slate oscuro del mock; el código de color de
// bloques se mantiene con acentos.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Download, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { savePlayerEvaluation } from "@/app/dashboard/players/actions";
import {
  blockAverage,
  defaultEvaluationData,
  EVAL_METRICS_MAX_PER_BLOCK,
  EVAL_SCORE_MAX,
  EVAL_SCORE_MIN,
  normalizeEvaluationData,
  overallAverage,
  scoreClass,
  type EvalBlock,
  type EvalMetric,
  type PlayerEvaluationData,
} from "@/lib/player-evaluation";

export type EvalPlayerData = {
  id: string;
  firstName: string;
  lastName: string;
  shirtNumber: number | null;
  primaryPosition: string;
};

export function PlayerEvaluationView({
  player,
  initialData,
  canWrite,
  savedAt,
}: {
  player: EvalPlayerData;
  /** Evaluación vigente normalizada (o null → ficha nueva en blanco) */
  initialData: PlayerEvaluationData | null;
  /** Guard autoritativo en el servidor; aquí solo oculta controles */
  canWrite: boolean;
  /** Fecha ISO del último guardado (null → ficha sin guardar aún) */
  savedAt: string | null;
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<PlayerEvaluationData>(
    () => initialData ?? defaultEvaluationData(),
  );
  const [saving, startTransition] = useTransition();

  const dirty = useMemo(() => {
    if (!initialData) return true;
    return JSON.stringify(blocks) !== JSON.stringify(initialData);
  }, [blocks, initialData]);

  // ---------- Steppers 1-10 (mock: Math.max(1, Math.min(10, score+delta))) ----------
  function adjustScore(blockKey: string, metricIndex: number, delta: number) {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.key !== blockKey) return b;
        const metrics = b.metrics.map((m, i) => {
          if (i !== metricIndex) return m;
          const next = Math.min(EVAL_SCORE_MAX, Math.max(EVAL_SCORE_MIN, m.score + delta));
          return { ...m, score: next };
        });
        return { ...b, metrics };
      }),
    );
  }

  function renameMetric(blockKey: string, metricIndex: number, label: string) {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.key !== blockKey) return b;
        const metrics = b.metrics.map((m, i) =>
          i === metricIndex ? { ...m, label: label.slice(0, 60) } : m,
        );
        return { ...b, metrics };
      }),
    );
  }

  // ---------- Métrica DINÁMICA (mock 'FichaRendimiento': «+ Añadir») ----------
  function addMetric(blockKey: string, rawLabel: string) {
    const label = rawLabel.trim().slice(0, 60);
    if (!label) return false;
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.key !== blockKey) return b;
        if (b.metrics.length >= EVAL_METRICS_MAX_PER_BLOCK) return b;
        return {
          ...b,
          metrics: [...b.metrics, { label, score: 5, custom: true }],
        };
      }),
    );
    return true;
  }

  // ---------- Guardar (Server Action, upsert de la ficha vigente) ----------
  function save() {
    startTransition(async () => {
      const res = await savePlayerEvaluation(player.id, blocks);
      if (res.ok) {
        toast.success("Evaluación guardada", {
          description: `${player.firstName} ${player.lastName} · media ${overallAverage(blocks)}`,
          duration: 2000,
        });
        router.refresh();
      } else {
        toast.error("No se pudo guardar", { description: res.error, duration: 5000 });
      }
    });
  }

  // ---------- Exportar informe (.txt descargable, sin backend) ----------
  function exportReport() {
    const lines: string[] = [];
    lines.push("MÉTODO // SUITE TÁCTICA — INFORME DE RENDIMIENTO DE JUGADOR");
    lines.push("=".repeat(64));
    lines.push(`Jugador : ${player.firstName} ${player.lastName}${player.shirtNumber !== null ? ` (#${player.shirtNumber})` : ""}`);
    lines.push(`Posición: ${player.primaryPosition}`);
    lines.push(`Generado: ${new Date().toLocaleString("es-ES")}`);
    if (savedAt) lines.push(`Guardado: ${new Date(savedAt).toLocaleString("es-ES")}`);
    lines.push(`MEDIA GLOBAL: ${overallAverage(blocks)} / 10`);
    lines.push("");
    for (const b of blocks) {
      lines.push(`— ${b.title.toUpperCase()} — media ${blockAverage(b)}`);
      for (const m of b.metrics) {
        const bar = "●".repeat(Math.round(m.score / 2)) + "○".repeat(5 - Math.round(m.score / 2));
        lines.push(`   ${m.label.padEnd(34, ".")} ${String(m.score).padStart(2)} /10  ${bar}${m.custom ? "  (configurable)" : ""}`);
      }
      lines.push("");
    }
    lines.push("Notas 1-10 · ≥8 verde · ≥6 ámbar · generado por CÁTEDRA by Método");

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe-${player.firstName}-${player.lastName}.txt`.toLowerCase().replace(/\s+/g, "-");
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const dirtyBadge = dirty
    ? "Cambios sin guardar"
    : savedAt
      ? `Guardada ${new Date(savedAt).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
      : "Ficha nueva";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ================= ZONA FIJA: cabecera del jugador ================= */}
      <div className="flex-none border-b border-cream-border bg-white/85 backdrop-blur z-10">
        <header className="mx-auto max-w-5xl px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                onClick={() => router.push("/dashboard/players")}
                data-testid="eval-back"
                aria-label="Volver a la plantilla"
                className="shrink-0 w-9 h-9 rounded-xl bg-cream border border-cream-border flex items-center justify-center text-[#5d7263] hover:text-brand-600 hover:border-brand-500 transition"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden />
              </button>
              <div className="w-11 h-11 rounded-2xl bg-brand-600 text-white font-black flex items-center justify-center text-sm shrink-0">
                #{player.shirtNumber ?? "–"}
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-black text-peel leading-tight truncate" data-testid="eval-title">
                  {player.firstName} {player.lastName}
                </h1>
                <p className="text-[11px] text-[#6c8070] leading-tight truncate">
                  Posición: <b>{player.primaryPosition}</b> // Ficha Técnica de Rendimiento
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <span
                data-testid="eval-state"
                className={`hidden sm:inline-flex rounded-xl border px-2.5 py-1.5 text-[10px] font-black ${
                  dirty
                    ? "border-[#8a6206]/40 bg-[#8a6206]/10 text-[#8a6206]"
                    : "border-brand-500/40 bg-brand-600/10 text-brand-600"
                }`}
              >
                {dirtyBadge}
              </span>
              <Button
                onClick={exportReport}
                data-testid="eval-export"
                variant="outline"
                className="min-h-[44px] rounded-2xl border-cream-border-strong bg-white text-[#2a4630] hover:border-brand-500 font-bold text-sm px-3"
              >
                <Download className="w-4 h-4" aria-hidden />
                <span className="hidden sm:inline">Exportar Informe</span>
                <span className="sm:hidden">Informe</span>
              </Button>
              {canWrite ? (
                <Button
                  onClick={save}
                  disabled={saving}
                  data-testid="eval-save"
                  className="min-h-[44px] rounded-2xl bg-brand-600 hover:bg-brand text-white font-black text-sm px-3"
                >
                  <Save className="w-4 h-4" aria-hidden />
                  <span className="hidden sm:inline">Guardar Evaluación</span>
                  <span className="sm:hidden">Guardar</span>
                </Button>
              ) : (
                <span className="rounded-xl border border-cream-border bg-white px-3 py-1.5 text-[11px] font-bold text-[#6c8070]">
                  Solo lectura
                </span>
              )}
            </div>
          </div>
          <p className="sm:hidden mt-1 text-[10px] font-black pl-14" style={{ color: dirty ? "#8a6206" : "#1f7a3d" }}>
            {dirtyBadge}
          </p>
        </header>
      </div>

      {/* ================= SCROLL: 6 bloques × 8 métricas ================= */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
            data-testid="eval-root"
          >
            {blocks.map((block, bi) => (
              <Block
                key={block.key}
                block={block}
                index={bi}
                canWrite={canWrite}
                onAdjust={adjustScore}
                onRename={renameMetric}
                onAdd={addMetric}
              />
            ))}
          </div>

          {/* Resumen global (añadido útil: media de las 48 métricas) */}
          <div className="mt-3 rounded-2xl border border-cream-border bg-white px-4 py-3 flex items-center justify-between" data-testid="eval-global">
            <p className="text-sm font-black text-peel">Media global de la ficha</p>
            <p className="text-lg font-black text-brand-600" data-testid="eval-global-score">
              {overallAverage(blocks)} <span className="text-xs text-[#6c8070]">/ 10</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// BLOQUE DE EVALUACIÓN (los 6 son idénticos: solo cambia el acento)
// ============================================================================

function Block({
  block,
  index,
  canWrite,
  onAdjust,
  onRename,
  onAdd,
}: {
  block: EvalBlock;
  index: number;
  canWrite: boolean;
  onAdjust: (blockKey: string, metricIndex: number, delta: number) => void;
  onRename: (blockKey: string, metricIndex: number, label: string) => void;
  onAdd: (blockKey: string, label: string) => boolean;
}) {
  return (
    <section
      className="rounded-2xl border border-cream-border bg-white overflow-hidden"
      data-testid={`eval-block-${block.key}`}
    >
      {/* Cabecera del bloque: acento suave + media (Avg del mock) */}
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{
          backgroundColor: `${block.accent}14`,
          borderBottom: `1px solid ${block.accent}30`,
        }}
      >
        <h2 className="text-[13px] font-black tracking-wide uppercase" style={{ color: block.accent }}>
          {index + 1}. {block.title}
        </h2>
        <span
          className="text-[10px] font-black rounded-lg px-1.5 py-0.5 font-mono"
          style={{ backgroundColor: `${block.accent}1f`, color: block.accent }}
          data-testid={`eval-avg-${block.key}`}
        >
          Avg: {blockAverage(block)}
        </span>
      </div>

      {/* Métricas: grid 2 columnas (mock) con steppers ± */}
      <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {block.metrics.map((m, mi) => (
          <MetricRow
            key={`${block.key}-${mi}`}
            metric={m}
            accent={block.accent}
            blockKey={block.key}
            index={mi}
            canWrite={canWrite}
            onAdjust={onAdjust}
            onRename={onRename}
          />
        ))}
      </div>

      {/* Métrica DINÁMICA (mock 'FichaRendimiento'): «Añadir nueva métrica...» + «+ Añadir» */}
      {canWrite && block.metrics.length < EVAL_METRICS_MAX_PER_BLOCK && (
        <AddMetricRow blockKey={block.key} onAdd={onAdd} />
      )}
    </section>
  );
}

function AddMetricRow({
  blockKey,
  onAdd,
}: {
  blockKey: string;
  onAdd: (blockKey: string, label: string) => boolean;
}) {
  const [value, setValue] = useState("");

  function submit() {
    if (onAdd(blockKey, value)) setValue("");
  }

  return (
    <div className="flex gap-1.5 mt-1 px-1 pb-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Añadir nueva métrica..."
        maxLength={60}
        aria-label={`Nombre de la nueva métrica del bloque ${blockKey}`}
        data-testid={`eval-addinput-${blockKey}`}
        className="flex-1 min-w-0 min-h-[40px] rounded-xl border border-dashed border-cream-border-strong bg-cream/50 px-2.5 text-[12px] font-semibold text-[#3d5844] placeholder:text-[#8a9a8d] focus:outline-none focus:border-solid focus:border-brand-500"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim()}
        aria-label={`Añadir métrica al bloque ${blockKey}`}
        data-testid={`eval-addbtn-${blockKey}`}
        className="shrink-0 min-h-[40px] px-3 rounded-xl bg-brand-600 text-white text-[12px] font-black hover:bg-brand disabled:opacity-40 transition inline-flex items-center gap-1"
      >
        <Plus className="w-3.5 h-3.5" aria-hidden />
        Añadir
      </button>
    </div>
  );
}

function MetricRow({
  metric,
  accent,
  blockKey,
  index,
  canWrite,
  onAdjust,
  onRename,
}: {
  metric: EvalMetric;
  accent: string;
  blockKey: string;
  index: number;
  canWrite: boolean;
  onAdjust: (blockKey: string, metricIndex: number, delta: number) => void;
  onRename: (blockKey: string, metricIndex: number, label: string) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-1.5 rounded-xl border px-2 py-1.5 transition ${
        metric.custom
          ? "border-dashed border-cream-border-strong bg-cream/50"
          : "border-cream-border bg-cream"
      }`}
      data-testid={`eval-metric-${blockKey}-${index}`}
    >
      <span className="min-w-0 flex items-center gap-1.5 flex-1">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: metric.custom ? "transparent" : accent, boxShadow: metric.custom ? `inset 0 0 0 1.5px ${accent}66` : undefined }}
          aria-hidden
        />
        {metric.custom && canWrite ? (
          <input
            type="text"
            value={metric.label}
            onChange={(e) => onRename(blockKey, index, e.target.value)}
            maxLength={60}
            aria-label={`Nombre de la métrica configurable del bloque ${blockKey} (${index + 1})`}
            placeholder="Nombre libre…"
            data-testid={`eval-label-input-${blockKey}-${index}`}
            className="min-w-0 w-full bg-transparent text-[12px] font-semibold text-[#3d5844] placeholder:text-[#8a9a8d] focus:outline-none focus:bg-white focus:rounded-lg focus:px-1 border-b border-dashed border-cream-border-strong focus:border-solid focus:border-brand-500"
          />
        ) : (
          <span
            className={`text-[12px] font-semibold truncate ${metric.custom ? "text-[#5d7263]" : "text-[#2a4630]"}`}
            title={metric.label}
          >
            {metric.label}
          </span>
        )}
      </span>

      {/* Stepper 1-10 (táctil: botones de 32px) */}
      <span className="shrink-0 flex items-center gap-0.5 rounded-lg border border-cream-border-strong bg-white px-1 py-0.5">
        <button
          onClick={() => onAdjust(blockKey, index, -1)}
          disabled={!canWrite || metric.score <= EVAL_SCORE_MIN}
          aria-label={`Bajar nota de ${metric.label}`}
          data-testid={`eval-minus-${blockKey}-${index}`}
          className="w-8 h-8 rounded-md flex items-center justify-center text-[#6c8070] hover:bg-cream disabled:opacity-30 disabled:hover:bg-transparent font-black text-sm transition"
        >
          −
        </button>
        <span
          className={`w-6 text-center font-mono font-black text-[13px] ${scoreClass(metric.score)}`}
          data-testid={`eval-score-${blockKey}-${index}`}
        >
          {metric.score}
        </span>
        <button
          onClick={() => onAdjust(blockKey, index, +1)}
          disabled={!canWrite || metric.score >= EVAL_SCORE_MAX}
          aria-label={`Subir nota de ${metric.label}`}
          data-testid={`eval-plus-${blockKey}-${index}`}
          className="w-8 h-8 rounded-md flex items-center justify-center text-[#6c8070] hover:bg-cream disabled:opacity-30 disabled:hover:bg-transparent font-black text-sm transition"
        >
          +
        </button>
      </span>
    </div>
  );
}
