"use client";

// ============================================================================
// PIZARRA LIBRE DE PREPARACIÓN (mock del míster: pizarra global)
// ----------------------------------------------------------------------------
// Campo táctico libre que vive en /dashboard/pizarra: mismo vocabulario de
// eventos que la ingesta y mismo campo táctil, pero SIN base de datos —
// es la "pizarra previa" para preparar y explicar sobre la tablet. Todo lo
// que se quiera SELLAR contra el vídeo va a la pizarra en directo del
// partido (tablón live con telemetría y marcadores de vídeo).
//
// FICHAS Y BALÓN (petición del míster): para explicar en directo hace falta
// material de pizarra de vestuario — fichas de la PLANTILLA REAL (dorsal +
// apellido), fichas rivales y un balón, todos ARRASTRABLES con dedo o ratón
// (Pointer Events + setPointerCapture + touch-action:none, el mismo patrón
// probado del constructor de animaciones de Biblioteca). El balón soltado
// junto a una ficha se coloca al pie del jugador. Nada de esto se sella.
// ============================================================================

import { useCallback, useMemo, useRef, useState } from "react";
import {
  CalendarSync,
  CircleDot,
  Eraser,
  Layers,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EVENT_META, QUICK_EVENT_TYPES } from "@/lib/taxonomy";

export type PrepPlayerData = {
  id: string;
  firstName: string;
  lastName: string;
  shirtNumber: number | null;
};

/** Alineación confirmada de un partido (LiveMatchEvaluation.isStarter=true):
 *  el mock del míster la llama "Alineación Sincronizada Automáticamente" —
 *  el once se vuelca a la pizarra en formación real, listo para explicar. */
export type PrepLineupData = {
  matchId: string;
  label: string;
  starters: Array<{
    id: string;
    firstName: string;
    lastName: string;
    shirtNumber: number | null;
    position: string;
  }>;
};

type PrepEvent = { x: number; y: number; type: string; playerId: string | null };

type Ficha = {
  id: string;
  kind: "own" | "rival" | "ball";
  num: number | null; // dorsal propio / número de rival
  name: string; // apellido (propio) · "R4" (rival) · "" (balón)
  sx: number; // 0..150 (unidades del viewBox, Portería propia a la IZQUIERDA)
  sy: number; // 0..100
};

// 4-3-3 propia (svg units 150×100, ataca hacia la derecha)
const FORMACION_433: [number, number][] = [
  [9, 50], // GK
  [26, 14], [24, 38], [24, 62], [26, 86], // LB CB CB RB
  [48, 28], [43, 50], [48, 72], // CM DM CM
  [68, 18], [66, 50], [68, 82], // LW ST RW
];

/** Slot preferente de la formación 4-3-3 para cada demarcación real. Al volcar
 *  el once se respeta la posición del jugador; si dos caen en el mismo hueco,
 *  el segundo se desplaza al slot libre más cercano (o a una columna aparte). */
const SLOT_OF_POSITION: Record<string, number> = {
  GK: 0,
  LB: 1,
  LWB: 1,
  CB: 2,
  RB: 4,
  RWB: 4,
  DM: 6,
  CM: 5,
  AM: 7,
  LM: 8,
  RM: 10,
  LW: 8,
  RW: 10,
  SS: 9,
  CF: 9,
};

const clampX = (x: number) => Math.min(147, Math.max(3, x));
const clampY = (y: number) => Math.min(97, Math.max(3, y));

let fichaSeq = 0;
const nextFichaId = () => `f${++fichaSeq}-${Math.random().toString(36).slice(2, 7)}`;

