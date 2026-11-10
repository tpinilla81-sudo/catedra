"use client";

// ============================================================================
// PIZARRA LIBRE DE PREPARACIÓN (mock del míster: pizarra global)
// ----------------------------------------------------------------------------
// Campo táctico libre que vive en /dashboard/pizarra: mismo vocabulario de
// eventos que la ingesta y mismo campo táctil, pero SIN base de datos —
// es la "pizarra previa" para preparar y explicar sobre la tablet. Todo lo
// que se quiera SELLAR contra el vídeo va a la pizarra en directo del
// partido (tablón live con telemetría y marcadores de vídeo).
// ============================================================================

import { useMemo, useState } from "react";
import { Eraser, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EVENT_META, QUICK_EVENT_TYPES } from "@/lib/taxonomy";

export type PrepPlayerData = {
  id: string;
  firstName: string;
  lastName: string;
  shirtNumber: number | null;
};

type PrepEvent = { x: number; y: number; type: string; playerId: string | null };

export function PrepWhiteboard({ players }: { players: PrepPlayerData[] }) {
  const [events, setEvents] = useState<PrepEvent[]>([]);
  const [activeType, setActiveType] = useState<string>("BALL_LOSS");
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) map[e.type] = (map[e.type] ?? 0) + 1;
    return map;
  }, [events]);

  function addEvent(x: number, y: number) {
    setEvents((prev) => [
      ...prev,
      { x, y, type: activeType, playerId: activePlayerId },
    ]);
  }

  function removeEvent(index: number) {
    setEvents((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {/* Paleta de eventos (mismo vocabulario que la ingesta) */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {QUICK_EVENT_TYPES.map((type) => {
          const meta = EVENT_META[type];
          const Icon = meta.icon;
          const selected = activeType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveType(type)}
              aria-pressed={selected}
              className={`relative min-h-[62px] rounded-2xl border px-1.5 py-2 flex flex-col items-center justify-center gap-1 transition ${selected ? meta.btn : "bg-white border-cream-border text-[#5d7263]"}`}
            >
              <Icon className="w-4 h-4" aria-hidden />
              <span className="text-[10px] font-bold leading-tight text-center">{meta.label}</span>
              {(counts[type] ?? 0) > 0 && (
                <span className={`absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center ${meta.text} bg-cream border border-cream-border-strong`}>
                  {counts[type]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Responsable */}
      <div>
        <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest mb-1.5">
          Responsable (opcional)
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setActivePlayerId(null)}
            aria-pressed={activePlayerId === null}
            className={`shrink-0 min-h-[40px] px-3.5 py-1.5 rounded-full border text-xs font-bold transition ${activePlayerId === null ? "bg-cream-border-strong border-[#a8a389] text-peel" : "bg-white border-cream-border text-[#5d7263]"}`}
          >
            Equipo
          </button>
          {players.map((p) => {
            const selected = activePlayerId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePlayerId(selected ? null : p.id)}
                aria-pressed={selected}
                className={`shrink-0 min-h-[40px] px-3 py-1.5 rounded-full border text-xs font-bold transition ${selected ? "bg-brand-600/15 border-emerald-500/50 text-brand-600" : "bg-white border-cream-border text-[#5d7263]"}`}
              >
                <span className="font-black mr-1">{p.shirtNumber ?? "–"}</span>
                {p.lastName}
              </button>
            );
          })}
        </div>
      </div>

      {/* Campo táctil libre */}
      <div
        className="relative rounded-2xl overflow-hidden border border-cream-border select-none"
        role="application"
        aria-label="Pizarra libre de preparación: toca para colocar eventos. Campo propio a la izquierda."
      >
        <svg
          viewBox="0 0 150 100"
          preserveAspectRatio="none"
          className="block w-full aspect-[3/2] touch-none"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
            const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
            addEvent(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
          }}
        >
          {/* césped */}
          <rect width="150" height="100" fill="#06231a" />
          {/* líneas */}
          <g stroke="#14532d" strokeWidth="0.8" fill="none">
            <rect x="2" y="2" width="146" height="96" />
            <line x1="75" y1="2" x2="75" y2="98" />
            <circle cx="75" cy="50" r="13" />
            <rect x="2" y="25" width="18" height="50" />
            <rect x="2" y="38" width="8" height="24" />
            <circle cx="13" cy="50" r="0.9" fill="#14532d" />
            <rect x="130" y="25" width="18" height="50" />
            <rect x="140" y="38" width="8" height="24" />
            <circle cx="137" cy="50" r="0.9" fill="#14532d" />
          </g>
          {/* tercios (1/3 propio = x ≤ 35) */}
          <g stroke="#14532d" strokeDasharray="3 3" strokeWidth="0.5" opacity="0.7">
            <line x1="52.5" y1="2" x2="52.5" y2="98" />
            <line x1="102.5" y1="2" x2="102.5" y2="98" />
          </g>
          {/* porterías */}
          <rect x="0.5" y="44" width="1.8" height="12" fill="#4ade80" opacity="0.8" />
          <rect x="147.7" y="44" width="1.8" height="12" fill="#f87171" opacity="0.8" />

          {/* eventos */}
          {events.map((e, i) => {
            const meta = EVENT_META[e.type] ?? EVENT_META.CUSTOM;
            const big = e.type === "GOAL_FOR" || e.type === "GOAL_AGAINST";
            return (
              <g key={`${i}-${e.x}-${e.y}`}>
                <circle
                  cx={e.x * 1.5}
                  cy={e.y}
                  r={big ? 3.4 : 2.6}
                  fill={meta.dot}
                  stroke="#09090b"
                  strokeWidth="0.7"
                  className="cursor-pointer"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    removeEvent(i);
                  }}
                />
                {e.playerId && (
                  <circle
                    cx={e.x * 1.5}
                    cy={e.y}
                    r={big ? 5.2 : 4.4}
                    fill="none"
                    stroke={meta.dot}
                    strokeWidth="0.5"
                    opacity="0.55"
                    className="cursor-pointer"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      removeEvent(i);
                    }}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-[#5d7263]">
          <span className="font-black text-peel">{events.length}</span> posiciones sobre el campo
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEvents((prev) => prev.slice(0, -1))}
            disabled={events.length === 0}
            className="min-h-[44px] rounded-2xl border-cream-border-strong bg-white text-[#3d5844]"
          >
            <RotateCcw className="w-4 h-4" aria-hidden /> Deshacer
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEvents([])}
            disabled={events.length === 0}
            className="min-h-[44px] rounded-2xl border-cream-border-strong bg-white text-[#3d5844]"
          >
            <Eraser className="w-4 h-4" aria-hidden /> Vaciar
          </Button>
        </div>
      </div>
    </div>
  );
}
