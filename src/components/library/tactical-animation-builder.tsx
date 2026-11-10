"use client";

// ============================================================================
// TACTICAL ANIMATION BUILDER — pizarra táctica animada, diseñada a dedo
// ----------------------------------------------------------------------------
// Editor de la pizarra que vive en Task.animationData (JSON ligero, sin
// vídeo). Produce el MISMO formato `Animacion` que renderiza PizarraAnimada,
// así la pizarra personalizada aparece sola en las tarjetas y fichas de tarea
// sin tocar nada más.
//
// Cero fricción en banda y tablet:
//   · Canvas oscuro de alto contraste con pointer events (dedo o ratón):
//     arrastrar fichas y balón, con pointer capture (el dedo nunca "pierde"
//     la ficha al salir del campo) y touch-action none (la hoja no scrollea
//     mientras dibujas).
//   · Fichas: jugador propio con dorsal, portero, rival — se añaden al
//     ROSTRO completo (todos los fotogramas) y solo se mueven en el actual.
//   · Fases/fotogramas: [+] duplica el actual para "evolucionarlo"; cada
//     fase tiene etiqueta (la idea táctica), duración y trazo del balón.
//   · Playback ▶/⏸ con interpolación CSS (60 fps sin rAF por frame) y
//     velocidad 1×/1.5×/2× — igual que la pizarra de la ficha.
//   · Movimiento reducido: nunca arranca solo; el ▶ es siempre explícito.
//   · Nudge ◀▶▲▼ para el ajuste fino de la ficha seleccionada.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Gauge, Pause, Play, Trash2 } from "lucide-react";
import type { Animacion, Eq, FichaAnim, Fotograma } from "@/lib/animaciones-ejercicio";

const HOLD_MS = 420;
const EASING = "cubic-bezier(.45,.05,.35,1)";
const MS_OPCIONES = [600, 1000, 1500, 2000] as const;

const clampX = (x: number) => Math.round(Math.min(105, Math.max(0, x)) * 10) / 10;
const clampY = (y: number) => Math.round(Math.min(68, Math.max(0, y)) * 10) / 10;

// ---------- Fábrica de la pizarra inicial ( GK + 3 propias + 2 rivales + balón) ----------

let seqId = 0;
const nextId = (pref: string) => {
  seqId += 1;
  return `${pref}${Date.now().toString(36)}${seqId}`;
};

export function crearPizarraInicial(): Animacion {
  const fichas: FichaAnim[] = [
    { id: "p0", eq: "propia", x: 8, y: 34, num: 1 },
    { id: "p1", eq: "propia", x: 28, y: 18, num: 2 },
    { id: "p2", eq: "propia", x: 28, y: 50, num: 3 },
    { id: "p3", eq: "propia", x: 46, y: 34, num: 8 },
    { id: "r0", eq: "rival", x: 64, y: 24 },
    { id: "r1", eq: "rival", x: 64, y: 44 },
  ];
  return {
    clave: "personalizada",
    titulo: "Pizarra de la tarea",
    descripcion: "Animación diseñada por el entrenador",
    fotogramas: [
      { fichas, balon: { x: 46, y: 34, con: "p3" }, etiqueta: "Posición inicial" },
    ],
  };
}

function envolver(fotogramas: Fotograma[]): Animacion {
  return {
    clave: "personalizada",
    titulo: "Pizarra de la tarea",
    descripcion: "Animación diseñada por el entrenador",
    fotogramas,
  };
}

// ---------- Ficha visual (canvas oscuro de alto contraste) ----------

