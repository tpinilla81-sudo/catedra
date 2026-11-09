// ============================================================================
// ANIMACIONES DE EJERCICIOS — PILAR BIBLIOTECA
// ----------------------------------------------------------------------------
// Mini-pizarras animadas para cada tarea de la biblioteca. Puro TypeScript
// (sin React, sin Prisma): viaja del RSC al cliente sin serializar nada raro.
//
// Cómo funciona:
//   · Cada plantilla es una secuencia de FOTOGRAMAS (snapshot completo del
//     campo: fichas + balón). El componente anima la INTERPOLACIÓN entre
//     fotogramas consecutivos (el navegador hace la curva con CSS).
//   · Coordenadas en espacio real de campo: 105 × 68 (metros FIFA),
//     ataque siempre hacia la derecha (x = 105). Se espeja por tarea con un
//     hash determinista del id → mismas entradas, misma salida (sin parpadeo
//     de hidratación) y las tareas no se ven calcadas entre sí.
//   · El balón viaja solo (pase / tiro) o pegado a una ficha (`con`).
//     Las líneas de pase (carriles) las dibuja el componente cuando el balón
//     cambia de dueño o de posición.
//   · `seleccionarAnimacion()` escoge plantilla por fase + palabras clave del
//     título/objetivo → TODO ejercicio tiene animación aunque nadie la
//     configurara a mano.
// ============================================================================

export type Eq = "propia" | "rival";

/** Ficha (jugador) sobre el campo. id estable dentro de la plantilla. */
export type FichaAnim = {
  id: string;
  eq: Eq;
  x: number; // 0..105
  y: number; // 0..68
  num?: number; // dorsal (solo equipo propio)
};

/** Balón en un fotograma. `con` = id de la ficha que lo porta. */
export type BalonAnim = {
  x: number;
  y: number;
  con?: string;
  /** Estilo del trazo del movimiento de balón hacia ESTE fotograma */
  trazo?: "pase" | "tiro" | "conduccion";
};

/** Un fotograma = destino del beat: dónde quedan TODOS al terminar el beat. */
export type Fotograma = {
  fichas: FichaAnim[];
  balon: BalonAnim;
  /** Subtítulo del beat (qué idea táctica se está ilustrando) */
  etiqueta?: string;
  /** Duración del beat en ms (default 1000) */
  ms?: number;
};

export type Animacion = {
  /** Clave de la plantilla usada (p. ej. "circulacion") */
  clave: string;
  /** Título corto de la mecánica ilustrada */
  titulo: string;
  /** Una línea: qué ilustra la animación */
  descripcion: string;
  fotogramas: Fotograma[];
};

const MS_DEFAULT = 1000;
export const msDe = (f: Fotograma): number => f.ms ?? MS_DEFAULT;

// ============================================================================
// PLANTILLAS — ataque hacia la derecha (x=105)
// ============================================================================

const f = (
  fichas: FichaAnim[],
  balon: BalonAnim,
  etiqueta?: string,
  ms?: number,
): Fotograma => ({ fichas, balon, etiqueta, ms });

const propia = (id: string, x: number, y: number, num?: number): FichaAnim => ({
  id,
  eq: "propia",
  x,
  y,
  num,
});
const rival = (id: string, x: number, y: number): FichaAnim => ({
  id,
  eq: "rival",
  x,
  y,
});

// ---------- 1 · Circulación posicional (Organización Ofensiva) ----------

