"use client";

// ============================================================================
// PIZARRA LIBRE DE PREPARACIÓN — MODO EXPLICACIÓN TÁCTICA PURA
// (mock del míster: "Pizarra Táctica Pura (Dibujo, Fichas y Balón)")
// ----------------------------------------------------------------------------
// Campo táctico libre que vive en /dashboard/pizarra: SOLO material de
// vestuario — fichas de la PLANTILLA REAL (dorsal + apellido), fichas
// rivales, balón y FLECHAS de dibujo — todo ARRASTRABLE/DIBUJABLE con dedo
// o ratón (Pointer Events + setPointerCapture + touch-action:none, el mismo
// patrón probado del constructor de animaciones de Biblioteca). El balón
// soltado junto a una ficha se coloca al pie del jugador; una flecha que
// nace o muere junto a una ficha se engancha al jugador y toma su color.
//
// MOCK: "Modo Explicación Táctica Activo (Sin registro de pérdidas ni
// telemetría)" — aquí NO se coloca ningún evento: la paleta de eventos y el
// vocabulario de ingesta viven SOLO en la pizarra en directo del partido,
// donde se sellan contra el vídeo y el reloj. «Restablecer Posiciones»
// devuelve las fichas a la formación 4-3-3 estándar (cada propio a SU
// demarcación real, rivales espejados y balón al centro). Nada se guarda:
// es la pizarra previa para explicar sobre la tablet.
// ============================================================================