function CampoOscuro() {
  return (
    <svg viewBox="0 0 105 68" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={(105 / 7) * i} y={0} width={105 / 7} height={68} fill={i % 2 === 0 ? "#0d2416" : "#0a1d12"} />
      ))}
      <g stroke="rgba(255,255,255,.72)" strokeWidth=".45" fill="none">
        <rect x="1.5" y="1.5" width="102" height="65" />
        <line x1="52.5" y1="1.5" x2="52.5" y2="66.5" />
        <circle cx="52.5" cy="34" r="7.5" />
        <rect x="1.5" y="13.85" width="16.5" height="40.3" />
        <rect x="87" y="13.85" width="16.5" height="40.3" />
        <path d="M 18 26.7 A 9 9 0 0 1 18 41.3" />
        <path d="M 87 26.7 A 9 9 0 0 0 87 41.3" />
      </g>
      <g fill="rgba(255,255,255,.35)">
        <rect x="0" y="30.2" width="1.5" height="7.6" />
        <rect x="103.5" y="30.2" width="1.5" height="7.6" />
      </g>
    </svg>
  );
}

function FichaChip({
  ficha,
  left,
  top,
  trans,
  selected,
  conBalon,
  onPointerDown,
  interactive,
}: {
  ficha: FichaAnim;
  left: number;
  top: number;
  trans: string;
  selected: boolean;
  conBalon: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  interactive: boolean;
}) {
  const portero = ficha.eq === "propia" && ficha.num === 1;
  const color =
    ficha.eq === "propia"
      ? portero
        ? "bg-gradient-to-br from-[#e3a93c] to-[#8a6206]"
        : "bg-gradient-to-br from-brand-400 to-brand-700"
      : "bg-gradient-to-br from-[#e05252] to-[#b4232a]";

  return (
    <div
      onPointerDown={interactive ? onPointerDown : undefined}
      style={{
        left: `${(left / 105) * 100}%`,
        top: `${(top / 68) * 100}%`,
        transform: `translate(-50%, -50%) ${selected ? "scale(1.18)" : ""}`,
        transition: trans,
        willChange: "left, top",
        touchAction: "none",
      }}
      className={`absolute z-20 flex h-6 w-6 items-center justify-center rounded-full border font-black text-white shadow-md sm:h-7 sm:w-7 sm:text-[11px] text-[10px] ${color} ${
        selected ? "border-white ring-2 ring-white ring-offset-1 ring-offset-black/40" : "border-white/70"
      } ${interactive ? "cursor-grab active:cursor-grabbing" : ""}`}
      aria-hidden
    >
      {ficha.eq === "propia" ? (ficha.num ?? "") : ""}
      {conBalon && !selected && (
        <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white" />
      )}
    </div>
  );
}

// ---------- Componente principal ----------