function circulacion(): Animacion {
  const c = (): FichaAnim[] => [
    propia("p1", 9, 34, 1),
    propia("p2", 24, 13, 3),
    propia("p3", 21, 34, 4),
    propia("p4", 24, 55, 2),
    propia("p5", 40, 26, 5),
    propia("p6", 46, 44, 6),
    propia("p7", 58, 34, 8),
    propia("p8", 72, 12, 11),
    propia("p9", 70, 40, 9),
  ];
  return {
    clave: "circulacion",
    titulo: "Circulación posicional",
    descripcion:
      "Salida limpia desde atrás, cambio de orientación y ruptura por el carril.",
    fotogramas: [
      f(c(), { x: 9, y: 34, con: "p1" }, "Salida limpia desde el portero", 1200),
      f(
        c().map((p) => (p.id === "p3" ? { ...p, x: 24, y: 36 } : p)),
        { x: 24, y: 36, con: "p3" },
        "Primer pase al central",
        900,
      ),
      f(
        c().map((p) => (p.id === "p5" ? { ...p, x: 44, y: 24 } : p)),
        { x: 44, y: 24, con: "p5" },
        "El pivote entre líneas recibe orientado",
        1000,
      ),
      f(
        c().map((p) => (p.id === "p7" ? { ...p, x: 70, y: 30 } : p)),
        { x: 70, y: 30, con: "p7" },
        "Cambio de orientación al mediapunta",
        1000,
      ),
      f(
        c().map((p) =>
          p.id === "p8"
            ? { ...p, x: 90, y: 13 }
            : p.id === "p9"
              ? { ...p, x: 90, y: 42 }
              : p,
        ),
        { x: 90, y: 13, con: "p8", trazo: "conduccion" },
        "El extremo rompe al carril",
        1100,
      ),
      f(
        c().map((p) =>
          p.id === "p8"
            ? { ...p, x: 90, y: 13 }
            : p.id === "p9"
              ? { ...p, x: 94, y: 40 }
              : p,
        ),
        { x: 94, y: 40, con: "p9", trazo: "pase" },
        "Pase al espacio para el delantero",
        800,
      ),
      f(
        c().map((p) =>
          p.id === "p8" ? { ...p, x: 90, y: 13 } : p.id === "p9" ? { ...p, x: 94, y: 40 } : p,
        ),
        { x: 103, y: 34, trazo: "tiro" },
        "Remate a puerta",
        1000,
      ),
    ],
  };
}

// ---------- 2 · Tercer hombre (pared y continuidad) ----------

function tercerHombre(): Animacion {
  const c = (): FichaAnim[] => [
    propia("p1", 38, 34, 5),
    propia("p2", 48, 40, 6),
    propia("p3", 56, 26, 8),
    propia("p4", 70, 46, 9),
    propia("p5", 52, 18, 10),
  ];
  return {
    clave: "tercer-hombre",
    titulo: "Pared y tercer hombre",
    descripcion: "Primer pase al pie, pared de vuelta y llegada del tercer hombre.",
    fotogramas: [
      f(c(), { x: 38, y: 34, con: "p1" }, "El pivote abre en apoyo", 1000),
      f(
        c().map((p) => (p.id === "p3" ? { ...p, x: 62, y: 24 } : p)),
        { x: 48, y: 40, con: "p2", trazo: "pase" },
        "Primer pase al pie del medio centro",
        800,
      ),
      f(
        c().map((p) => (p.id === "p3" ? { ...p, x: 66, y: 22 } : p)),
        { x: 66, y: 22, con: "p3", trazo: "pase" },
        "Pared al tercer hombre que llega",
        800,
      ),
      f(
        c().map((p) =>
          p.id === "p3" ? { ...p, x: 80, y: 26 } : p.id === "p4" ? { ...p, x: 78, y: 44 } : p,
        ),
        { x: 80, y: 26, con: "p3", trazo: "conduccion" },
        "Conducción al espacio",
        900,
      ),
      f(
        c().map((p) =>
          p.id === "p3" ? { ...p, x: 80, y: 26 } : p.id === "p4" ? { ...p, x: 92, y: 42 } : p,
        ),
        { x: 92, y: 42, con: "p4", trazo: "pase" },
        "Asistencia al atacante",
        800,
      ),
      f(
        c().map((p) =>
          p.id === "p3" ? { ...p, x: 80, y: 26 } : p.id === "p4" ? { ...p, x: 92, y: 42 } : p,
        ),
        { x: 103, y: 36, trazo: "tiro" },
        "Remate cruzado",
        1000,
      ),
    ],
  };
}

// ---------- 3 · Finalización (combinación y remate) ----------

