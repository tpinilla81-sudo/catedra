"use client";

// ============================================================================
// PILAR 2 — SELECTOR DE DEMARCACIONES (principal + polivalencia)
// ----------------------------------------------------------------------------
// Pieza compartida entre el alta manual (Nuevo jugador) y la ficha de
// edición rápida: select de demarcación principal + chips de 1 toque para
// marcar/desmarcar polivalencias (nunca incluye la principal).
// ============================================================================

import { ALL_POSITIONS, POSITION_LABEL, POSITION_SHORT } from "@/lib/taxonomy";

export function PositionPicker({
  main,
  secondary,
  onMainChange,
  onToggleSecondary,
}: {
  main: string;
  secondary: string[];
  onMainChange: (p: string) => void;
  onToggleSecondary: (p: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label htmlFor="main-position" className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
          Demarcación principal
        </label>
        <select
          id="main-position"
          value={main}
          onChange={(e) => onMainChange(e.target.value)}
          className="mt-1 w-full min-h-[48px] rounded-2xl bg-zinc-800/60 border border-zinc-800 text-zinc-100 px-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
        >
          {ALL_POSITIONS.map((p) => (
            <option key={p} value={p} className="bg-zinc-900">
              {p} · {POSITION_LABEL[p] ?? p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
          Polivalencia (toca para marcar)
        </p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {ALL_POSITIONS.filter((p) => p !== main).map((p) => {
            const active = secondary.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => onToggleSecondary(p)}
                aria-pressed={active}
                title={POSITION_LABEL[p] ?? p}
                className={`min-h-[36px] px-2.5 rounded-xl border text-xs font-black transition ${
                  active
                    ? "bg-amber-400/15 border-amber-400/50 text-amber-200"
                    : "bg-zinc-800/60 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {POSITION_SHORT[p] ?? p}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