export function TacticalAnimationBuilder({
  value,
  onChange,
}: {
  value: Animacion | null;
  onChange: (anim: Animacion | null) => void;
}) {
  const frames = value?.fotogramas ?? [];

  // ---- estado de edición (la Animacion vive SIEMPRE en el padre — controlado) ----
  const [activo, setActivo] = useState(0);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const [sinTransicion, setSinTransicion] = useState(false);
  const [velocidad, setVelocidad] = useState(1);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    tipo: "ficha" | "balon";
    offX: number;
    offY: number;
    raf: number;
    latest: { x: number; y: number };
  } | null>(null);

  // El fotograma activo no puede escaparse si el padre acorta los frames
  const idx = Math.min(activo, Math.max(0, frames.length - 1));
  const frame = frames[idx];

  // ---------- Motor de playback (CSS interpola — un setState por beat) ----------
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const actual = frames[beat] ?? frames[0];
    const espera = ((actual.ms ?? 1000) + HOLD_MS) / velocidad;
    const id = setTimeout(() => {
      const nb = (beat + 1) % frames.length;
      if (nb === 0) setSinTransicion(true);
      setBeat(nb);
    }, espera);
    return () => clearTimeout(id);
  }, [playing, beat, velocidad, frames]);

  useEffect(() => {
    if (!sinTransicion) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setSinTransicion(false));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [sinTransicion]);

  const reproducir = useCallback(() => {
    setSeleccion(null);
    setBeat(0);
    setSinTransicion(true);
    setPlaying(true);
  }, []);
  const pausar = useCallback(() => {
    setPlaying(false);
    setActivo(beat);
  }, [beat]);

  // ---------- helpers de mutación (siempre sobre TODO el value) ----------

  const mutarFotogramas = useCallback(
    (fn: (frames: Fotograma[]) => Fotograma[]) => {
      if (!value) return;
      onChange(envolver(fn(value.fotogramas.map((f) => ({ ...f, fichas: [...f.fichas], balon: { ...f.balon } })))));
    },
    [value, onChange],
  );

  const addFicha = useCallback(
    (eq: Eq, num?: number) => {
      if (!value) return;
      if (value.fotogramas[0].fichas.length >= 22) return;
      const id = nextId(eq === "propia" ? "p" : "r");
      const n = value.fotogramas[0].fichas.length;
      const pos = { x: clampX(38 + (n % 5) * 6), y: clampY(14 + (n % 7) * 7) };
      mutarFotogramas((fs) =>
        fs.map((f) => ({ ...f, fichas: [...f.fichas, { id, eq, x: pos.x, y: pos.y, ...(num !== undefined ? { num } : {}) }] })),
      );
      setSeleccion(id);
    },
    [value, mutarFotogramas],
  );

  const removeFicha = useCallback(
    (id: string) => {
      mutarFotogramas((fs) =>
        fs.map((f) => ({
          ...f,
          fichas: f.fichas.filter((x) => x.id !== id),
          balon: f.balon.con === id ? { ...f.balon, con: undefined } : f.balon,
        })),
      );
      setSeleccion(null);
    },
    [mutarFotogramas],
  );

  const patchFichaGlobal = useCallback(
    (id: string, patch: Partial<Pick<FichaAnim, "num" | "eq">>) => {
      mutarFotogramas((fs) =>
        fs.map((f) => ({
          ...f,
          fichas: f.fichas.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      );
    },
    [mutarFotogramas],
  );

  const nudgeFicha = useCallback(
    (id: string, dx: number, dy: number) => {
      mutarFotogramas((fs) =>
        fs.map((f, i) =>
          i === idx
            ? {
                ...f,
                fichas: f.fichas.map((x) => (x.id === id ? { ...x, x: clampX(x.x + dx), y: clampY(x.y + dy) } : x)),
                balon: f.balon.con === id ? { ...f.balon, x: clampX(f.balon.x + dx), y: clampY(f.balon.y + dy) } : f.balon,
              }
            : f,
        ),
      );
    },
    [mutarFotogramas, idx],
  );

  // ---------- Drag (pointer events + capture + commit rAF) ----------

  const pitchCoords = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 105,
      y: ((clientY - rect.top) / rect.height) * 68,
    };
  }, []);

  const commitDrag = useCallback(
    (d: NonNullable<typeof dragRef.current>) => {
      const { id, tipo, latest } = d;
      mutarFotogramas((fs) =>
        fs.map((f, i) =>
          i === idx
            ? tipo === "ficha"
              ? {
                  ...f,
                  fichas: f.fichas.map((x) => (x.id === id ? { ...x, x: clampX(latest.x), y: clampY(latest.y) } : x)),
                }
              : {
                  ...f,
                  balon: { ...f.balon, x: clampX(latest.x), y: clampY(latest.y), con: undefined },
                }
            : f,
        ),
      );
    },
    [mutarFotogramas, idx],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent, id: string, tipo: "ficha" | "balon") => {
      if (playing || !frame) return;
      const pos = pitchCoords(e.clientX, e.clientY);
      if (!pos) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setSeleccion(tipo === "ficha" ? id : null);

      const ficha = tipo === "ficha" ? frame.fichas.find((f) => f.id === id) : null;
      const base = tipo === "ficha" && ficha ? ficha : frame.balon;
      dragRef.current = {
        id,
        tipo,
        offX: pos.x - base.x,
        offY: pos.y - base.y,
        raf: 0,
        latest: { x: base.x, y: base.y },
      };
    },
    [playing, frame, pitchCoords],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const pos = pitchCoords(e.clientX, e.clientY);
      if (!pos) return;
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

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.raf) cancelAnimationFrame(d.raf);
      // Snap del balón a la ficha más cercana (< 4 unidades) → balón "con" dueño
      if (d.tipo === "balon" && frame) {
        const cerca = frame.fichas
          .map((f) => ({ f, dist: Math.hypot(f.x - d.latest.x, f.y - d.latest.y) }))
          .sort((a, b) => a.dist - b.dist)[0];
        if (cerca && cerca.dist < 4) {
          mutarFotogramas((fs) =>
            fs.map((f, i) => (i === idx ? { ...f, balon: { ...f.balon, con: cerca.f.id } } : f)),
          );
        }
      }
      dragRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // el puntero ya no estaba capturado — nada que hacer
      }
    },
    [frame, mutarFotogramas, idx],
  );

  // ---------- Operaciones de fotogramas ----------

  const addFase = useCallback(() => {
    if (!value) return;
    mutarFotogramas((fs) => {
      const copia: Fotograma = {
        fichas: fs[idx].fichas.map((f) => ({ ...f })),
        balon: { ...fs[idx].balon },
        etiqueta: fs[idx].etiqueta,
        ms: fs[idx].ms,
      };
      return [...fs.slice(0, idx + 1), copia, ...fs.slice(idx + 1)];
    });
    setActivo(idx + 1);
    setSeleccion(null);
  }, [value, mutarFotogramas, idx]);

  const borrarFase = useCallback(() => {
    if (!value || frames.length <= 1) return;
    mutarFotogramas((fs) => fs.filter((_, i) => i !== idx));
    setActivo(Math.max(0, idx - 1));
    setSeleccion(null);
  }, [value, frames.length, mutarFotogramas, idx]);

  const moverFase = useCallback(
    (dir: -1 | 1) => {
      const destino = idx + dir;
      if (!value || destino < 0 || destino >= frames.length) return;
      mutarFotogramas((fs) => {
        const copia = [...fs];
        [copia[idx], copia[destino]] = [copia[destino], copia[idx]];
        return copia;
      });
      setActivo(destino);
    },
    [value, frames.length, mutarFotogramas, idx],
  );

  // ---------- Render: estado vacío ----------

  const fichaSel = frame?.fichas.find((f) => f.id === seleccion) ?? null;
  const trans = playing
    ? sinTransicion
      ? "none"
      : `left ${Math.round((frame?.ms ?? 1000) / velocidad)}ms ${EASING}, top ${Math.round((frame?.ms ?? 1000) / velocidad)}ms ${EASING}`
    : "none";

  if (!value || !frame) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-cream-border-strong bg-[#0a1d12] px-4 py-6 text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">
          Pizarra táctica animada (opcional)
        </p>
        <p className="mt-1 text-sm text-white/85 leading-snug">
          Dibuja el movimiento con fichas y fases: los jugadores verán la jugada en movimiento en la
          ficha de la tarea.
        </p>
        <button
          type="button"
          onClick={() => onChange(crearPizarraInicial())}
          className="mt-3 inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-white px-5 font-black text-[#0a1d12] hover:bg-white/90 transition"
        >
          <Copy className="w-4 h-4" aria-hidden /> Crear pizarra
        </button>
      </div>
    );
  }

  const visto = playing ? frames[beat] ?? frame : frame;
  const balon = visto.balon;
  const conPos = balon.con ? visto.fichas.find((f) => f.id === balon.con) : null;
  const balonPos = conPos ? { x: conPos.x, y: conPos.y } : { x: balon.x, y: balon.y };

  return (
    <div className="rounded-3xl bg-[#0a1d12] p-3 border border-black/30">
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-2 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">
          Pizarra táctica animada · {frames.length} fase{frames.length > 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            onChange(null);
          }}
          className="min-h-[36px] rounded-lg px-2 text-[11px] font-bold text-white/60 hover:text-[#f87171] transition"
          aria-label="Quitar la pizarra animada de esta tarea"
        >
          Quitar
        </button>
      </div>

      {/* ---------- Canvas ---------- */}
      <div
        ref={canvasRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative aspect-[105/68] w-full touch-none select-none overflow-hidden rounded-2xl border border-white/15 shadow-inner"
        role="application"
        aria-label={`Editor de pizarra táctica, fase ${idx + 1} de ${frames.length}. Arrastra las fichas para posicionarlas.`}
      >
        <CampoOscuro />

        {/* Carril del balón del beat actual (solo al reproducir) */}
        {playing && beat > 0 && !sinTransicion && (
          <svg viewBox="0 0 105 68" className="absolute inset-0 z-10 h-full w-full" preserveAspectRatio="none" aria-hidden>
            <line
              x1={frames[beat - 1].balon.x}
              y1={frames[beat - 1].balon.y}
              x2={balonPos.x}
              y2={balonPos.y}
              stroke={balon.trazo === "tiro" ? "#fbbf24" : "rgba(255,255,255,.85)"}
              strokeWidth={balon.trazo === "tiro" ? 1.3 : 0.8}
              strokeLinecap="round"
              strokeDasharray="2.2 1.8"
              className="pizarra-dash"
            />
          </svg>
        )}

        {/* Fichas del fotograma visible */}
        {visto.fichas.map((f) => (
          <FichaChip
            key={f.id}
            ficha={f}
            left={f.x}
            top={f.y}
            trans={trans}
            selected={!playing && f.id === seleccion}
            conBalon={balon.con === f.id}
            interactive={!playing}
            onPointerDown={(e) => onPointerDown(e, f.id, "ficha")}
          />
        ))}

        {/* Balón */}
        <div
          onPointerDown={playing ? undefined : (e) => onPointerDown(e, "balon", "balon")}
          style={{
            left: `${(balonPos.x / 105) * 100}%`,
            top: `${(balonPos.y / 68) * 100}%`,
            transform: "translate(-50%, -50%)",
            transition: trans,
            willChange: "left, top",
            touchAction: "none",
          }}
          className={`absolute z-30 h-3.5 w-3.5 rounded-full bg-white border-2 border-[#1d1d1b] shadow ${
            playing ? "" : "cursor-grab active:cursor-grabbing"
          }`}
          aria-hidden
        />

        {/* Etiqueta del beat */}
        <span className="absolute bottom-1 left-1.5 z-30 max-w-[70%] truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-bold text-white">
          {playing ? visto.etiqueta ?? `${beat + 1}/${frames.length}` : `Fase ${idx + 1}`}
        </span>
      </div>

      {/* ---------- Mandos ---------- */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={playing ? pausar : reproducir}
          aria-label={playing ? "Pausar previsualización" : "Reproducir la pizarra"}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white text-[#0a1d12] hover:bg-white/90 transition"
        >
          {playing ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => setVelocidad((v) => (v === 1 ? 1.5 : v === 1.5 ? 2 : 1))}
          aria-label={`Velocidad ${velocidad} — tocar para cambiar`}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-white/25 px-3 text-sm font-black text-white/85 hover:bg-white/10 transition"
        >
          <Gauge className="h-4 w-4" aria-hidden /> {velocidad}×
        </button>
        <div className="ml-auto flex items-center gap-1" aria-hidden>
          {frames.map((_, i) => (
            <span
              key={i}
              className={`rounded-full transition-colors ${
                i === (playing ? beat : idx) ? "h-1.5 w-3 bg-brand-400" : "h-1.5 w-1.5 bg-white/30"
              }`}
            />
          ))}
        </div>
      </div>

      {/* ---------- Fases ---------- */}
      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {frames.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setPlaying(false);
              setActivo(i);
              setSeleccion(null);
            }}
            aria-pressed={i === idx && !playing}
            aria-label={`Ir a la fase ${i + 1}`}
            className={`shrink-0 min-h-[40px] min-w-[40px] rounded-xl border text-sm font-black transition ${
              i === idx && !playing
                ? "bg-white text-[#0a1d12] border-white"
                : "bg-white/10 text-white/80 border-white/20 hover:bg-white/20"
            }`}
          >
            {i + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={addFase}
          disabled={frames.length >= 40}
          className="shrink-0 inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-brand-400/20 border border-brand-400/50 px-3 text-sm font-black text-brand-200 hover:bg-brand-400/30 transition disabled:opacity-40"
        >
          <Copy className="w-4 h-4" aria-hidden /> + Fase
        </button>
        {frames.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => moverFase(-1)}
              disabled={idx === 0}
              aria-label="Mover fase hacia atrás"
              className="shrink-0 min-h-[40px] min-w-[40px] rounded-xl border border-white/20 text-white/80 hover:bg-white/10 transition disabled:opacity-30"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => moverFase(1)}
              disabled={idx === frames.length - 1}
              aria-label="Mover fase hacia delante"
              className="shrink-0 min-h-[40px] min-w-[40px] rounded-xl border border-white/20 text-white/80 hover:bg-white/10 transition disabled:opacity-30"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={borrarFase}
              aria-label={`Eliminar la fase ${idx + 1}`}
              className="shrink-0 inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-[#f87171]/40 text-[#f87171] hover:bg-[#f87171]/15 transition"
            >
              <Trash2 className="w-4 h-4" aria-hidden />
            </button>
          </>
        )}
      </div>

      {/* ---------- Ficha de la fase actual ---------- */}
      <div className="mt-2 rounded-2xl bg-white/5 border border-white/10 p-2.5">
        <input
          value={frame.etiqueta ?? ""}
          onChange={(e) =>
            mutarFotogramas((fs) =>
              fs.map((f, i) => (i === idx ? { ...f, etiqueta: e.target.value.slice(0, 160) || undefined } : f)),
            )
          }
          placeholder="Qué ilustra esta fase — ej. «pase al tercer hombre»"
          maxLength={160}
          aria-label="Etiqueta de la fase"
          className="min-h-[44px] w-full rounded-xl bg-[#0a1d12] border border-white/15 px-3 text-sm font-semibold text-white placeholder:text-white/35"
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {MS_OPCIONES.map((ms) => (
            <button
              key={ms}
              type="button"
              onClick={() => mutarFotogramas((fs) => fs.map((f, i) => (i === idx ? { ...f, ms } : f)))}
              aria-pressed={(frame.ms ?? 1000) === ms}
              className={`min-h-[36px] rounded-lg border px-2.5 text-xs font-black transition ${
                (frame.ms ?? 1000) === ms
                  ? "bg-white text-[#0a1d12] border-white"
                  : "bg-white/10 text-white/75 border-white/20 hover:bg-white/20"
              }`}
            >
              {ms / 1000}s
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-white/20" aria-hidden />
          {(["pase", "tiro", "conduccion"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() =>
                mutarFotogramas((fs) => fs.map((f, i) => (i === idx ? { ...f, balon: { ...f.balon, trazo: t } } : f)))
              }
              aria-pressed={(frame.balon.trazo ?? "pase") === t}
              className={`min-h-[36px] rounded-lg border px-2.5 text-xs font-black capitalize transition ${
                (frame.balon.trazo ?? "pase") === t
                  ? "bg-white text-[#0a1d12] border-white"
                  : "bg-white/10 text-white/75 border-white/20 hover:bg-white/20"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Fichas: añadir ---------- */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => addFicha("propia", siguienteDorsal(frame.fichas))}
          disabled={frame.fichas.length >= 22}
          className="min-h-[40px] rounded-xl border border-white/25 px-3 text-xs font-black text-white/90 hover:bg-white/10 transition disabled:opacity-40"
        >
          + Jugador
        </button>
        <button
          type="button"
          onClick={() => addFicha("propia", 1)}
          disabled={frame.fichas.length >= 22}
          className="min-h-[40px] rounded-xl border border-white/25 px-3 text-xs font-black text-white/90 hover:bg-white/10 transition disabled:opacity-40"
        >
          + Portero
        </button>
        <button
          type="button"
          onClick={() => addFicha("rival")}
          disabled={frame.fichas.length >= 22}
          className="min-h-[40px] rounded-xl border border-white/25 px-3 text-xs font-black text-white/90 hover:bg-white/10 transition disabled:opacity-40"
        >
          + Rival
        </button>
      </div>

      {/* ---------- Ficha seleccionada ---------- */}
      <div className="mt-2 rounded-2xl bg-white/5 border border-white/10 p-2.5">
        {fichaSel ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-black text-white mr-auto">
                {fichaSel.eq === "propia" ? (fichaSel.num === 1 ? "Portero" : `Jugador ${fichaSel.num ?? ""}`) : "Rival"}
              </p>
              {fichaSel.eq === "propia" && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => patchFichaGlobal(fichaSel.id, { num: Math.max(1, (fichaSel.num ?? 1) - 1) })}
                    aria-label="Bajar dorsal"
                    className="min-h-[36px] min-w-[36px] rounded-lg border border-white/20 text-white/85 hover:bg-white/10 transition"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-black text-white">{fichaSel.num ?? "—"}</span>
                  <button
                    type="button"
                    onClick={() => patchFichaGlobal(fichaSel.id, { num: Math.min(99, (fichaSel.num ?? 1) + 1) })}
                    aria-label="Subir dorsal"
                    className="min-h-[36px] min-w-[36px] rounded-lg border border-white/20 text-white/85 hover:bg-white/10 transition"
                  >
                    +
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() =>
                  patchFichaGlobal(fichaSel.id, { eq: fichaSel.eq === "propia" ? "rival" : "propia" })
                }
                aria-label={`Cambiar a equipo ${fichaSel.eq === "propia" ? "rival" : "propio"}`}
                className="min-h-[36px] rounded-lg border border-white/20 px-2.5 text-xs font-black text-white/85 hover:bg-white/10 transition"
              >
                {fichaSel.eq === "propia" ? "→ Rival" : "→ Propio"}
              </button>
              <button
                type="button"
                onClick={() => removeFicha(fichaSel.id)}
                aria-label="Quitar ficha del campo"
                className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-[#f87171]/40 px-2.5 text-[#f87171] hover:bg-[#f87171]/15 transition"
              >
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
            </div>
            {/* Nudge fino (también accesible por teclado) */}
            <div className="mt-2 flex items-center justify-center gap-1">
              {(
                [
                  ["◀", -2, 0, "izquierda"],
                  ["▲", 0, -2, "arriba"],
                  ["▼", 0, 2, "abajo"],
                  ["▶", 2, 0, "derecha"],
                ] as const
              ).map(([sim, dx, dy, dir]) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => nudgeFicha(fichaSel.id, dx, dy)}
                  aria-label={`Mover ficha 2 metros hacia ${dir}`}
                  className="min-h-[40px] min-w-[44px] rounded-lg border border-white/20 text-white/85 hover:bg-white/10 transition"
                >
                  {sim}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-white/60 leading-snug">
            Toca una ficha para ajustar dorsal, equipo o posición. Arrastra el balón hasta un jugador
            para que lo porte.
          </p>
        )}
      </div>
    </div>
  );
}

function siguienteDorsal(fichas: FichaAnim[]): number {
  const propios = fichas.filter((f) => f.eq === "propia").map((f) => f.num ?? 0);
  return propios.length === 0 ? 1 : Math.min(99, Math.max(...propios) + 1);
}
