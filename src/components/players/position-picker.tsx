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
        <label htmlFor="primary-position" className="text-xs font-bold text-[#6c8070] uppercase tracking-widest">
          Demarcación principal
        </label>
        <select
          id="primary-position"
          value={main}
          onChange={(e) => onMainChange(e.target.value)}
          className="mt-1 w-full min-h-[48px] rounded-2xl bg-cream-dark/70 border border-cream-border-strong text-peel px-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          {ALL_POSITIONS.map((p) => (
            <option key={p} value={p} className="bg-white">
              {p} · {POSITION_LABEL[p] ?? p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="text-xs font-bold text-[#6c8070] uppercase tracking-widest">
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
                    ? "bg-brand-600/15 border-brand-600/50 text-brand-600"
                    : "bg-white border-cream-border-strong text-[#6c8070] hover:text-peel"
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