function finalizacion(): Animacion {
  const c = (): FichaAnim[] => [
    propia("p1", 52, 34, 6),
    propia("p2", 66, 40, 10),
    propia("p3", 76, 28, 9),
    propia("p4", 74, 52, 7),
  ];
  return {
    clave: "finalizacion",
    titulo: "Combinación y remate",
    descripcion: "Pared en el vértice, cambio rápido y centro atrás al punto de penalti.",
    fotogramas: [
      f(c(), { x: 52, y: 34, con: "p1" }, "Balón al mediapunta de espaldas", 1000),
      f(
        c().map((p) => (p.id === "p2" ? { ...p, x: 68, y: 38 } : p)),
        { x: 68, y: 38, con: "p2", trazo: "pase" },
        "Pase entre líneas al vértice",
        800,
      ),
      f(
        c().map((p) => (p.id === "p1" ? { ...p, x: 62, y: 32 } : p)),
        { x: 62, y: 32, con: "p1", trazo: "pase" },
        "Pared de vuelta en el vértice",
        800,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 62, y: 32 } : p.id === "p4" ? { ...p, x: 82, y: 54 } : p,
        ),
        { x: 82, y: 54, con: "p4", trazo: "pase" },
        "Cambio rápido al extremo",
        800,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 70, y: 36 } : p.id === "p4" ? { ...p, x: 82, y: 54 } : p,
        ),
        { x: 92, y: 42, trazo: "pase" },
        "Centro atrás al segundo palo",
        800,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 70, y: 36 } : p.id === "p3" ? { ...p, x: 92, y: 40 } : p,
        ),
        { x: 103, y: 36, trazo: "tiro" },
        "Remate a un toque",
        1000,
      ),
    ],
  };
}

// ---------- 4 · Rondo 5v2 ----------

function rondo(): Animacion {
  const c = (): FichaAnim[] => [
    propia("p1", 35, 20, 4),
    propia("p2", 60, 16, 6),
    propia("p3", 70, 40, 8),
    propia("p4", 52, 54, 10),
    propia("p5", 32, 42, 3),
    rival("r1", 48, 30),
    rival("r2", 52, 38),
  ];
  return {
    clave: "rondo",
    titulo: "Rondo 5v2",
    descripcion: "Toques rápidos que superan la primera presión y movilizan a los interiores.",
    fotogramas: [
      f(c(), { x: 35, y: 20, con: "p1" }, "Rondo 5v2 — toques rápidos", 850),
      f(
        c().map((p) => (p.id === "r1" ? { ...p, x: 46, y: 26 } : p)),
        { x: 70, y: 40, con: "p3", trazo: "pase" },
        "Pase que supera la primera línea",
        750,
      ),
      f(
        c().map((p) => (p.id === "r1" ? { ...p, x: 58, y: 30 } : p)),
        { x: 60, y: 16, con: "p2", trazo: "pase" },
        "El interior salta al cierre",
        750,
      ),
      f(
        c().map((p) => (p.id === "r2" ? { ...p, x: 56, y: 44 } : p)),
        { x: 52, y: 54, con: "p4", trazo: "pase" },
        "Rebote y giro del cuerpo",
        750,
      ),
      f(
        c().map((p) => (p.id === "r2" ? { ...p, x: 46, y: 46 } : p)),
        { x: 32, y: 42, con: "p5", trazo: "pase" },
        "Cambio de ritmo — el rival persigue",
        750,
      ),
      f(
        c().map((p) =>
          p.id === "r1" ? { ...p, x: 46, y: 26 } : p.id === "r2" ? { ...p, x: 50, y: 36 } : p,
        ),
        { x: 35, y: 20, con: "p1", trazo: "pase" },
        "Circuito cerrado — el balón vuelve al inicio",
        900,
      ),
    ],
  };
}

// ---------- 5 · Presión y bloque deslizante (Organización Defensiva) ----------