export function PrepWhiteboard({
  players,
  lineups = [],
}: {
  players: PrepPlayerData[];
  lineups?: PrepLineupData[];
}) {
  const [events, setEvents] = useState<PrepEvent[]>([]);
  const [activeType, setActiveType] = useState<string>("BALL_LOSS");
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [volcadoSel, setVolcadoSel] = useState<string>(lineups[0]?.matchId ?? "");
  const [volcadoLabel, setVolcadoLabel] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: string;
    offX: number;
    offY: number;
    latest: { x: number; y: number };
    raf: number;
    moved: boolean;
    sx0: number;
    sy0: number;
  } | null>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) map[e.type] = (map[e.type] ?? 0) + 1;
    return map;
  }, [events]);

  const ownFichas = fichas.filter((f) => f.kind === "own");
  const rivalFichas = fichas.filter((f) => f.kind === "rival");
  const hayBalon = fichas.some((f) => f.kind === "ball");

  // ---------- incorporar fichas ----------
  const addOwn11 = useCallback(() => {
    if (ownFichas.length > 0) return;
    const once = players.slice(0, 11);
    if (once.length === 0) return;
    const nuevas: Ficha[] = once.map((p, i) => ({
      id: nextFichaId(),
      kind: "own" as const,
      num: p.shirtNumber ?? i + 1,
      name: p.lastName,
      sx: FORMACION_433[i][0],
      sy: FORMACION_433[i][1],
    }));
    setFichas((prev) => [...prev, ...nuevas]);
  }, [players, ownFichas.length]);

  const addOwnOne = useCallback(() => {
    setFichas((prev) => {
      const puestos = new Set(prev.filter((f) => f.kind === "own").map((f) => f.name));
      const libre = players.find((p) => !puestos.has(p.lastName));
      if (!libre) return prev;
      const col = prev.length % 2 === 0 ? 38 : 58;
      return [
        ...prev,
        {
          id: nextFichaId(),
          kind: "own",
          num: libre.shirtNumber ?? 0,
          name: libre.lastName,
          sx: col,
          sy: 46 + (prev.length % 5) * 2,
        },
      ];
    });
  }, [players]);

  const addRival11 = useCallback(() => {
    if (rivalFichas.length > 0) return;
    const nuevas: Ficha[] = FORMACION_433.map((pos, i) => ({
      id: nextFichaId(),
      kind: "rival" as const,
      num: i + 1,
      name: `R${i + 1}`,
      sx: 150 - pos[0],
      sy: pos[1],
    }));
    setFichas((prev) => [...prev, ...nuevas]);
  }, [rivalFichas.length]);

  const addRivalOne = useCallback(() => {
    setFichas((prev) => {
      const n = prev.filter((f) => f.kind === "rival").length;
      if (n >= 11) return prev;
      return [
        ...prev,
        {
          id: nextFichaId(),
          kind: "rival",
          num: n + 1,
          name: `R${n + 1}`,
          sx: 112 - (n % 3) * 8,
          sy: 30 + (n % 5) * 9,
        },
      ];
    });
  }, []);

  const toggleBalon = useCallback(() => {
    setFichas((prev) =>
      prev.some((f) => f.kind === "ball")
        ? prev.filter((f) => f.kind !== "ball")
        : [...prev, { id: nextFichaId(), kind: "ball", num: null, name: "", sx: 75, sy: 50 }],
    );
  }, []);

  const clearFichas = useCallback(() => setFichas([]), []);

  // ---------- ALINEACIÓN SINCRONIZADA (mock del míster): volcar el once
  // confirmado de un partido a la pizarra, cada uno en su demarcación real ----------
  const volcarOnce = useCallback(
    (matchId: string) => {
      const lineup = lineups.find((l) => l.matchId === matchId);
      if (!lineup || lineup.starters.length === 0) return;
      setFichas((prev) => {
        const sinPropios = prev.filter((f) => f.kind !== "own"); // rivales y balón se conservan
        const usados = new Set<number>();
        const propias: Ficha[] = [];
        const sinHueco: typeof lineup.starters = [];
        for (const p of lineup.starters.slice(0, 11)) {
          const prefer = SLOT_OF_POSITION[p.position] ?? 9;
          let slot = prefer;
          if (usados.has(slot)) {
            slot = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((s) => !usados.has(s)) ?? -1;
          }
          if (slot === -1) {
            sinHueco.push(p);
            continue;
          }
          usados.add(slot);
          propias.push({
            id: nextFichaId(),
            kind: "own",
            num: p.shirtNumber ?? 0,
            name: p.lastName,
            sx: FORMACION_433[slot][0],
            sy: FORMACION_433[slot][1],
          });
        }
        sinHueco.forEach((p, i) =>
          propias.push({
            id: nextFichaId(),
            kind: "own",
            num: p.shirtNumber ?? 0,
            name: p.lastName,
            sx: 34,
            sy: Math.min(94, 14 + i * 16),
          }),
        );
        return [...sinPropios, ...propias];
      });
      setVolcadoLabel(lineup.label);
    },
    [lineups],
  );

  // ---------- arrastre (mismo patrón probado del constructor de Biblioteca) ----------
  const pitchCoords = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 150,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const commitDrag = useCallback((d: NonNullable<typeof dragRef.current>) => {
    setFichas((prev) =>
      prev.map((f) =>
        f.id === d.id
          ? { ...f, sx: clampX(d.latest.x), sy: clampY(d.latest.y) }
          : f,
      ),
    );
  }, []);

  const onFichaPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, f: Ficha) => {
      const pos = pitchCoords(e.clientX, e.clientY);
      if (!pos) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); // el dedo nunca pierde la ficha
      setDragId(f.id);
      dragRef.current = {
        id: f.id,
        offX: pos.x - f.sx,
        offY: pos.y - f.sy,
        latest: { x: f.sx, y: f.sy },
        raf: 0,
        moved: false,
        sx0: pos.x,
        sy0: pos.y,
      };
    },
    [pitchCoords],
  );

  const onFichaPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const pos = pitchCoords(e.clientX, e.clientY);
      if (!pos) return;
      if (!d.moved && Math.hypot(pos.x - d.sx0, pos.y - d.sy0) > 1.2) d.moved = true;
      d.latest = { x: pos.x - d.offX, y: pos.y - d.offY };
      if (!d.raf) {
        d.raf = requestAnimationFrame(() => {
          d.raf = 0;
          if (dragRef.current === d) commitDrag(d);
        });
      }
    },
    [pitchCoords, commitDrag],
  );

  const onFichaPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.raf) cancelAnimationFrame(d.raf);
      dragRef.current = null;
      setDragId(null);
      // Balón soltado junto a una ficha → se coloca al pie del jugador
      if (d.moved) {
        setFichas((prev) => {
          const balon = prev.find((f) => f.id === d.id && f.kind === "ball");
          if (!balon) return prev;
          const cerca = prev
            .filter((f) => f.kind !== "ball")
            .map((f) => ({ f, dist: Math.hypot(f.sx - balon.sx, f.sy - balon.sy) }))
            .sort((a, b) => a.dist - b.dist)[0];
          if (cerca && cerca.dist < 5) {
            const lado = balon.sx <= cerca.f.sx ? -1 : 1;
            return prev.map((f) =>
              f.id === balon.id
                ? { ...f, sx: clampX(cerca.f.sx + lado * 3.2), sy: clampY(cerca.f.sy) }
                : f,
            );
          }
          return prev;
        });
      }
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // el puntero ya no estaba capturado — nada que hacer
      }
    },
    [],
  );

  const onFichaPointerCancel = useCallback(() => {
    if (dragRef.current?.raf) cancelAnimationFrame(dragRef.current.raf);
    dragRef.current = null;
    setDragId(null);
  }, []);

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

      {/* Fichas y balón (petición del míster: explicar de manera táctil y con ratón) */}
      <div className="rounded-2xl border border-cream-border bg-white/70 px-3 py-2.5">
        <p className="text-[10px] font-bold text-[#6c8070] uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-brand-600" aria-hidden />
          Fichas y balón · arrastra con el dedo o el ratón
        </p>
        {lineups.length > 0 && (
          <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-brand-600/5 px-2.5 py-2">
            <CalendarSync className="w-4 h-4 shrink-0 text-brand-600" aria-hidden />
            <select
              value={volcadoSel}
              onChange={(e) => setVolcadoSel(e.target.value)}
              aria-label="Partido cuyo once confirmado volcar a la pizarra"
              className="min-h-[36px] flex-1 min-w-[140px] rounded-lg border border-cream-border-strong bg-white px-2 text-xs font-bold text-[#3d5844]"
            >
              {lineups.map((l) => (
                <option key={l.matchId} value={l.matchId}>
                  Once de {l.label} ({l.starters.length})
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() => volcarOnce(volcadoSel)}
              disabled={!volcadoSel}
              className="min-h-[36px] rounded-lg border-emerald-500/50 bg-brand-600 px-3 text-[11px] font-black text-white hover:bg-brand-600/90"
            >
              Volcar once ⚡
            </Button>
            {volcadoLabel && (
              <span className="text-[10px] font-bold text-brand-600">
                volcado: {volcadoLabel}
              </span>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={addOwn11}
            disabled={ownFichas.length > 0 || players.length === 0}
            className="min-h-[44px] rounded-2xl border-cream-border-strong bg-white text-[#3d5844] text-xs"
          >
            <Layers className="w-4 h-4" aria-hidden /> Propios 4-3-3
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={addOwnOne}
            disabled={ownFichas.length >= players.length || players.length === 0}
            className="min-h-[44px] rounded-2xl border-cream-border-strong bg-white text-[#3d5844] text-xs"
          >
            <Plus className="w-4 h-4" aria-hidden /> 1 propio
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={addRival11}
            disabled={rivalFichas.length > 0}
            className="min-h-[44px] rounded-2xl border-cream-border-strong bg-white text-[#3d5844] text-xs"
          >
            <Layers className="w-4 h-4" aria-hidden /> Rivales 4-3-3
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={addRivalOne}
            disabled={rivalFichas.length >= 11}
            className="min-h-[44px] rounded-2xl border-cream-border-strong bg-white text-[#3d5844] text-xs"
          >
            <Plus className="w-4 h-4" aria-hidden /> 1 rival
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={toggleBalon}
            className="min-h-[44px] rounded-2xl border-cream-border-strong bg-white text-[#3d5844] text-xs"
          >
            <CircleDot className="w-4 h-4" aria-hidden /> {hayBalon ? "Quitar balón" : "Balón"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={clearFichas}
            disabled={fichas.length === 0}
            className="min-h-[44px] rounded-2xl border-cream-border-strong bg-white text-[#3d5844] text-xs"
          >
            <Trash2 className="w-4 h-4" aria-hidden /> Limpiar fichas
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-[#6c8070] leading-snug">
          {ownFichas.length} propios · {rivalFichas.length} rivales · {hayBalon ? "balón en juego" : "sin balón"}
          {" · "}el balón soltado junto a un jugador queda a su pie.
        </p>
      </div>

      {/* Campo táctil libre + fichas arrastrables */}
      <div
        ref={canvasRef}
        className="relative rounded-2xl overflow-hidden border border-cream-border select-none"
        role="application"
        aria-label="Pizarra libre de preparación: toca para colocar eventos y arrastra fichas y balón con dedo o ratón. Campo propio a la izquierda."
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

        {/* fichas (HTML sobre el SVG: arrastre fino con pointer capture) */}
        {fichas.map((f) => {
          const dragging = dragId === f.id;
          const esPortero = f.kind === "own" && f.num === 1;
          const color =
            f.kind === "own"
              ? esPortero
                ? "bg-gradient-to-br from-[#e3a93c] to-[#8a6206]"
                : "bg-gradient-to-br from-brand-400 to-brand-700"
              : f.kind === "rival"
                ? "bg-gradient-to-br from-[#e05252] to-[#b4232a]"
                : "bg-white";
          return (
            <div
              key={f.id}
              onPointerDown={(e) => onFichaPointerDown(e, f)}
              onPointerMove={onFichaPointerMove}
              onPointerUp={onFichaPointerUp}
              onPointerCancel={onFichaPointerCancel}
              onClick={(e) => e.stopPropagation()}
              style={{
                left: `${(f.sx / 150) * 100}%`,
                top: `${f.sy}%`,
                transform: `translate(-50%, -50%) ${dragging ? "scale(1.22)" : ""}`,
                transition: dragging ? "none" : "left 150ms, top 150ms, transform 120ms",
                willChange: "left, top",
                touchAction: "none",
              }}
              className={`absolute z-20 flex flex-col items-center ${dragging ? "z-30" : ""}`}
            >
              <div
                className={`flex items-center justify-center rounded-full border shadow-md ${
                  f.kind === "ball"
                    ? "h-5 w-5 sm:h-6 sm:w-6 border-2 border-neutral-800"
                    : "h-6 w-6 sm:h-7 sm:w-7 border-white/70 font-black text-white text-[10px] sm:text-[11px]"
                } ${color} ${dragging ? "ring-2 ring-white ring-offset-1 ring-offset-black/40" : ""} cursor-grab active:cursor-grabbing`}
                aria-label={
                  f.kind === "ball"
                    ? "Balón arrastrable"
                    : f.kind === "own"
                      ? `Ficha de ${f.num} ${f.name}, arrastrable`
                      : `Ficha rival ${f.num}, arrastrable`
                }
                role="button"
              >
                {f.kind === "ball" ? (
                  <span className="text-[10px] leading-none" aria-hidden>⚽</span>
                ) : (
                  f.kind === "own" ? (f.num ?? "") : (f.num ?? "")
                )}
              </div>
              {f.kind !== "ball" && (
                <span className="mt-0.5 max-w-[64px] truncate rounded px-1 text-[8px] sm:text-[9px] font-bold leading-tight text-white/90 bg-black/45 pointer-events-none">
                  {f.name}
                </span>
              )}
            </div>
          );
        })}
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
