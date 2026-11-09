"use client";

// ============================================================================
// PIZARRA ANIMADA — Biblioteca (mini-pizarra táctica en movimiento)
// ----------------------------------------------------------------------------
// Renderiza una Animacion (src/lib/animaciones-ejercicio.ts) sobre un campo
// SVG 105×68: las fichas (jugadores) y el balón se desplazan entre
// fotogramas con transiciones CSS (el navegador interpola — 60 fps fluidos
// sin rAF ni re-renders por frame).
//
// Rendimiento y respeto por el usuario:
//   · IntersectionObserver → solo anima lo visible en pantalla.
//   · visibilitychange → pausa si la pestaña está en segundo plano.
//   · prefers-reduced-motion → arranca en pausa (frame estático) con aviso.
//   · Los carriles de pase se dibujan como línea discontinua con dash
//     animado; el tiro se destaca en ámbar.
//
// Variantes:
//   · mini    → dentro de la tarjeta de tarea: bucle automático, sin mandos.
//   · detalle → en la ficha: mando reproducir/pausa, reinicio y velocidad,
//               más subtítulo del beat (qué idea táctica se ilustra).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gauge, Pause, Play, RotateCcw } from "lucide-react";
import { msDe, type Animacion, type FichaAnim, type Fotograma } from "@/lib/animaciones-ejercicio";

const HOLD_MS = 420; // pausa al llegar a cada fotograma (legibilidad del patrón)
const EASING = "cubic-bezier(.45,.05,.35,1)";

type Punto = { x: number; y: number };

/** Posición absoluta del balón en un fotograma (resuelve el `con`) */
function posBalon(fr: Fotograma): Punto {
  const b = fr.balon;
  if (b.con) {
    const ficha = fr.fichas.find((f) => f.id === b.con);
    if (ficha) return { x: ficha.x, y: ficha.y };
  }
  return { x: b.x, y: b.y };
}

// ---------- Campo 105×68 ----------

function CampoSVG() {
  return (
    <svg
      viewBox="0 0 105 68"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* césped a rayas */}
      {Array.from({ length: 7 }, (_, i) => (
        <rect
          key={i}
          x={(105 / 7) * i}
          y={0}
          width={105 / 7}
          height={68}
          fill={i % 2 === 0 ? "#3e8e4f" : "#377f45"}
        />
      ))}
      <g stroke="rgba(255,255,255,.65)" strokeWidth=".5" fill="none">
        {/* perímetro */}
        <rect x="1.5" y="1.5" width="102" height="65" />
        {/* medio campo */}
        <line x1="52.5" y1="1.5" x2="52.5" y2="66.5" />
        <circle cx="52.5" cy="34" r="7.5" />
        <circle cx="52.5" cy="34" r=".6" fill="rgba(255,255,255,.65)" stroke="none" />
        {/* áreas izquierda (arco propio) */}
        <rect x="1.5" y="13.85" width="16.5" height="40.3" />
        <rect x="1.5" y="24.85" width="5.5" height="18.3" />
        <circle cx="11" cy="34" r=".6" fill="rgba(255,255,255,.65)" stroke="none" />
        <path d="M 18 26.7 A 9 9 0 0 1 18 41.3" />
        {/* áreas derecha (arco rival) */}
        <rect x="87" y="13.85" width="16.5" height="40.3" />
        <rect x="98" y="24.85" width="5.5" height="18.3" />
        <circle cx="94" cy="34" r=".6" fill="rgba(255,255,255,.65)" stroke="none" />
        <path d="M 87 26.7 A 9 9 0 0 0 87 41.3" />
        {/* esquinas */}
        <path d="M 1.5 4 A 3 3 0 0 0 4.5 1.5" />
        <path d="M 1.5 64 A 3 3 0 0 1 4.5 66.5" />
        <path d="M 103.5 4 A 3 3 0 0 1 100.5 1.5" />
        <path d="M 103.5 64 A 3 3 0 0 0 100.5 66.5" />
      </g>
      {/* porterías */}
      <g fill="rgba(255,255,255,.28)">
        <rect x="0" y="30.2" width="1.5" height="7.6" />
        <rect x="103.5" y="30.2" width="1.5" height="7.6" />
      </g>
    </svg>
  );
}