function presion(): Animacion {
  const c = (): FichaAnim[] => [
    propia("p1", 58, 36, 9), // delantero que presiona
    propia("p2", 44, 26, 8),
    propia("p3", 40, 42, 6),
    propia("p4", 24, 30, 4),
    propia("p5", 26, 44, 5),
    propia("p6", 22, 14, 3),
    propia("p7", 24, 56, 2),
    rival("r1", 80, 34),
    rival("r2", 52, 26),
    rival("r3", 62, 56),
  ];
  return {
    clave: "presion",
    titulo: "Presión y bloque deslizante",
    descripcion: "Gatillo de presión, curva al interior y deslizamiento compacto del bloque.",
    fotogramas: [
      f(c(), { x: 80, y: 34, con: "r1" }, "El rival construye — el bloque espera el gatillo", 1200),
      f(
        c().map((p) => (p.id === "r2" ? { ...p, x: 50, y: 24 } : p.id === "p1" ? { ...p, x: 52, y: 28 } : p)),
        { x: 50, y: 24, con: "r2", trazo: "pase" },
        "Gatillo: pase hacia atrás — el delantero salta",
        900,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 44, y: 24 } :
          p.id === "p2" ? { ...p, x: 36, y: 22 } :
          p.id === "p3" ? { ...p, x: 34, y: 38 } :
          p.id === "p4" ? { ...p, x: 28, y: 26 } :
          p.id === "p5" ? { ...p, x: 30, y: 40 } : p,
        ),
        { x: 44, y: 24, con: "p1" },
        "Curva de presión: se tapa el interior",
        1000,
      ),
      f(
        c().map((p) =>
          p.id === "r3" ? { ...p, x: 64, y: 52 } :
          p.id === "p1" ? { ...p, x: 58, y: 46 } :
          p.id === "p2" ? { ...p, x: 48, y: 40 } :
          p.id === "p3" ? { ...p, x: 44, y: 50 } :
          p.id === "p4" ? { ...p, x: 34, y: 36 } :
          p.id === "p5" ? { ...p, x: 36, y: 50 } :
          p.id === "p6" ? { ...p, x: 30, y: 22 } :
          p.id === "p7" ? { ...p, x: 32, y: 58 } : p,
        ),
        { x: 64, y: 52, con: "r3", trazo: "pase" },
        "Cambio al carril — todo el bloque se desliza junto",
        1100,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 60, y: 50 } :
          p.id === "p2" ? { ...p, x: 50, y: 44 } :
          p.id === "p3" ? { ...p, x: 46, y: 52 } :
          p.id === "r3" ? { ...p, x: 68, y: 54 } : p,
        ),
        { x: 68, y: 54, con: "p1" },
        "Pressing al carrilero con cobertura del interior",
        1100,
      ),
    ],
  };
}

// ---------- 6 · Cobertura y basculación ----------

function cobertura(): Animacion {
  const c = (): FichaAnim[] => [
    propia("p1", 26, 36, 4), // DFC que sale
    propia("p2", 24, 50, 5), // DFC
    propia("p3", 38, 34, 5), // pivote que cubre
    propia("p4", 22, 16, 3), // lateral izq
    propia("p5", 24, 58, 2), // lateral der
    rival("r1", 48, 38),
    rival("r2", 64, 40),
  ];
  return {
    clave: "cobertura",
    titulo: "Cobertura y basculación",
    descripcion: "Salida del central al duelo, el pivote cubre su espalda y la línea bascula junta.",
    fotogramas: [
      f(c(), { x: 64, y: 40, con: "r2" }, "El rival recibe entre líneas", 1100),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 40, y: 38 } : p.id === "r1" ? { ...p, x: 48, y: 38 } : p,
        ),
        { x: 48, y: 38, con: "r1", trazo: "pase" },
        "Salida del DFC al duelo",
        1000,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 40, y: 38 } :
          p.id === "p3" ? { ...p, x: 30, y: 38 } :
          p.id === "r1" ? { ...p, x: 52, y: 36 } : p,
        ),
        { x: 52, y: 36, con: "r1", trazo: "conduccion" },
        "El pivote cubre la espalda del central",
        1000,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 44, y: 40 } :
          p.id === "p2" ? { ...p, x: 20, y: 46 } :
          p.id === "p3" ? { ...p, x: 32, y: 40 } :
          p.id === "p4" ? { ...p, x: 24, y: 16 } :
          p.id === "p5" ? { ...p, x: 26, y: 56 } :
          p.id === "r1" ? { ...p, x: 46, y: 40 } : p,
        ),
        { x: 46, y: 40, con: "r1" },
        "La línea bascula junta hacia su propio arco",
        1100,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 42, y: 40 } :
          p.id === "p3" ? { ...p, x: 34, y: 38 } :
          p.id === "r1" ? { ...p, x: 44, y: 40 } : p,
        ),
        { x: 44, y: 40, con: "p1" },
        "Duelo 1v1 con doble cobertura detrás",
        1100,
      ),
    ],
  };
}