import { useCallback, useRef, useState } from "react";
import {
  CalendarSync,
  CircleDot,
  Eraser,
  Layers,
  Move,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type PrepPlayerData = {
  id: string;
  firstName: string;
  lastName: string;
  shirtNumber: number | null;
  primaryPosition: string;
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

type Ficha = {
  id: string;
  kind: "own" | "rival" | "ball";
  num: number | null; // dorsal propio / número de rival
  name: string; // apellido (propio) · "R4" (rival) · "" (balón)
  pos: string | null; // demarcación real (propia) — la usa Restablecer Posiciones
  sx: number; // 0..150 (unidades del viewBox, Portería propia a la IZQUIERDA)
  sy: number; // 0..100
};

type FlechaColor = "verde" | "rojo" | "blanco";
type Flecha = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: FlechaColor;
};

const FLECHA_STROKE: Record<FlechaColor, string> = {
  verde: "#4ade80",
  rojo: "#f87171",
  blanco: "#e5e5e5",
};

// 4-3-3 propia (svg units 150×100, ataca hacia la derecha)
const FORMACION_433: [number, number][] = [
  [9, 50], // GK
  [26, 14], [24, 38], [24, 62], [26, 86], // LB CB CB RB
  [48, 28], [43, 50], [48, 72], // CM DM CM
  [68, 18], [66, 50], [68, 82], // LW ST RW
];

/** Slot preferente de la formación 4-3-3 para cada demarcación real. */
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

/** Coordenada estándar 4-3-3 para cada ficha propia según su demarcación real
 *  (la usan «Volcar once ⚡» y «Restablecer Posiciones»): respeta la posición
 *  del jugador; si dos caen en el mismo hueco, el segundo toma el slot libre
 *  y los que no caben van a una columna aparte. */
function slots433(positions: (string | null)[]): Array<{ sx: number; sy: number }> {
  const usados = new Set<number>();
  const orden = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const out: Array<{ sx: number; sy: number }> = [];
  let columna = 0;
  for (const pos of positions) {
    const prefer = pos != null ? (SLOT_OF_POSITION[pos] ?? -1) : -1;
    const slot =
      prefer >= 0 && !usados.has(prefer)
        ? prefer
        : (orden.find((s) => !usados.has(s)) ?? -1);
    if (slot === -1) {
      out.push({ sx: 34, sy: Math.min(94, 14 + columna++ * 16) });
      continue;
    }
    usados.add(slot);
    out.push({ sx: FORMACION_433[slot][0], sy: FORMACION_433[slot][1] });
  }
  return out;
}

/** Ficha más cercana a un punto (para enganchar balón y flechas a jugadores). */
function fichaMasCercana(fichas: Ficha[], x: number, y: number, radio: number): Ficha | null {
  let mejor: Ficha | null = null;
  let dist = radio;
  for (const f of fichas) {
    const d = Math.hypot(f.sx - x, f.sy - y);
    if (d <= dist) {
      dist = d;
      mejor = f;
    }
  }
  return mejor;
}

const colorDeFicha = (f: Ficha | null): FlechaColor =>
  f?.kind === "own" ? "verde" : f?.kind === "rival" ? "rojo" : "blanco";

export function PrepWhiteboard({
  players,
  lineups = [],
}: {
  players: PrepPlayerData[];
  lineups?: PrepLineupData[];
}) {
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [volcadoSel, setVolcadoSel] = useState<string>(lineups[0]?.matchId ?? "");
  const [volcadoLabel, setVolcadoLabel] = useState<string | null>(null);
  // Dibujo libre (mock: "Dibujo, Fichas y Balón") — estado local, nada se sella
  const [modo, setModo] = useState<"mover" | "dibujar">("mover");
  const [flechas, setFlechas] = useState<Flecha[]>([]);
  const [flechaViva, setFlechaViva] = useState<Flecha | null>(null);

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
  const drawRef = useRef<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: FlechaColor;
    raf: number;
  } | null>(null);

  const ownFichas = fichas.filter((f) => f.kind === "own");
  const rivalFichas = fichas.filter((f) => f.kind === "rival");
  const hayBalon = fichas.some((f) => f.kind === "ball");

  // ---------- incorporar fichas ----------
  const addOwn11 = useCallback(() => {
    if (ownFichas.length > 0) return;
    const once = players.slice(0, 11);
    if (once.length === 0) return;
    const coords = slots433(once.map((p) => p.primaryPosition ?? null));
    const nuevas: Ficha[] = once.map((p, i) => ({
      id: nextFichaId(),
      kind: "own" as const,
      num: p.shirtNumber ?? i + 1,
      name: p.lastName,
      pos: p.primaryPosition ?? null,
      sx: coords[i].sx,
      sy: coords[i].sy,
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
          pos: libre.primaryPosition ?? null,
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
      pos: null,
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
          pos: null,
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
        : [...prev, { id: nextFichaId(), kind: "ball", num: null, name: "", pos: null, sx: 75, sy: 50 }],
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
        const props = lineup.starters.slice(0, 11);
        const coords = slots433(props.map((p) => p.position));
        const propias: Ficha[] = props.map((p, i) => ({
          id: nextFichaId(),
          kind: "own" as const,
          num: p.shirtNumber ?? 0,
          name: p.lastName,
          pos: p.position,
          sx: coords[i].sx,
          sy: coords[i].sy,
        }));
        return [...sinPropios, ...propias];
      });
      setVolcadoLabel(lineup.label);
    },
    [lineups],
  );

  // ---------- RESTABLECER POSICIONES (mock del míster): formación estándar
  // 4-3-3 — cada propio a SU demarcación, rivales espejados, balón al centro ----------
  const resetPosiciones = useCallback(() => {
    setFichas((prev) => {
      if (prev.length === 0) return prev;
      const propias = prev.filter((f) => f.kind === "own");
      const coords = slots433(propias.map((f) => f.pos ?? null));
      const destino = new Map<string, { sx: number; sy: number }>();
      propias.forEach((f, i) => destino.set(f.id, coords[i]));
      let ri = 0;
      for (const f of prev) {
        if (f.kind === "rival") {
          const p = FORMACION_433[ri++ % 11];
          destino.set(f.id, { sx: 150 - p[0], sy: p[1] });
        }
      }
      return prev.map((f) => {
        const d = destino.get(f.id);
        if (d) return { ...f, sx: d.sx, sy: d.sy };
        return f.kind === "ball" ? { ...f, sx: 75, sy: 50 } : f;
      });
    });
  }, []);

  // ---------- arrastre de fichas (mismo patrón probado del constructor) ----------
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
      // En modo dibujo el gesto sobre una ficha es el INICIO de una flecha:
      // dejamos que el pointerdown burbujee al lienzo (que la engancha a la
      // ficha y toma su color) en vez de arrastrar la ficha.
      if (modo === "dibujar") return;
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
    [modo, pitchCoords],
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
          const cerca = fichaMasCercana(
            prev.filter((f) => f.kind !== "ball"),
            balon.sx,
            balon.sy,
            5,
          );
          if (cerca) {
            const lado = balon.sx <= cerca.sx ? -1 : 1;
            return prev.map((f) =>
              f.id === balon.id
                ? { ...f, sx: clampX(cerca.sx + lado * 3.2), sy: clampY(cerca.sy) }
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

  // ---------- dibujo de flechas (mock: "Dibujo, Fichas y Balón") ----------
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (modo !== "dibujar") return;
      const pos = pitchCoords(e.clientX, e.clientY);
      if (!pos) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const cerca = fichaMasCercana(fichas, pos.x, pos.y, 4);
      const inicio = cerca ? { x: cerca.sx, y: cerca.sy } : pos;
      const color = colorDeFicha(cerca);
      drawRef.current = { x1: inicio.x, y1: inicio.y, x2: inicio.x, y2: inicio.y, color, raf: 0 };
      setFlechaViva({ x1: inicio.x, y1: inicio.y, x2: inicio.x, y2: inicio.y, color });
    },
    [modo, pitchCoords, fichas],
  );

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drawRef.current;
      if (!d) return;
      const pos = pitchCoords(e.clientX, e.clientY);
      if (!pos) return;
      d.x2 = pos.x;
      d.y2 = pos.y;
      if (!d.raf) {
        d.raf = requestAnimationFrame(() => {
          d.raf = 0;
          if (drawRef.current === d)
            setFlechaViva({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, color: d.color });
        });
      }
    },
    [pitchCoords],
  );

  const onCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drawRef.current;
      if (!d) return;
      if (d.raf) cancelAnimationFrame(d.raf);
      drawRef.current = null;
      setFlechaViva(null);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // el puntero ya no estaba capturado — nada que hacer
      }
      // solo se queda la flecha si es un trazo real (no un toque accidental)
      if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 4) {
        const finCerca = fichaMasCercana(fichas, d.x2, d.y2, 5);
        const fin = finCerca
          ? { x: finCerca.sx, y: finCerca.sy }
          : { x: clampX(d.x2), y: clampY(d.y2) };
        const color: FlechaColor =
          d.color !== "blanco"
            ? d.color
            : finCerca
              ? finCerca.kind === "own"
                ? "verde"
                : finCerca.kind === "rival"
                  ? "rojo"
                  : "blanco"
              : "blanco";
        setFlechas((prev) => [
          ...prev,
          { x1: clampX(d.x1), y1: clampY(d.y1), x2: fin.x, y2: fin.y, color },
        ]);
      }
    },
    [fichas],
  );

  const onCanvasPointerCancel = useCallback(() => {
    if (drawRef.current?.raf) cancelAnimationFrame(drawRef.current.raf);
    drawRef.current = null;
    setFlechaViva(null);
  }, []);

  return (
    <div className="space-y-3">
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
        {/* Herramientas de explicación (mock: Dibujo + Restablecer Posiciones) */}
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-6 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setModo((m) => (m === "dibujar" ? "mover" : "dibujar"))}
            aria-pressed={modo === "dibujar"}
            className={`min-h-[44px] rounded-2xl border text-xs ${
              modo === "dibujar"
                ? "border-emerald-500/50 bg-brand-600 text-white hover:bg-brand-600/90"
                : "border-cream-border-strong bg-white text-[#3d5844]"
            }`}
          >
            {modo === "dibujar" ? (
              <>
                <Move className="w-4 h-4" aria-hidden /> Mover fichas
              </>
            ) : (
              <>
                <Pencil className="w-4 h-4" aria-hidden /> Dibujar flechas
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={resetPosiciones}
            disabled={fichas.length === 0}
            title="Vuelve a la formación 4-3-3 estándar: cada propio a su demarcación, rivales espejados y balón al centro"
            className="min-h-[44px] rounded-2xl border-cream-border-strong bg-white text-[#3d5844] text-xs"
          >
            <RotateCcw className="w-4 h-4" aria-hidden /> Restablecer Posiciones
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFlechas((prev) => prev.slice(0, -1))}
            disabled={flechas.length === 0}
            className="min-h-[44px] rounded-2xl border-cream-border-strong bg-white text-[#3d5844] text-xs"
          >
            <Undo2 className="w-4 h-4" aria-hidden /> Deshacer flecha
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFlechas([])}
            disabled={flechas.length === 0}
            className="min-h-[44px] rounded-2xl border-cream-border-strong bg-white text-[#3d5844] text-xs"
          >
            <Eraser className="w-4 h-4" aria-hidden /> Borrar flechas
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-[#6c8070] leading-snug">
          {ownFichas.length} propios · {rivalFichas.length} rivales · {hayBalon ? "balón en juego" : "sin balón"}
          {" · "}el balón soltado junto a un jugador queda a su pie y las flechas nacen/mueren enganchadas al jugador más cercano.
        </p>
      </div>

      {/* Campo táctil libre + fichas arrastrables + flechas (PIZARRA PURA) */}
      <div
        ref={canvasRef}
        className={`relative rounded-2xl overflow-hidden border border-cream-border select-none touch-none ${
          modo === "dibujar" ? "cursor-crosshair" : ""
        }`}
        role="application"
        aria-label="Pizarra libre de preparación: arrastra fichas y balón con dedo o ratón y dibuja flechas en modo dibujo. Sin registro de eventos ni telemetría. Campo propio a la izquierda."
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerCancel={onCanvasPointerCancel}
      >
        <svg
          viewBox="0 0 150 100"
          preserveAspectRatio="none"
          className="block w-full aspect-[3/2] touch-none"
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

          {/* cabezas de flecha */}
          <defs>
            {(["verde", "rojo", "blanco"] as FlechaColor[]).map((c) => (
              <marker
                key={c}
                id={`cabeza-${c}`}
                markerWidth="7"
                markerHeight="7"
                refX="5.2"
                refY="2.8"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L5.6,2.8 L0,5.6 z" fill={FLECHA_STROKE[c]} />
              </marker>
            ))}
          </defs>

          {/* flechas dibujadas (toca una para quitarla) */}
          {flechas.map((a, i) => (
            <g key={i}>
              <line
                x1={a.x1}
                y1={a.y1}
                x2={a.x2}
                y2={a.y2}
                stroke={FLECHA_STROKE[a.color]}
                strokeWidth="1.5"
                strokeLinecap="round"
                markerEnd={`url(#cabeza-${a.color})`}
                opacity="0.95"
              />
              <line
                x1={a.x1}
                y1={a.y1}
                x2={a.x2}
                y2={a.y2}
                stroke="transparent"
                strokeWidth="4"
                style={{ pointerEvents: "stroke" }}
                className="cursor-pointer"
                onClick={(ev) => {
                  ev.stopPropagation();
                  setFlechas((prev) => prev.filter((_, j) => j !== i));
                }}
              />
            </g>
          ))}

          {/* flecha en curso (trazo vivo) */}
          {flechaViva && (
            <line
              x1={flechaViva.x1}
              y1={flechaViva.y1}
              x2={flechaViva.x2}
              y2={flechaViva.y2}
              stroke={FLECHA_STROKE[flechaViva.color]}
              strokeWidth="1.5"
              strokeLinecap="round"
              markerEnd={`url(#cabeza-${flechaViva.color})`}
              strokeDasharray="4 2.5"
              opacity="0.85"
            />
          )}
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

        {/* Modo explicación táctica (mock: pizarra pura, sin telemetría) */}
        <div className="absolute bottom-2 left-2 z-10 max-w-[70%] rounded-lg border border-white/10 bg-black/45 px-2 py-1 text-[9px] sm:text-[10px] font-bold text-white/85 pointer-events-none">
          Modo explicación táctica activo · sin registro de pérdidas ni telemetría
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-[#5d7263]">
          <span className="font-black text-peel">{flechas.length}</span> flechas sobre el césped
        </p>
        <p className="text-[11px] text-[#6c8070]">
          {modo === "dibujar"
            ? "modo dibujo: arrastra sobre el césped para trazar una flecha"
            : "toca una flecha para quitarla"}
        </p>
      </div>
    </div>
  );
}