// ---------- Ficha (jugador) ----------

function FichaView({
  ficha,
  left,
  top,
  trans,
  mini,
}: {
  ficha: FichaAnim;
  left: number;
  top: number;
  trans: string;
  mini: boolean;
}) {
  const portero = ficha.eq === "propia" && ficha.num === 1;
  const color =
    ficha.eq === "propia"
      ? portero
        ? "bg-gradient-to-br from-[#e3a93c] to-[#8a6206] border-white/70"
        : "bg-gradient-to-br from-brand-400 to-brand-600 border-white/70"
      : "bg-gradient-to-br from-[#e05252] to-[#b4232a] border-white/60";

  return (
    <span
      style={{
        left: `${(left / 105) * 100}%`,
        top: `${(top / 68) * 100}%`,
        transform: "translate(-50%, -50%)",
        transition: trans,
        willChange: "left, top",
      }}
      className={`absolute z-20 flex items-center justify-center rounded-full border font-black text-white shadow ${
        mini ? "h-3.5 w-3.5 text-[7px]" : "h-5 w-5 text-[9px] sm:h-6 sm:w-6 sm:text-[10px]"
      } ${color}`}
    >
      {ficha.eq === "propia" ? (ficha.num ?? "") : ""}
    </span>
  );
}

// ---------- Componente principal ----------