// ---------- 7 · Transición ofensiva (robo + primer pase vertical) ----------

function transicionOfensiva(): Animacion {
  const c = (): FichaAnim[] => [
    propia("p1", 24, 30, 4),
    propia("p2", 26, 44, 5),
    propia("p3", 40, 36, 5),
    propia("p4", 52, 28, 8),
    propia("p5", 64, 12, 11),
    propia("p6", 70, 40, 9),
    rival("r1", 34, 42),
    rival("r2", 44, 34),
  ];
  return {
    clave: "transicion-ofensiva",
    titulo: "Transición ofensiva",
    descripcion: "Robo en campo propio, primer pase vertical y ruptura en los 5 segundos.",
    fotogramas: [
      f(c(), { x: 34, y: 42, con: "r1" }, "El rival ataca — bloque esperando el robo", 1100),
      f(
        c().map((p) =>
          p.id === "p3" ? { ...p, x: 38, y: 38 } : p.id === "r1" ? { ...p, x: 36, y: 40 } : p,
        ),
        { x: 38, y: 38, con: "p3" },
        "Robo del pivote — mirada arriba",
        700,
      ),
      f(
        c().map((p) =>
          p.id === "p3" ? { ...p, x: 38, y: 38 } : p.id === "p4" ? { ...p, x: 58, y: 24 } : p,
        ),
        { x: 58, y: 24, con: "p4", trazo: "pase" },
        "Primer pase vertical en 2 toques",
        700,
      ),
      f(
        c().map((p) =>
          p.id === "p3" ? { ...p, x: 38, y: 38 } :
          p.id === "p4" ? { ...p, x: 58, y: 24 } :
          p.id === "p5" ? { ...p, x: 82, y: 10 } : p,
        ),
        { x: 82, y: 10, con: "p5", trazo: "pase" },
        "El extremo rompe al carril",
        800,
      ),
      f(
        c().map((p) =>
          p.id === "p3" ? { ...p, x: 38, y: 38 } :
          p.id === "p4" ? { ...p, x: 58, y: 24 } :
          p.id === "p5" ? { ...p, x: 82, y: 10 } :
          p.id === "p6" ? { ...p, x: 90, y: 38 } : p,
        ),
        { x: 90, y: 38, con: "p6", trazo: "pase" },
        "Asistencia al delantero que acompaña",
        700,
      ),
      f(
        c().map((p) =>
          p.id === "p3" ? { ...p, x: 38, y: 38 } :
          p.id === "p4" ? { ...p, x: 58, y: 24 } :
          p.id === "p5" ? { ...p, x: 82, y: 10 } :
          p.id === "p6" ? { ...p, x: 90, y: 38 } : p,
        ),
        { x: 103, y: 34, trazo: "tiro" },
        "Remate — 5 segundos de vértigo",
        1000,
      ),
    ],
  };
}

// ---------- 8 · Contra-pressing tras pérdida ----------

function transicionDefensiva(): Animacion {
  const c = (): FichaAnim[] => [
    propia("p1", 68, 34, 10), // quien pierde
    propia("p2", 60, 28, 8),
    propia("p3", 74, 44, 9),
    propia("p4", 52, 36, 6),
    propia("p5", 44, 40, 5),
    propia("p6", 36, 30, 4),
    propia("p7", 30, 44, 2),
    rival("r1", 74, 38),
  ];
  return {
    clave: "transicion-defensiva",
    titulo: "Contra-pressing tras pérdida",
    descripcion: "Pérdida arriba: los 3 primeros saltan al portador mientras el bloque se repliega.",
    fotogramas: [
      f(c(), { x: 68, y: 34, con: "p1" }, "Pérdida propia en campo rival", 900),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 72, y: 36 } :
          p.id === "p2" ? { ...p, x: 66, y: 30 } :
          p.id === "p3" ? { ...p, x: 78, y: 42 } :
          p.id === "r1" ? { ...p, x: 74, y: 38 } : p,
        ),
        { x: 74, y: 38, con: "r1" },
        "Reacción: los 3 primeros saltan al portador",
        800,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 70, y: 36 } :
          p.id === "p2" ? { ...p, x: 64, y: 30 } :
          p.id === "p3" ? { ...p, x: 76, y: 40 } :
          p.id === "r1" ? { ...p, x: 78, y: 38 } : p,
        ),
        { x: 78, y: 38, con: "r1" },
        "Contra-pressing: cerrar la salida limpia",
        900,
      ),
      f(
        c().map((p) =>
          p.id === "p4" ? { ...p, x: 44, y: 36 } :
          p.id === "p5" ? { ...p, x: 38, y: 40 } :
          p.id === "p6" ? { ...p, x: 30, y: 28 } :
          p.id === "p7" ? { ...p, x: 26, y: 42 } : p,
        ),
        { x: 78, y: 38, con: "r1" },
        "El resto cubre el espacio por detrás",
        1000,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 74, y: 38 } :
          p.id === "p2" ? { ...p, x: 70, y: 32 } :
          p.id === "p3" ? { ...p, x: 80, y: 40 } :
          p.id === "r1" ? { ...p, x: 76, y: 38 } : p,
        ),
        { x: 76, y: 38, con: "p1" },
        "Encierro en la esquina — recuperamos arriba",
        1100,
      ),
    ],
  };
}

