// ============================================================================
// SEED — Dataset demo de Fase 1 (idempotente: se puede ejecutar varias veces)
// ----------------------------------------------------------------------------
// Crea: club demo + usuarios por rol + biblioteca global de la Cátedra
// (subprincipios y tareas conectados por "recetas") + plantilla + partidos con
// ingesta (eventing táctico) + pulso colectivo + microciclo PROPOSED de la
// semana actual → cero pantallas en blanco desde el primer arranque.
// Ejecutar: bun prisma/seed.ts   (o `bunx prisma db seed`)
// ============================================================================
import {
  PrismaClient,
  GamePhase,
  Position,
  PlayerStatus,
  Intensity,
  Semaphore,
  TacticalEventType,
} from "@prisma/client";
import { startOfWeek } from "date-fns";
import { hashPassword } from "../src/lib/password";
import { ensurePostgresUrl } from "../src/lib/env-guard";

ensurePostgresUrl();

const prisma = new PrismaClient();

// ---------- Helpers de fechas (siempre relativas a HOY) ----------
function at(base: Date, h: number, m = 0): Date {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

async function main() {
  console.log("SEED: iniciando…");

  // ---------- 1) Club y usuarios ----------
  const club = await prisma.club.upsert({
    where: { slug: "cf-metodo" },
    update: {},
    create: { name: "Club Fútbol Método", slug: "cf-metodo" },
  });

  const mister = await prisma.user.upsert({
    where: { email: "mister@cfmetodo.es" },
    update: {},
    create: {
      email: "mister@cfmetodo.es",
      name: "Míster García",
      passwordHash: hashPassword("metodo2025"),
      role: "COACH_ADMIN",
      clubId: club.id,
    },
  });

  const analista = await prisma.user.upsert({
    where: { email: "analista@cfmetodo.es" },
    update: {},
    create: {
      email: "analista@cfmetodo.es",
      name: "Laura Ruiz · Analista",
      passwordHash: hashPassword("metodo2025"),
      role: "ANALYST",
      clubId: club.id,
    },
  });

  // PLATFORM_ADMIN (sin club): gestiona el contenido GLOBAL de la Cátedra
  // desde /dashboard/catedra. clubId = null por diseño.
  const plataforma = await prisma.user.upsert({
    where: { email: "plataforma@ecosystem.es" },
    update: {},
    create: {
      email: "plataforma@ecosystem.es",
      name: "Dirección Cátedra",
      passwordHash: hashPassword("metodo2025"),
      role: "PLATFORM_ADMIN",
      clubId: null,
    },
  });
  console.log("SEED: club + usuarios OK (míster, analista, plataforma)");

  // ---------- 2) Temporada y equipos ----------
  const season = await prisma.season.upsert({
    where: { clubId_name: { clubId: club.id, name: "2025/26" } },
    update: {},
    create: {
      clubId: club.id,
      name: "2025/26",
      startDate: new Date("2025-07-01"),
      endDate: new Date("2026-06-30"),
      isActive: true,
    },
  });

  const primerEquipo = await prisma.team.upsert({
    where: { seasonId_name: { seasonId: season.id, name: "Primer Equipo" } },
    update: {},
    create: { clubId: club.id, seasonId: season.id, name: "Primer Equipo", category: "Senior · 3ª División" },
  });

  const juvenilA = await prisma.team.upsert({
    where: { seasonId_name: { seasonId: season.id, name: "Juvenil A" } },
    update: {},
    create: { clubId: club.id, seasonId: season.id, name: "Juvenil A", category: "Juvenil Preferente" },
  });
  console.log("SEED: temporada + equipos OK");

  // ---------- 3) Plantilla (Pilar 2) ----------
  const playersPrimerEquipo: Array<{
    shirt: number; first: string; last: string; pos: Position;
    poly: Position[]; tec: number; tac: number; fis: number;
    status?: PlayerStatus; note?: string;
  }> = [
    { shirt: 1, first: "Iker", last: "Sanz", pos: "GK", poly: [], tec: 4, tac: 3, fis: 4 },
    { shirt: 13, first: "Adrián", last: "Fuster", pos: "GK", poly: [], tec: 3, tac: 3, fis: 3 },
    { shirt: 4, first: "Mario", last: "Domínguez", pos: "CB", poly: ["DM"], tec: 3, tac: 4, fis: 4 },
    { shirt: 5, first: "Hugo", last: "Beltrán", pos: "CB", poly: ["LB"], tec: 3, tac: 4, fis: 3, status: "INJURED", note: "molestias isquios izq." },
    { shirt: 3, first: "Pablo", last: "Ferrer", pos: "LB", poly: ["LWB", "CM"], tec: 3, tac: 3, fis: 4 },
    { shirt: 2, first: "Raúl", last: "Ortega", pos: "RB", poly: ["RWB"], tec: 3, tac: 3, fis: 4 },
    { shirt: 6, first: "Jorge", last: "Palencia", pos: "DM", poly: ["CM", "CB"], tec: 4, tac: 5, fis: 3 },
    { shirt: 8, first: "Dani", last: "Sevilla", pos: "CM", poly: ["AM", "DM"], tec: 4, tac: 4, fis: 4 },
    { shirt: 10, first: "Iván", last: "Carrión", pos: "AM", poly: ["SS", "LW"], tec: 5, tac: 4, fis: 3 },
    { shirt: 7, first: "Nico", last: "Alcázar", pos: "RM", poly: ["RW", "CM"], tec: 4, tac: 3, fis: 4 },
    { shirt: 11, first: "Luis", last: "Bermejo", pos: "LM", poly: ["LW", "LB"], tec: 3, tac: 3, fis: 5 },
    { shirt: 20, first: "Carlos", last: "Mínguez", pos: "LW", poly: ["SS", "RM"], tec: 4, tac: 3, fis: 4 },
    { shirt: 17, first: "Álvaro", last: "Cuesta", pos: "RW", poly: ["LM", "CF"], tec: 4, tac: 3, fis: 4 },
    { shirt: 9, first: "Sergio", last: "Vidal", pos: "CF", poly: ["SS"], tec: 4, tac: 4, fis: 4, status: "RETURNING", note: "reposición tras rotura fibular" },
    { shirt: 19, first: "Jony", last: "Aguirre", pos: "SS", poly: ["AM", "LW"], tec: 4, tac: 3, fis: 3 },
    { shirt: 21, first: "Óscar", last: "Prats", pos: "CM", poly: ["DM", "LB"], tec: 3, tac: 4, fis: 3 },
  ];

  for (const p of playersPrimerEquipo) {
    await prisma.player.upsert({
      where: { teamId_shirtNumber: { teamId: primerEquipo.id, shirtNumber: p.shirt } },
      update: {},
      create: {
        clubId: club.id,
        teamId: primerEquipo.id,
        firstName: p.first,
        lastName: p.last,
        shirtNumber: p.shirt,
        mainPosition: p.pos,
        secondaryPositions: p.poly,
        technicalRating: p.tec,
        tacticalRating: p.tac,
        physicalRating: p.fis,
        status: p.status ?? "AVAILABLE",
        statusNote: p.note,
      },
    });
  }

  const playersJuvenil = [
    { shirt: 1, first: "Marc", last: "Aliaga", pos: "GK" as Position },
    { shirt: 2, first: "Eric", last: "Valls", pos: "CB" as Position },
    { shirt: 5, first: "Pol", last: "Rueda", pos: "DM" as Position },
    { shirt: 7, first: "Aitor", last: "Cano", pos: "RM" as Position },
    { shirt: 9, first: "Ibrahim", last: "Diallo", pos: "CF" as Position },
    { shirt: 10, first: "Joel", last: "Matas", pos: "AM" as Position },
    { shirt: 6, first: "Adri", last: "Gil", pos: "CM" as Position },
    { shirt: 3, first: "Jan", last: "Torres", pos: "LB" as Position },
  ];
  for (const p of playersJuvenil) {
    await prisma.player.upsert({
      where: { teamId_shirtNumber: { teamId: juvenilA.id, shirtNumber: p.shirt } },
      update: {},
      create: {
        clubId: club.id,
        teamId: juvenilA.id,
        firstName: p.first,
        lastName: p.last,
        shirtNumber: p.shirt,
        mainPosition: p.pos,
        secondaryPositions: [],
      },
    });
  }
  console.log("SEED: plantillas OK");

  // ---------- 4) Biblioteca de la Cátedra (Pilar 1) — contenido global ----------
  type SPSeed = { key: string; phase: GamePhase; name: string; desc: string };
  const subPrinciples: SPSeed[] = [
    { key: "salida-portero", phase: "OFFENSIVE", name: "Salida de balón desde el portero", desc: "Construcción 4+3 superando la presión rival en el primer tercio." },
    { key: "progresion-carril", phase: "OFFENSIVE", name: "Progresión por el carril interior", desc: "Atacar entre líneas para llegar en condiciones superiores." },
    { key: "entre-lineas", phase: "OFFENSIVE", name: "Ocupación de espacios entre líneas", desc: "Movilidad de interiores y extremos para recibir entre líneas." },
    { key: "presion-alta", phase: "DEFENSIVE", name: "Presión alta sincronizada", desc: "Presión coordinada al rival tras pase atrás o control flawed." },
    { key: "bloque-medio", phase: "DEFENSIVE", name: "Bloque medio: basculaciones", desc: "Compactación 12-25 m con basculaciones al lado del balón." },
    { key: "area-centros", phase: "DEFENSIVE", name: "Defensa del área: centros laterales", desc: "Gestión de espacios de área ante centros desde el carril." },
    { key: "reaccion-perdida", phase: "OFF_TRANSITION", name: "Reacción tras pérdida en 3/4", desc: "Presión inmediata al portador en los 5 primeros segundos." },
    { key: "verticalidad-5s", phase: "OFF_TRANSITION", name: "Verticalidad en 5 segundos", desc: "Primer pase de progresión tras recuperación en campo propio." },
    { key: "counterpressing", phase: "DEF_TRANSITION", name: "Counter-pressing: cierre inmediato", desc: "Cierre de espacios de ataque directo tras perder en zona avanzada." },
    { key: "retraso-10s", phase: "DEF_TRANSITION", name: "Retraso y organización en 10 segundos", desc: "Vuelta a estructura defensiva si no hay counter-press posible." },
    { key: "esquina-zonal", phase: "SET_PIECE", name: "Defensa de córner zonal", desc: "Cobertura de zonas con asignación mixta en el área pequeña." },
    { key: "corner-ataque", phase: "SET_PIECE", name: "Ataque de córner: bloque especial", desc: "Movimientos de bloqueo y llegada por sorpresa al primer palo." },
  ];

  const spId: Record<string, string> = {};
  for (const sp of subPrinciples) {
    const existing = await prisma.subPrinciple.findFirst({
      where: { clubId: null, name: sp.name, phase: sp.phase },
    });
    const row =
      existing ??
      (await prisma.subPrinciple.create({
        data: { clubId: null, phase: sp.phase, name: sp.name, description: sp.desc, order: subPrinciples.indexOf(sp) },
      }));
    spId[sp.key] = row.id;
  }

  type TaskSeed = {
    title: string; objective: string; phases: GamePhase[];
    len: number; wid: number; pMin: number; pMax?: number; dur: number; reps: string;
    intensity: Intensity; rules: string[]; points: string[]; mats: string[];
    links: Array<{ sp: string; rel: number; note: string }>;
  };

  const tasks: TaskSeed[] = [
    {
      title: "Rondo 6v2 con salida tras 8 pases",
      objective: "Consolidar circulación rápida bajo presión y reacción al cambio de rol.",
      phases: ["OFFENSIVE", "OFF_TRANSITION"], len: 14, wid: 14, pMin: 8, dur: 20, reps: "4 series x 4'",
      intensity: "MEDIUM",
      rules: ["Al robar, entra quien dio el pase perdido", "8 pases seguidos = punto + cambio de defensores"],
      points: ["Ángulos de pase superiores a 45°", "Primer toque orientado", "Presión agresiva al balón"],
      mats: ["Conos", "4 petos rojos"],
      links: [{ sp: "reaccion-perdida", rel: 3, note: "Uso general: reacción al cambio de rol en espacio pequeño." }, { sp: "salida-portero", rel: 1, note: "Calentamiento previo a tareas de construcción." }],
    },
    {
      title: "Salida de balón 4+3 desde el portero bajo presión media",
      objective: "Superar la presión rival en el primer tercio y progresar en menos de 3 pases.",
      phases: ["OFFENSIVE", "OFF_TRANSITION"], len: 45, wid: 32, pMin: 11, dur: 30, reps: "3 bloques x 8'",
      intensity: "MEDIUM",
      rules: ["Rival presiona con bloque medio-bajo", "Pase al interior = doble punto", "El portero siempre es opción de apoyo"],
      points: ["Anchura máxima del carril de CB", "Interiores caen entre líneas", "Tercer hombre para romper línea"],
      mats: ["Conos", "Petos", "2 mini-porterías"],
      links: [{ sp: "salida-portero", rel: 3, note: "Tarea núcleo para corregir pérdidas en construcción." }, { sp: "progresion-carril", rel: 2, note: "Progresión posterior tras superar la primera línea." }],
    },
    {
      title: "Posesión 6v6+3 con zonas de progresión",
      objective: "Progresar entre zonas con posesión de calidad y ocupación posicional.",
      phases: ["OFFENSIVE"], len: 60, wid: 45, pMin: 15, dur: 25, reps: "3 bloques x 7'",
      intensity: "MEDIUM",
      rules: ["3 comodines siempre con el equipo en posesión", "Cruzar zona = 1 punto, remate = 3"],
      points: ["Duplicar posiciones en banda de pase", "Cambios de orientación rápidos", "Pase interior entre líneas"],
      mats: ["Conos", "Petos 3 colores"],
      links: [{ sp: "entre-lineas", rel: 3, note: "Recepción entre líneas como criterio de progresión." }, { sp: "progresion-carril", rel: 2, note: "" }],
    },
    {
      title: "Partido 8v8 con reacción tras pérdida de 5 segundos",
      objective: "Instalar la reacción coordinada tras pérdida en formato global.",
      phases: ["OFF_TRANSITION", "DEFENSIVE"], len: 68, wid: 50, pMin: 16, dur: 30, reps: "4 x 6'",
      intensity: "HIGH",
      rules: ["Tras pérdida: presión inmediata 5s para robar", "Robo en 5s = gol vale doble", "Si no se roba, replegar a bloque"],
      points: ["Primer perseguidor al portador", "Cobertura de pase interior", "Comunicación del portero"],
      mats: ["Petos 2 colores", "Conos"],
      links: [{ sp: "reaccion-perdida", rel: 3, note: "Tarea global para instalar el automatismo del 5s." }, { sp: "counterpressing", rel: 2, note: "" }],
    },
    {
      title: "Transiciones 4v4+2: reacción de 5 segundos",
      objective: "Tras perder, presionar en 5s; tras robar, atacar la verticalidad.",
      phases: ["OFF_TRANSITION", "DEF_TRANSITION"], len: 40, wid: 30, pMin: 10, dur: 24, reps: "4 series x 5'",
      intensity: "HIGH",
      rules: ["Dos miniporterías por equipo", "Gol tras robo en menos de 8s = doble"],
      points: ["Cambiar mentalidad de poseedor a defensor", "Primer pase de contra hacia el frente"],
      mats: ["Miniporterías", "Petos"],
      links: [{ sp: "reaccion-perdida", rel: 3, note: "Formato reducido: máxima repetición del gesto." }, { sp: "verticalidad-5s", rel: 2, note: "" }],
    },
    {
      title: "Presión alta sincronizada 7v7",
      objective: "Presionar el primer tercio rival con sincronización de líneas.",
      phases: ["DEFENSIVE", "DEF_TRANSITION"], len: 60, wid: 45, pMin: 14, dur: 28, reps: "3 x 8'",
      intensity: "HIGH",
      rules: ["Rival saca desde portero obligado", "Robo alto = gol vale doble", "Fuera de juego activo"],
      points: ["Gatillo de presión: pase atrás o control defectuoso", "Cubrir el pase diagonal", "Línea defensiva alta y agresiva"],
      mats: ["Petos 2 colores", "Conos"],
      links: [{ sp: "presion-alta", rel: 3, note: "Tarea núcleo de presión alta." }, { sp: "retraso-10s", rel: 1, note: "" }],
    },
    {
      title: "Bloque medio 6v6 con basculaciones",
      objective: "Compactar el bloque y bascular al lado del balón sin desorden.",
      phases: ["DEFENSIVE"], len: 55, wid: 40, pMin: 12, dur: 25, reps: "3 x 7'",
      intensity: "MEDIUM",
      rules: ["Rival circula sin rematar (progresión: remate libre)", "Intercepción = punto"],
      points: ["Distancias 10-12 m entre líneas", "Sombras al lado del balón", "Comunicación constante del pivote"],
      mats: ["Conos", "Petos"],
      links: [{ sp: "bloque-medio", rel: 3, note: "" }, { sp: "area-centros", rel: 1, note: "" }],
    },
    {
      title: "Retraso y reorganización defensiva 8v8+P en 10 segundos",
      objective: "Volver a estructura defensiva organizada cuando no es posible el counter-press.",
      phases: ["DEF_TRANSITION", "DEFENSIVE"], len: 70, wid: 52, pMin: 17, dur: 28, reps: "4 x 6'",
      intensity: "MEDIUM",
      rules: ["Ataque directo del rival tras perder", "Organizar en 10s = punto defensivo"],
      points: ["Corrida de retorno del más cercano", "Pivote ocupa la línea de pase central", "Porterordena líneas"],
      mats: ["Petos 2 colores", "Conos"],
      links: [{ sp: "retraso-10s", rel: 3, note: "" }, { sp: "bloque-medio", rel: 2, note: "Conexión retraso→bloque." }],
    },
    {
      title: "Regeneración: rondos suaves + movilidad",
      objective: "Recuperar al grupo tras el esfuerzo del partido con intensidad controlada.",
      phases: ["OFFENSIVE"], len: 16, wid: 16, pMin: 8, dur: 40, reps: "Bloque único",
      intensity: "LOW",
      rules: ["Sin contacto", "Máximo 2 toques en rondos"],
      points: ["Toque orientado relajado", "Movilidad articular entre series"],
      mats: ["Conos", "Pelotas"],
      links: [{ sp: "reaccion-perdida", rel: 1, note: "Volumen técnico suave, sin objetivo táctico." }],
    },
    {
      title: "Activación pre-partido: velocidad de pies + posesión 5v2",
      objective: "Activación neuromuscular y automatismos de posesión antes del partido.",
      phases: ["OFFENSIVE"], len: 20, wid: 20, pMin: 7, dur: 35, reps: "Circuito + 3 rondos",
      intensity: "LOW",
      rules: ["Dosis cortas y máxima calidad"],
      points: ["Escalera de velocidad", "Rondo al primer toque"],
      mats: ["Escalera", "Conos", "Petos"],
      links: [{ sp: "entre-lineas", rel: 1, note: "Toque y ángulo, sin carga táctica." }],
    },
    {
      title: "Ataque de córner: bloque especial 8v8",
      objective: "Instalar movimientos de bloqueo y llegadas por sorpresa en córner ofensivo.",
      phases: ["SET_PIECE"], len: 40, wid: 30, pMin: 16, dur: 25, reps: "12 lanzamientos",
      intensity: "MEDIUM",
      rules: ["2 variantes: primer palo y golpe de toque al segundo"],
      points: ["Bloqueo legal", "Timing de llegadas", "Cobertura defensiva tras pérdida"],
      mats: ["Conos", "Petos 2 colores"],
      links: [{ sp: "corner-ataque", rel: 3, note: "" }],
    },
    {
      title: "Defensa del área: centros laterales 6v6",
      objective: "Gestionar centros desde el carril: despejes, primer palo y segundo poste.",
      phases: ["DEFENSIVE", "SET_PIECE"], len: 35, wid: 30, pMin: 12, dur: 22, reps: "3 x 6'",
      intensity: "MEDIUM",
      rules: ["Centro desde zona designada", "Despeje fuera del área = punto"],
      points: ["Marcaje al frente del atacante", "Duelo aéreo agresivo en primer palo"],
      mats: ["Conos", "Petos"],
      links: [{ sp: "area-centros", rel: 3, note: "" }, { sp: "esquina-zonal", rel: 2, note: "" }],
    },
  ];

  const taskIdByTitle: Record<string, string> = {};
  for (const t of tasks) {
    const existing = await prisma.task.findFirst({ where: { clubId: null, title: t.title } });
    const row =
      existing ??
      (await prisma.task.create({
        data: {
          clubId: null,
          title: t.title,
          objective: t.objective,
          phases: t.phases,
          spaceLengthM: t.len,
          spaceWidthM: t.wid,
          playersMin: t.pMin,
          playersMax: t.pMax,
          durationMin: t.dur,
          repetitions: t.reps,
          intensity: t.intensity,
          rulesOfProvocation: t.rules,
          coachingPoints: t.points,
          materials: t.mats,
          createdById: mister.id,
        },
      }));
    taskIdByTitle[t.title] = row.id;
    for (const link of t.links) {
      await prisma.taskSubPrinciple.upsert({
        where: { taskId_subPrincipleId: { taskId: row.id, subPrincipleId: spId[link.sp] } },
        update: { relevance: link.rel, usageNote: link.note },
        create: { taskId: row.id, subPrincipleId: spId[link.sp], relevance: link.rel, usageNote: link.note },
      });
    }
  }
  console.log("SEED: biblioteca Cátedra OK (12 subprincipios, 12 tareas)");

  // ---------- 5) Partidos e ingesta (Pilar 3) ----------
  const now = new Date();
  const daysSinceLastSat = ((now.getDay() - 6 + 7) % 7) || 7;
  const lastSat = new Date(now);
  lastSat.setDate(now.getDate() - daysSinceLastSat);
  const twoWeeksAgo = new Date(lastSat);
  twoWeeksAgo.setDate(lastSat.getDate() - 7);
  const nextSat = new Date(lastSat);
  nextSat.setDate(lastSat.getDate() + 7);

  const matchLast = await prisma.match.upsert({
    where: { id: `${primerEquipo.id}:jornada10` },
    update: { status: "ANALYZED", goalsFor: 2, goalsAgainst: 1 },
    create: {
      id: `${primerEquipo.id}:jornada10`,
      clubId: club.id,
      teamId: primerEquipo.id,
      opponent: "CD Almansa",
      competition: "Liga · Jornada 10",
      isHome: true,
      kickoffAt: at(lastSat, 17),
      goalsFor: 2,
      goalsAgainst: 1,
      status: "ANALYZED",
    },
  });

  const matchPrev = await prisma.match.upsert({
    where: { id: `${primerEquipo.id}:jornada9` },
    update: { status: "PLAYED", goalsFor: 3, goalsAgainst: 0 },
    create: {
      id: `${primerEquipo.id}:jornada9`,
      clubId: club.id,
      teamId: primerEquipo.id,
      opponent: "UD Caudete",
      competition: "Liga · Jornada 9",
      isHome: false,
      kickoffAt: at(twoWeeksAgo, 18),
      goalsFor: 3,
      goalsAgainst: 0,
      status: "PLAYED",
    },
  });

  await prisma.match.upsert({
    where: { id: `${primerEquipo.id}:jornada11` },
    update: {},
    create: {
      id: `${primerEquipo.id}:jornada11`,
      clubId: club.id,
      teamId: primerEquipo.id,
      opponent: "Atlético Torrent",
      competition: "Liga · Jornada 11",
      isHome: true,
      kickoffAt: at(nextSat, 17, 30),
      status: "SCHEDULED",
    },
  });

  // Ingesta del último partido (1:1)
  const report = await prisma.matchReport.upsert({
    where: { matchId: matchLast.id },
    update: {},
    create: {
      matchId: matchLast.id,
      createdById: analista.id,
      sensation: "AMBER",
      perceivedLoad: 7,
      collectiveAttitude: 6,
      tacticalExecution: 4,
      notes: "Buen minuto final tras ir perdiendo. Salidas de atrás sufridas todo el partido.",
    },
  });

  const playersPE = await prisma.player.findMany({ where: { teamId: primerEquipo.id } });
  const byNumber = (n: number) => playersPE.find((p) => p.shirtNumber === n)!;

  // Eventing táctico: pérdidas en construcción (lado izquierdo) → evidencia del motor
  const losses = [
    [18, 22, 12, "CB"], [26, 15, 21, "LB"], [31, 30, 19, "DM"],
    [22, 38, 34, "LB"], [15, 42, 27, "GK"], [29, 26, 41, "CM"],
    [24, 33, 55, "LB"], [33, 19, 63, "CB"],
  ];
  const eventsData: Array<{
    playerId: string | null; minute: number | null; x: number; y: number; type: TacticalEventType;
  }> = [
    ...losses.map(([minute, x, y, posChar]) => ({
      playerId: posChar === "GK" ? byNumber(1).id : posChar === "CB" ? byNumber(4).id : posChar === "LB" ? byNumber(3).id : posChar === "DM" ? byNumber(6).id : byNumber(8).id,
      minute: minute as number,
      x: x as number,
      y: y as number,
      type: "BALL_LOSS" as TacticalEventType,
    })),
    { playerId: byNumber(6).id, minute: 8, x: 45, y: 50, type: "BALL_RECOVERY" },
    { playerId: byNumber(11).id, minute: 22, x: 58, y: 32, type: "BALL_RECOVERY" },
    { playerId: byNumber(7).id, minute: 47, x: 62, y: 68, type: "BALL_RECOVERY" },
    { playerId: byNumber(17).id, minute: 31, x: 71, y: 74, type: "GOAL_FOR" },
    { playerId: byNumber(9).id, minute: 89, x: 76, y: 46, type: "GOAL_FOR" },
    { playerId: null, minute: 12, x: 88, y: 40, type: "GOAL_AGAINST" },
    { playerId: byNumber(3).id, minute: 15, x: 55, y: 20, type: "POSITIVE_DUEL" },
    { playerId: byNumber(4).id, minute: 28, x: 48, y: 18, type: "POSITIVE_DUEL" },
    { playerId: byNumber(2).id, minute: 36, x: 52, y: 82, type: "POSITIVE_DUEL" },
    { playerId: byNumber(3).id, minute: 24, x: 61, y: 24, type: "NEGATIVE_DUEL" },
    { playerId: byNumber(21).id, minute: 33, x: 44, y: 55, type: "NEGATIVE_DUEL" },
    { playerId: byNumber(11).id, minute: 40, x: 66, y: 20, type: "NEGATIVE_DUEL" },
    { playerId: byNumber(2).id, minute: 52, x: 59, y: 78, type: "NEGATIVE_DUEL" },
    { playerId: byNumber(8).id, minute: 58, x: 38, y: 48, type: "NEGATIVE_DUEL" },
    { playerId: byNumber(20).id, minute: 61, x: 30, y: 62, type: "NEGATIVE_DUEL" },
    { playerId: byNumber(19).id, minute: 66, x: 52, y: 40, type: "NEGATIVE_DUEL" },
    { playerId: byNumber(9).id, minute: 85, x: 80, y: 45, type: "ATTEMPTED_SHOT" },
    { playerId: null, minute: 74, x: 84, y: 55, type: "OPPONENT_CHANCE" },
    { playerId: byNumber(5).id, minute: 0, x: 0, y: 0, type: "CUSTOM" }, // nota: lesión
  ];

  const existingEvents = await prisma.tacticalEvent.count({ where: { reportId: report.id } });
  if (existingEvents === 0) {
    await prisma.tacticalEvent.createMany({
      data: eventsData.map((e) => ({
        reportId: report.id,
        playerId: e.type === "CUSTOM" ? null : e.playerId,
        minute: e.minute,
        x: e.x,
        y: e.y,
        type: e.type,
      })),
    });
  }

  // Cuaderno de notas individual
  const notesSeed = [
    { shirt: 3, flag: "GREEN" as Semaphore, note: "Gran intensidad al press y llegadas al área." },
    { shirt: 6, flag: "AMBER" as Semaphore, note: "Frenó mejor en el segundo tiempo." },
    { shirt: 9, flag: "GREEN" as Semaphore, note: "Primer partido tras lesión: 20 minutos con gol." },
    { shirt: 8, flag: "RED" as Semaphore, note: "Desconectado en salida; dos pérdidas evitables." },
    { shirt: 1, flag: "AMBER" as Semaphore, note: "Dudó con los pies ante presión. Trabajar salida." },
  ];
  for (const n of notesSeed) {
    await prisma.playerMatchNote.upsert({
      where: { reportId_playerId: { reportId: report.id, playerId: byNumber(n.shirt).id } },
      update: {},
      create: { reportId: report.id, playerId: byNumber(n.shirt).id, flag: n.flag, note: n.note },
    });
  }
  console.log("SEED: partidos + ingesta OK (21 eventos tácticos, 5 notas)");

  // ---------- 6) Pulso colectivo de esta semana ----------
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  await prisma.teamPulse.upsert({
    where: { teamId_date: { teamId: primerEquipo.id, date: monday } },
    update: { moraleScore: 6, fatigueScore: 7, resultsStreak: 2 },
    create: {
      clubId: club.id,
      teamId: primerEquipo.id,
      date: monday,
      moraleScore: 6,
      fatigueScore: 7,
      resultsStreak: 2,
      notes: "Grupo respondedor tras dos victorias, pero con carga acumulada de la semana doble.",
      capturedById: mister.id,
    },
  });
  console.log("SEED: pulso colectivo OK");

  // ---------- 7) Microciclo PROPOSED de esta semana (cero pantallas en blanco) ----------
  const existingCycle = await prisma.microcycle.findUnique({
    where: { teamId_weekStart: { teamId: primerEquipo.id, weekStart: monday } },
    include: { issues: true },
  });

  if (existingCycle) {
    console.log("SEED: microciclo de esta semana ya existe — no se toca");
  } else {
    const sessionDate = (offset: number) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + offset);
      return at(d, 10, 30);
    };

    // 7.1) Microciclo
    const cycle = await prisma.microcycle.create({
      data: {
        clubId: club.id,
        teamId: primerEquipo.id,
        weekStart: monday,
        status: "PROPOSED",
        tacticalDirectives: [
          "Salida de balón limpia desde atrás bajo presión media",
          "Reacción tras pérdida: cierre en 5 segundos",
        ],
        methodologicalApproach: "Analítico-inductivo por proximidad, progresión a tareas globales",
        diagnosisSummary:
          "El sábado sufrimos en construcción (8 pérdidas en el 1/3 propio, mayoría por la izquierda) y el grupo llega con fatiga 7/10 tras la semana doble. Prioridad: limpiar la salida con intensidad controlada y reactivar la reacción tras pérdida.",
        engineVersion: "v0.1-heuristic",
        analyzedMatches: { create: [{ matchId: matchLast.id }] },
      },
    });

    // 7.2) Diagnóstico estructurado
    const issueTactical = await prisma.diagnosisIssue.create({
      data: {
        microcycleId: cycle.id,
        subPrincipleId: spId["reaccion-perdida"],
        phase: "OFF_TRANSITION",
        kind: "TACTICAL",
        severity: 4,
        evidence: "8 pérdidas en construcción (1/3 propio), 5 por el carril izquierdo",
        metric: { totalLosses: 8, buildUpLosses: 8, leftSide: 5 },
      },
    });

    const issuePhysical = await prisma.diagnosisIssue.create({
      data: {
        microcycleId: cycle.id,
        kind: "PHYSICAL",
        severity: 3,
        evidence: "Fatiga grupal acumulada 7/10 — controlar la carga de la semana",
        metric: { fatigueScore: 7 },
      },
    });

    // Sesiones y tareas prescritas
    const sMD1 = await prisma.session.create({
      data: {
        microcycleId: cycle.id,
        date: sessionDate(1),
        label: "MD+1",
        objective: "Regeneración y asimilación del esfuerzo del partido",
        durationMin: 50,
      },
    });
    await prisma.sessionTask.create({
      data: {
        sessionId: sMD1.id,
        taskId: taskIdByTitle["Regeneración: rondos suaves + movilidad"],
        order: 1,
        durationMin: 40,
        rationale: "Fatiga 7/10: intensidad controlada para asimilar el esfuerzo del sábado.",
        prescribedIssueId: issuePhysical.id,
      },
    });

    const sMD3 = await prisma.session.create({
      data: {
        microcycleId: cycle.id,
        date: sessionDate(2),
        label: "MD-3",
        objective: "Sesión principal: salida limpia + reacción tras pérdida",
        durationMin: 80,
      },
    });
    await prisma.sessionTask.create({
      data: {
        sessionId: sMD3.id,
        taskId: taskIdByTitle["Salida de balón 4+3 desde el portero bajo presión media"],
        order: 1,
        durationMin: 30,
        rationale: "Entra por: 8 pérdidas en construcción. Tarea núcleo de salida bajo presión, anchura de CB y tercer hombre.",
        prescribedIssueId: issueTactical.id,
      },
    });
    await prisma.sessionTask.create({
      data: {
        sessionId: sMD3.id,
        taskId: taskIdByTitle["Transiciones 4v4+2: reacción de 5 segundos"],
        order: 2,
        durationMin: 24,
        rationale: "Repite el gesto de presión tras pérdida en formato reducido: máxima repetición, fatiga controlada.",
      },
    });

    const sMD2 = await prisma.session.create({
      data: {
        microcycleId: cycle.id,
        date: sessionDate(3),
        label: "MD-2",
        objective: "Consolidación + preparación del plan de partido",
        durationMin: 70,
      },
    });
    await prisma.sessionTask.create({
      data: {
        sessionId: sMD2.id,
        taskId: taskIdByTitle["Partido 8v8 con reacción tras pérdida de 5 segundos"],
        order: 1,
        durationMin: 30,
        rationale: "Automatismo del 5s en formato global antes del partido, con dosis alta pero dirigida.",
      },
    });

    const sMD1pre = await prisma.session.create({
      data: {
        microcycleId: cycle.id,
        date: sessionDate(4),
        label: "MD-1",
        objective: "Activación pre-partido: velocidad y automatismos",
        durationMin: 45,
      },
    });
    await prisma.sessionTask.create({
      data: {
        sessionId: sMD1pre.id,
        taskId: taskIdByTitle["Activación pre-partido: velocidad de pies + posesión 5v2"],
        order: 1,
        durationMin: 35,
        rationale: "Activación neuromuscular previa al partido.",
      },
    });

    console.log("SEED: microciclo PROPOSED cocinado (4 sesiones, 5 tareas, 2 issues)");
  }

  console.log("SEED: completo");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("SEED error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