export function PizarraAnimada({
  animacion,
  variante = "mini",
}: {
  animacion: Animacion;
  /** mini: tarjeta de tarea (bucle automático) · detalle: ficha (con mandos) */
  variante?: "mini" | "detalle";
}) {
  const mini = variante === "mini";
  const frames = useMemo(() => animacion.fotogramas, [animacion]);

  const contenedorRef = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState(0);
  const [sinTransicion, setSinTransicion] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [reducido, setReducido] = useState(false);
  const [velocidad, setVelocidad] = useState(1);

  // Sólo anima lo visible (ahorro de CPU/batería con muchas tarjetas)
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "120px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Pausa si la pestaña queda en segundo plano
  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Movimiento reducido: arranca en pausa con frame estático
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => {
      setReducido(mq.matches);
      if (mq.matches) setPlaying(false);
    };
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const activo =
    playing && visible && tabVisible && !reducido && frames.length > 1;

  // Motor de beats: baja frecuencia (un cambio por beat; CSS interpola)
  useEffect(() => {
    if (!activo) return;
    const espera = (msDe(frames[beat]) + HOLD_MS) / velocidad;
    const id = setTimeout(() => {
      const nb = (beat + 1) % frames.length;
      if (nb === 0) setSinTransicion(true);
      setBeat(nb);
    }, espera);
    return () => clearTimeout(id);
  }, [activo, beat, velocidad, frames]);

  // El salto al fotograma 0 es sin transición (rebobinado instantáneo)
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

  const alternar = useCallback(() => setPlaying((p) => !p), []);
  const reiniciar = useCallback(() => {
    setSinTransicion(true);
    setBeat(0);
    setPlaying(true);
  }, []);
  const cambiarVelocidad = useCallback(() => {
    setVelocidad((v) => (v === 1 ? 1.5 : v === 1.5 ? 2 : 1));
  }, []);

  const actual = frames[beat];
  const previa = frames[(beat - 1 + frames.length) % frames.length];
  const dur = Math.round(msDe(actual) / velocidad);
  const trans = sinTransicion
    ? "none"
    : `left ${dur}ms ${EASING}, top ${dur}ms ${EASING}`;

  const balonPos = posBalon(actual);
  const balonPrev = posBalon(previa);
  const trazo = actual.balon.trazo ?? "pase";
  const distPase = Math.hypot(balonPos.x - balonPrev.x, balonPos.y - balonPrev.y);
  const mostrarCarril =
    beat > 0 && !sinTransicion && trazo !== "conduccion" && distPase > 5;
  const carrilColor = trazo === "tiro" ? "#fbbf24" : "rgba(255,255,255,.9)";

  const etiqueta = actual.etiqueta ?? animacion.titulo;

  return (
    <div className={mini ? "group/pizarra relative" : ""}>
      <div
        ref={contenedorRef}
        role="img"
        aria-label={`Pizarra animada: ${animacion.titulo}. ${animacion.descripcion}`}
        className={`relative aspect-[105/68] w-full overflow-hidden rounded-2xl border border-black/15 shadow-sm ${
          mini ? "transition-transform duration-300 group-hover/pizarra:scale-[1.015]" : ""
        }`}
      >
        <CampoSVG />

        {/* Carril de pase / tiro del beat actual */}
        <svg
          viewBox="0 0 105 68"
          preserveAspectRatio="none"
          className="absolute inset-0 z-10 h-full w-full"
          aria-hidden
        >
          {mostrarCarril && (
            <line
              key={beat}
              x1={balonPrev.x}
              y1={balonPrev.y}
              x2={balonPos.x}
              y2={balonPos.y}
              stroke={carrilColor}
              strokeWidth={trazo === "tiro" ? 1.3 : 0.8}
              strokeLinecap="round"
              strokeDasharray="2.2 1.8"
              className="pizarra-dash"
            />
          )}
        </svg>

        {/* Fichas */}
        {actual.fichas.map((fi) => (
          <FichaView
            key={fi.id}
            ficha={fi}
            left={fi.x}
            top={fi.y}
            trans={trans}
            mini={mini}
          />
        ))}

        {/* Balón */}
        <span
          style={{
            left: `${(balonPos.x / 105) * 100}%`,
            top: `${(balonPos.y / 68) * 100}%`,
            transform: "translate(-50%, -50%)",
            transition: trans,
            willChange: "left, top",
          }}
          className={`absolute z-30 rounded-full bg-white border-2 border-[#1d1d1b] shadow ${
            mini ? "h-2.5 w-2.5" : "h-3 w-3 sm:h-3.5 sm:w-3.5"
          }`}
          aria-hidden
        />

        {/* Aviso de movimiento reducido */}
        {reducido && (
          <span className="absolute bottom-1.5 left-1.5 z-30 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-bold text-white">
            <Pause className="h-2.5 w-2.5" aria-hidden /> Animación en pausa
          </span>
        )}
      </div>

      {/* ---------- Mandos y subtítulo (solo variante detalle) ---------- */}
      {!mini && (
        <div className="mt-2 space-y-2">
          <div className="flex min-h-[28px] items-center justify-between gap-2 rounded-xl bg-cream-dark/60 border border-cream-border px-3 py-1.5">
            <p
              className="text-xs font-bold text-[#2a4630] leading-snug flex-1"
              aria-live="polite"
            >
              {etiqueta}
            </p>
            <span className="shrink-0 flex items-center gap-1" aria-hidden>
              {frames.map((_, i) => (
                <span
                  key={i}
                  className={`rounded-full transition-colors ${
                    i === beat ? "h-1.5 w-3 bg-brand-600" : "h-1.5 w-1.5 bg-cream-border-strong"
                  }`}
                />
              ))}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={alternar}
              aria-label={playing ? "Pausar animación" : "Reproducir animación"}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-cream-border bg-white text-brand-600 hover:bg-brand-600/10 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              {playing ? (
                <Pause className="h-5 w-5" aria-hidden />
              ) : (
                <Play className="h-5 w-5" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={reiniciar}
              aria-label="Reiniciar animación"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-cream-border bg-white text-[#5d7263] hover:text-[#2a4630] hover:bg-cream-dark/60 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={cambiarVelocidad}
              aria-label={`Velocidad ${velocidad} — tocar para cambiar`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-cream-border bg-white px-3 text-sm font-black text-[#5d7263] hover:text-[#2a4630] hover:bg-cream-dark/60 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <Gauge className="h-4 w-4" aria-hidden /> {velocidad}×
            </button>
            <p className="ml-auto text-[10px] font-semibold text-[#8a9a8d] leading-tight text-right">
              {animacion.titulo}
              <br />
              <span className="text-[#8a9a8d]/80">{animacion.descripcion}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