// ---------- 9 · Repliegue organizado ----------

function repliegue(): Animacion {
  const c = (): FichaAnim[] => [
    propia("p1", 84, 20, 11),
    propia("p2", 88, 34, 9),
    propia("p3", 82, 48, 7),
    propia("p4", 70, 28, 8),
    propia("p5", 72, 42, 6),
    propia("p6", 58, 36, 5),
    rival("r1", 56, 32),
  ];
  return {
    clave: "repliegue",
    titulo: "Repliegue organizado",
    descripcion: "Contra rival: sprint hacia el área propia y bloque recompuesto detrás del balón.",
    fotogramas: [
      f(c(), { x: 56, y: 32, con: "r1" }, "Contra rival tras pérdida alta", 900),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 56, y: 22 } :
          p.id === "p2" ? { ...p, x: 60, y: 34 } :
          p.id === "p3" ? { ...p, x: 58, y: 46 } :
          p.id === "p4" ? { ...p, x: 46, y: 30 } :
          p.id === "p5" ? { ...p, x: 48, y: 42 } :
          p.id === "p6" ? { ...p, x: 38, y: 36 } :
          p.id === "r1" ? { ...p, x: 48, y: 32 } : p,
        ),
        { x: 48, y: 32, con: "r1" },
        "Sprint hacia el área — no hacia el balón",
        1100,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 38, y: 20 } :
          p.id === "p2" ? { ...p, x: 40, y: 32 } :
          p.id === "p3" ? { ...p, x: 38, y: 44 } :
          p.id === "p4" ? { ...p, x: 30, y: 28 } :
          p.id === "p5" ? { ...p, x: 30, y: 42 } :
          p.id === "p6" ? { ...p, x: 24, y: 36 } :
          p.id === "r1" ? { ...p, x: 42, y: 34 } : p,
        ),
        { x: 42, y: 34, con: "r1" },
        "Bloque recompuesto detrás del balón",
        1100,
      ),
      f(
        c().map((p) =>
          p.id === "p2" ? { ...p, x: 30, y: 32 } :
          p.id === "p6" ? { ...p, x: 22, y: 36 } :
          p.id === "r1" ? { ...p, x: 34, y: 36 } : p,
        ),
        { x: 34, y: 36, con: "r1" },
        "Cada uno recupera su demarcación",
        1100,
      ),
    ],
  };
}

// ---------- 10 · Córner ofensivo ----------

function corner(): Animacion {
  const c = (): FichaAnim[] => [
    propia("p6", 100, 6, 7), // lanzador
    propia("p1", 88, 20, 9), // primer palo
    propia("p2", 92, 34, 5), // punto de penalti
    propia("p3", 84, 44, 4), // segundo palo
    propia("p4", 66, 52, 8), // llegador desde atrás
    propia("p5", 30, 44, 6), // pivote por si sale
    rival("r0", 100, 34),
    rival("r1", 86, 24),
    rival("r2", 90, 32),
    rival("r3", 88, 42),
    rival("r4", 84, 52),
  ];
  return {
    clave: "corner",
    titulo: "Córner ofensivo",
    descripcion: "Bloque en el punto de penalti, centro al primer palo y llegada desde atrás.",
    fotogramas: [
      f(c(), { x: 101, y: 5, con: "p6" }, "Córner — bloque en el punto de penalti", 1200),
      f(
        c().map((p) => (p.id === "p4" ? { ...p, x: 76, y: 50 } : p)),
        { x: 88, y: 28, trazo: "pase" },
        "Centro al primer palo",
        900,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 84, y: 22 } : p.id === "p4" ? { ...p, x: 82, y: 48 } : p,
        ),
        { x: 84, y: 22, con: "p1" },
        "Desmarque al primer palo",
        800,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 84, y: 22 } :
          p.id === "p2" ? { ...p, x: 94, y: 36 } :
          p.id === "p4" ? { ...p, x: 88, y: 46 } : p,
        ),
        { x: 96, y: 36, trazo: "pase" },
        "Remate de cabeza al segundo palo",
        800,
      ),
      f(
        c().map((p) =>
          p.id === "p1" ? { ...p, x: 84, y: 22 } :
          p.id === "p2" ? { ...p, x: 94, y: 36 } :
          p.id === "p4" ? { ...p, x: 92, y: 44 } : p,
        ),
        { x: 103, y: 35, trazo: "tiro" },
        "Volea a puerta",
        1000,
      ),
    ],
  };
}

// ============================================================================
// SELECCIÓN DETERMINISTA
// ============================================================================

/** Normaliza sin acentos para las reglas de palabras clave */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** djb2 — hash estable (idéntico en servidor y cliente) para variar el espejo */
function hashEstable(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function espejar(a: Animacion): Animacion {
  const flip = (p: { x: number; y: number }) => ({ ...p, x: 105 - p.x });
  return {
    ...a,
    fotogramas: a.fotogramas.map((fr) => ({
      ...fr,
      fichas: fr.fichas.map((fi) => ({ ...fi, x: 105 - fi.x })),
      balon: { ...flip(fr.balon) },
    })),
  };
}

export type EntradaAnimacion = {
  id: string;
  title: string;
  objective: string;
  phases: string[];
};

const FALLBACK_POR_FASE: Record<string, () => Animacion> = {
  OFFENSIVE: circulacion,
  DEFENSIVE: presion,
  OFF_TRANSITION: transicionOfensiva,
  DEF_TRANSITION: transicionDefensiva,
  SET_PIECE: corner,
};

/**
 * Elige la animación que ilustra la mecánica de la tarea. Determinista:
 * mismas entradas → misma plantilla y mismo espejo (SSR/CSR sin parpadeo).
 */
export function seleccionarAnimacion(t: EntradaAnimacion): Animacion {
  const texto = normalizar(`${t.title} ${t.objective} ${t.phases.join(" ")}`);
  const tiene = (...pats: string[]) => pats.some((p) => texto.includes(p));

  let base: Animacion;
  if (tiene("corner", "saque de esquina", "abp", "tiro libre")) {
    base = corner();
  } else if (tiene("rondo")) {
    base = rondo();
  } else if (tiene("presion", "pressing", "press", "asfixia", "pressing alto", "pression")) {
    base = presion();
  } else if (tiene("cobertura", "bascul", "compacta", "bloque", "lateral")) {
    base = cobertura();
  } else if (tiene("tercer hombre", "pared", "continuidad")) {
    base = tercerHombre();
  } else if (tiene("finaliz", "remate", "definition", "definicion", "gol")) {
    base = finalizacion();
  } else if (tiene("repliegue")) {
    base = repliegue();
  } else if (tiene("transicion ofensiva", "off_transition") || (tiene("transicion", "contra") && tiene("ofensiv", "ataque", "vertical"))) {
    base = transicionOfensiva();
  } else if (tiene("transicion defensiva", "def_transition", "counterpressing") || (tiene("transicion", "contra") && tiene("defensiv", "repleg", "presion tras"))) {
    base = transicionDefensiva();
  } else if (tiene("posesion", "circul", "salida", "construccion")) {
    base = circulacion();
  } else {
    const porFase = t.phases
      .map((p) => FALLBACK_POR_FASE[p])
      .find((fn) => typeof fn === "function");
    base = porFase ? porFase() : circulacion();
  }

  return hashEstable(t.id) % 2 === 1 ? espejar(base) : base;
}
