"use client";

// ============================================================================
// MODO COMPACTO & NO-SCROLL — Biblioteca · Plantilla · Partidos
// ----------------------------------------------------------------------------
// Petición del míster (mock adjunto en el chat): vista de banquillo oscura,
// tipo terminal, sin scroll de página — cada pestaña rota dentro de su panel.
// Acordeones por FASE (Biblioteca) y por POSICIÓN (Plantilla), búsqueda
// instantánea y mini-ficha de tarea a un toque con su VÍDEO REAL.
// Datos 100% vivos: llega del RSC (page.tsx) — nada pintado a mano.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, Plus, Search } from "lucide-react";
import { FIELD_ZONES } from "@/lib/field-zone";
import { acceptPlan, ensureWeeklyProposal } from "@/app/dashboard/today/actions";

// ---------- Tipos que viajan del RSC ----------

export type CompactoTask = {
  id: string;
  title: string;
  objective: string;
  phases: string[];
  playersMin: number;
  playersMax: number | null;
  durationMin: number;
  intensity: string;
  fieldZoneLabel: string | null;
  videoUrl: string | null;
  spaceLengthM: number | null;
  spaceWidthM: number | null;
  isCatedra: boolean;
};

export type CompactoPlayer = {
  id: string;
  name: string;
  number: number | null;
  position: string;
};

export type CompactoMatch = {
  id: string;
  opponent: string;
  competition: string | null;
  isHome: boolean;
  kickoffAt: string;
  goalsFor: number | null;
  goalsAgainst: number | null;
  played: boolean;
};

// ---------- Pilar 4 · Módulo HOY (microciclo semanal conectado con diagnóstico y rival) ----------

export type CompactoHoyTask = {
  order: number;
  title: string;
  objective: string;
  intensity: string;
  durationMin: number | null;
  playersMin: number;
  playersMax: number | null;
  spaceLengthM: number | null;
  spaceWidthM: number | null;
  rationale: string | null;
  corrige: string | null;
  videoUrl: string | null;
};

export type CompactoHoySession = {
  id: string;
  label: string;
  dateIso: string;
  objective: string | null;
  durationMin: number | null;
  tasks: CompactoHoyTask[];
};

export type CompactoHoyIssue = {
  kind: string;
  phase: string | null;
  severity: number;
  evidence: string;
  subPrinciple: string | null;
};

export type CompactoAudit = {
  version: string;
  trigger: string;
  prescriptions: Array<{
    taskTitle: string;
    sessionLabel: string | null;
    rationale: string;
    relevance: number | null;
  }>;
  discarded: Array<{ taskTitle: string; reason: string }>;
};

export type CompactoHoy = {
  weekStartIso: string;
  microcycleId: string;
  status: string | null;
  engineVersion: string | null;
  tacticalDirectives: string[];
  diagnosisSummary: string | null;
  issues: CompactoHoyIssue[];
  sessions: CompactoHoySession[];
  audit: CompactoAudit | null;
};

export type CompactoData = {
  hoy: CompactoHoy | null;
  pulse: { morale: number; fatigue: number; streak: number | null } | null;
  lastMatch: { opponent: string; isHome: boolean; goalsFor: number; goalsAgainst: number } | null;
  nextMatch: { opponent: string; isHome: boolean; kickoffIso: string } | null;
  todayIso: string;
  tasks: CompactoTask[];
  players: CompactoPlayer[];
  matches: CompactoMatch[];
  teamName: string;
};

// ---------- Agrupación de posiciones (códigos estándar + fútbol base) ----------

const POS_GROUP_LABEL: Record<string, string> = {
  GK: "🧤 Porteros (GK)",
  DEF: "🛡️ Defensas",
  MID: "⚙️ Centrocampistas",
  FWD: "⚡ Delanteros",
  OTROS: "• Otros / polivalente",
};

const DEF_CODES = ["CB", "LCB", "RCB", "LB", "RB", "LWB", "RWB", "WB", "CD", "LD", "LI"];
const MID_CODES = ["DM", "CDM", "CM", "LCM", "RCM", "MDM", "MI", "MD", "AM", "CAM", "ACM", "MC"];
const FWD_CODES = ["LW", "RW", "ST", "CF", "LF", "RF", "SS", "LWS", "RWS", "DC", "EI", "ED", "SD"];

function posGroup(p: string): keyof typeof POS_GROUP_LABEL {
  const s = p.trim().toUpperCase();
  if (s === "GK" || s === "PT" || s === "POR" || /PORT/.test(s)) return "GK";
  if (DEF_CODES.includes(s)) return "DEF";
  if (MID_CODES.includes(s)) return "MID";
  if (FWD_CODES.includes(s)) return "FWD";
  if (/DEF|CENTRO|LATERAL|ZAG|CARRILERO/.test(s)) return "DEF";
  if (/MED|PIVOT|INTERIOR/.test(s)) return "MID";
  if (/DEL|EXT|ESTREM|DELANT|PUNTA/.test(s)) return "FWD";
  return "OTROS";
}

// ---------- Fases del juego (labels + emoji oscuro) ----------

const PHASES: Array<{ key: string; label: string; emoji: string }> = [
  { key: "OFFENSIVE", label: "Organización Ofensiva", emoji: "⚽" },
  { key: "DEFENSIVE", label: "Organización Defensiva", emoji: "🛡️" },
  { key: "OFF_TRANSITION", label: "Transición Ofensiva", emoji: "⚡" },
  { key: "DEF_TRANSITION", label: "Transición Defensiva", emoji: "🔄" },
  { key: "SET_PIECE", label: "Balón Parado (ABP)", emoji: "🎯" },
];

const INTENSITY_LABEL: Record<string, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
};

function zoneLabel(value: string | null): string | null {
  if (!value) return null;
  return FIELD_ZONES.find((z) => z.value === value)?.label ?? value;
}

// ---------- Componente maestro ----------

export function CompactoView({ data }: { data: CompactoData }) {
  // El míster abre la app y lo PRIMERO que ve es el plan de la semana (mock: barra Hoy·Biblioteca·Plantilla·Partidos)
  const [activeTab, setActiveTab] = useState<"hoy" | "library" | "squad" | "matches">("hoy");

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-slate-950 text-slate-100 overflow-hidden text-xs select-none">
      {/* ---------- Barra superior fija ---------- */}
      <header className="flex-none bg-slate-950/95 backdrop-blur border-b border-slate-800 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
          <div className="min-w-0">
            <h1 className="font-bold tracking-wide text-xs leading-tight truncate">
              MÉTODO // TACTICAL SUITE
            </h1>
            <p className="text-[10px] text-slate-500 leading-tight truncate">{data.teamName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            {(
              [
                { key: "hoy", label: "Hoy" },
                { key: "library", label: "Biblioteca" },
                { key: "squad", label: "Plantilla" },
                { key: "matches", label: "Partidos" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                aria-pressed={activeTab === t.key}
                className={`px-3 py-1 rounded font-medium transition min-h-[32px] ${
                  activeTab === t.key
                    ? "bg-emerald-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Link
            href="/dashboard/today"
            title="Salir del modo compacto"
            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white min-h-[32px] flex items-center"
          >
            <Home className="w-3.5 h-3.5" aria-hidden />
          </Link>
        </div>
      </header>

      {/* ---------- Panel activo (sin scroll general) ---------- */}
      <main className="flex-1 overflow-hidden p-2.5 flex flex-col gap-2">
        {activeTab === "hoy" && (
          <HoyTab
            hoy={data.hoy}
            pulse={data.pulse}
            lastMatch={data.lastMatch}
            nextMatch={data.nextMatch}
            todayIso={data.todayIso}
          />
        )}
        {activeTab === "library" && <LibraryTab tasks={data.tasks} />}
        {activeTab === "squad" && <SquadTab players={data.players} />}
        {activeTab === "matches" && <MatchesTab matches={data.matches} />}
      </main>
    </div>
  );
}

// ============================================================================
// PESTAÑA 1 · BIBLIOTECA — acordeón por fase + búsqueda + mini-ficha con vídeo
// ============================================================================

function LibraryTab({ tasks }: { tasks: CompactoTask[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const byPhase = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = query
      ? tasks.filter(
          (t) =>
            t.title.toLowerCase().includes(query) || t.objective.toLowerCase().includes(query),
        )
      : tasks;
    const map: Record<string, CompactoTask[]> = {};
    for (const p of PHASES) map[p.key] = [];
    for (const t of filtered) {
      for (const p of t.phases) if (map[p]) map[p].push(t);
    }
    return map;
  }, [tasks, q]);

  const toggle = (key: string) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Cabecera y búsqueda fijas */}
      <div className="flex-none bg-slate-900/80 border border-slate-800/80 p-2 rounded-lg flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-slate-200 whitespace-nowrap">Taxonomía & Tareas</span>
          <span className="text-[10px] bg-slate-800 text-emerald-400 px-1.5 py-0.5 rounded whitespace-nowrap">
            {tasks.length} tareas
          </span>
        </div>
        <div className="flex gap-1.5">
          <div className="relative">
            <Search
              className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2"
              aria-hidden
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar tarea..."
              aria-label="Buscar tareas"
              className="bg-slate-950 border border-slate-800 pl-7 pr-2 py-1 rounded text-slate-300 text-[11px] focus:outline-none focus:border-emerald-600 w-36 sm:w-48"
            />
          </div>
          <Link
            href="/dashboard/library"
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded font-medium flex items-center gap-1 whitespace-nowrap"
          >
            <Plus className="w-3 h-3" aria-hidden /> Tarea
          </Link>
        </div>
      </div>

      {/* Acordeón por fase */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {PHASES.map((ph) => {
          const list = byPhase[ph.key] ?? [];
          if (list.length === 0) return null;
          const isOpen = open[ph.key] ?? false;
          return (
            <div key={ph.key} className="bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggle(ph.key)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between p-2.5 bg-slate-900 hover:bg-slate-800/80 font-semibold text-slate-200 text-left transition"
              >
                <span className="flex items-center gap-2 truncate">
                  <span aria-hidden>{ph.emoji}</span> {ph.label}{" "}
                  <span className="text-[10px] text-slate-400 font-normal">({list.length} tareas)</span>
                </span>
                <span className="text-emerald-400 font-mono">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="p-2 bg-slate-950/40 border-t border-slate-800/80 space-y-1.5">
                  {list.map((t) => {
                    const expanded = expandedTask === t.id;
                    const zone = zoneLabel(t.fieldZoneLabel);
                    return (
                      <div key={t.id} className="border border-slate-800 rounded bg-slate-900/80 overflow-hidden">
                        <button
                          onClick={() => setExpandedTask(expanded ? null : t.id)}
                          aria-expanded={expanded}
                          className="w-full flex justify-between items-center gap-2 p-2 hover:bg-slate-800/60 text-left transition"
                        >
                          <span className="font-medium text-slate-300 truncate">{t.title}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            {zone && (
                              <span className="text-[10px] bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded">
                                {zone}
                              </span>
                            )}
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">
                              {t.durationMin} min
                            </span>
                          </span>
                        </button>
                        {expanded && (
                          <div className="px-2 pb-2 pt-1 border-t border-slate-800/80 space-y-1.5">
                            <p className="text-[11px] text-slate-400 leading-snug">{t.objective}</p>
                            <div className="flex flex-wrap gap-1">
                              <Chip>
                                {t.playersMin}
                                {t.playersMax ? `–${t.playersMax}` : "+"} jug.
                              </Chip>
                              <Chip>{INTENSITY_LABEL[t.intensity] ?? t.intensity}</Chip>
                              {(t.spaceLengthM || t.spaceWidthM) && (
                                <Chip>
                                  Espacio {t.spaceLengthM ?? "–"}×{t.spaceWidthM ?? "–"} m
                                </Chip>
                              )}
                              {zone && <Chip>📍 {zone}</Chip>}
                              {t.isCatedra && <Chip>Cátedra</Chip>}
                            </div>
                            {t.videoUrl && (
                              <a
                                href={t.videoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-0.5 bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[11px] font-semibold"
                              >
                                ▶ Vídeo real de la tarea
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {tasks.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-800 p-3 text-slate-500 text-center">
            Catálogo vacío — crea la primera tarea desde Biblioteca.
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PESTAÑA 2 · PLANTILLA — acordeón por posición
// ============================================================================

function SquadTab({ players }: { players: CompactoPlayer[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const map: Record<string, CompactoPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [], OTROS: [] };
    for (const p of players) map[posGroup(p.position)].push(p);
    // Orden natural dentro del grupo: dorsal → nombre
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.number ?? 99) - (b.number ?? 99) || a.name.localeCompare(b.name));
    }
    return map;
  }, [players]);

  const toggle = (key: string) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex-none bg-slate-900/80 border border-slate-800/80 p-2 rounded-lg flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-200 truncate">Plantilla por posiciones</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded">
            Total: {players.length} jugadores
          </span>
          <Link
            href="/dashboard/players"
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded font-medium flex items-center gap-1"
          >
            <Plus className="w-3 h-3" aria-hidden /> Jugador
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {(Object.keys(POS_GROUP_LABEL) as Array<keyof typeof POS_GROUP_LABEL>).map((g) => {
          const list = groups[g];
          if (list.length === 0) return null;
          const isOpen = open[g] ?? false;
          return (
            <div key={g} className="bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggle(g)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between p-2.5 bg-slate-900 hover:bg-slate-800/80 font-semibold text-slate-200 text-left transition"
              >
                <span className="flex items-center gap-2 truncate">
                  {POS_GROUP_LABEL[g]}{" "}
                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                    {list.length}
                  </span>
                </span>
                <span className="text-emerald-400 font-mono">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="p-2 bg-slate-950/40 border-t border-slate-800/80 space-y-1">
                  {list.map((p) => (
                    <div
                      key={p.id}
                      className="flex justify-between items-center bg-slate-900/80 p-2 rounded border border-slate-800"
                    >
                      <span className="font-medium text-slate-300 truncate flex items-center gap-2">
                        {p.number != null && (
                          <span className="text-[10px] font-mono bg-slate-800 text-emerald-400 rounded px-1.5 py-0.5 w-7 text-center">
                            {p.number}
                          </span>
                        )}
                        {p.name}
                      </span>
                      <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded shrink-0">
                        {p.position}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {players.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-800 p-3 text-slate-500 text-center">
            Plantilla vacía — añade jugadores desde Plantilla.
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PESTAÑA 3 · PARTIDOS — próximos y resultados
// ============================================================================

function MatchesTab({ matches }: { matches: CompactoMatch[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ upcoming: true, results: true });

  const upcoming = matches.filter((m) => !m.played).slice(0, 8);
  const results = matches.filter((m) => m.played).slice(0, 12);

  const toggle = (key: string) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex-none bg-slate-900/80 border border-slate-800/80 p-2 rounded-lg flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-200 truncate">Calendario & Resultados</span>
        <Link
          href="/dashboard/matches"
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded font-medium flex items-center gap-1 shrink-0"
        >
          <Plus className="w-3 h-3" aria-hidden /> Partido
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {[
          { key: "upcoming", label: "📅 Próximos", list: upcoming },
          { key: "results", label: "🏁 Resultados", list: results },
        ].map((sec) => {
          const isOpen = open[sec.key] ?? false;
          return (
            <div key={sec.key} className="bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggle(sec.key)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between p-2.5 bg-slate-900 hover:bg-slate-800/80 font-semibold text-slate-200 text-left transition"
              >
                <span className="flex items-center gap-2 truncate">
                  {sec.label}{" "}
                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                    {sec.list.length}
                  </span>
                </span>
                <span className="text-emerald-400 font-mono">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="p-2 bg-slate-950/40 border-t border-slate-800/80 space-y-1">
                  {sec.list.map((m) => (
                    <Link
                      key={m.id}
                      href="/dashboard/matches"
                      className="flex justify-between items-center bg-slate-900/80 p-2 rounded border border-slate-800 hover:border-emerald-700 transition"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-slate-300 truncate block">
                          {m.isHome ? "🏠" : "✈️"} vs {m.opponent}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate">
                          {m.competition ?? "Amistoso"} ·{" "}
                          <span suppressHydrationWarning>
                            {new Date(m.kickoffAt).toLocaleDateString("es-ES", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        </span>
                      </span>
                      {m.played ? (
                        <span className="text-[11px] font-mono bg-slate-800 text-emerald-400 px-2 py-1 rounded shrink-0">
                          {m.goalsFor ?? 0}–{m.goalsAgainst ?? 0}
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded shrink-0">
                          <span suppressHydrationWarning>
                            {new Date(m.kickoffAt).toLocaleTimeString("es-ES", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </span>
                      )}
                    </Link>
                  ))}
                  {sec.list.length === 0 && (
                    <p className="text-slate-500 text-center py-2 text-[11px]">Nada por aquí.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {matches.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-800 p-3 text-slate-500 text-center">
            Sin partidos — crea el primero desde Partidos.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- Chip oscuro genérico ----------

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">{children}</span>
  );
}

// ============================================================================
// PESTAÑA 0 · HOY — planificación semanal del motor (conectada con diagnóstico
// y rival). Mismo motor y MISMAS Server Actions que /dashboard/today: el tab
// es una vista compacta del microciclo real, no un mock pintado a mano.
// ============================================================================

const STATUS_HOY: Record<string, { label: string; cls: string }> = {
  PROPOSED: { label: "Propuesta lista — pendiente de tu visto bueno", cls: "bg-amber-500/10 text-amber-400 border border-amber-500/30" },
  ACCEPTED: { label: "Plan aceptado — a entrenar", cls: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" },
  ADJUSTED: { label: "Ajustado por el cuerpo técnico", cls: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30" },
  COMPLETED: { label: "Semana completada", cls: "bg-slate-800 text-slate-300 border border-slate-700" },
};

const ISSUE_KIND: Record<string, { label: string; cls: string }> = {
  TACTICAL: { label: "Táctica", cls: "bg-rose-500/10 text-rose-400 border border-rose-500/30" },
  PHYSICAL: { label: "Físico", cls: "bg-amber-500/10 text-amber-400 border border-amber-500/30" },
  MORALE: { label: "Ánimo", cls: "bg-violet-500/10 text-violet-400 border border-violet-500/30" },
};

const PHASE_LABEL: Record<string, string> = {
  OFFENSIVE: "Ofensiva",
  DEFENSIVE: "Defensiva",
  OFF_TRANSITION: "Trans. of.",
  DEF_TRANSITION: "Trans. def.",
  SET_PIECE: "ABP",
};

function gaugeBar(value: number): string {
  if (value >= 7) return "bg-rose-500";
  if (value >= 4) return "bg-amber-400";
  return "bg-emerald-500";
}

/** Día calendario del stored @db.Date — formateado en UTC para que no rote el día */
function fmtDay(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtShort(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function fmtKickoff(dateIso: string): string {
  const d = new Date(dateIso);
  const dia = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Madrid" });
  const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  return `${dia} · ${hora}h`;
}

function HoyStat({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2 min-w-0">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide truncate">{title}</p>
      {children}
    </div>
  );
}

function HoyTab({
  hoy,
  pulse,
  lastMatch,
  nextMatch,
  todayIso,
}: {
  hoy: CompactoHoy | null;
  pulse: CompactoData["pulse"];
  lastMatch: CompactoData["lastMatch"];
  nextMatch: CompactoData["nextMatch"];
  todayIso: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  // El día de HOY arranca abierto (si hay sesión); el resto, cerrados
  const initialOpen = useMemo(() => {
    const map: Record<string, boolean> = {};
    if (hoy) {
      const today = hoy.sessions.find((s) => s.dateIso.slice(0, 10) === todayIso.slice(0, 10));
      if (today) map[today.id] = true;
      else if (hoy.sessions[0]) map[hoy.sessions[0].id] = true;
    }
    return map;
  }, [hoy, todayIso]);
  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen);

  const accept = () => {
    if (!hoy?.microcycleId) return;
    startTransition(async () => {
      await acceptPlan(hoy.microcycleId);
      router.refresh(); // recarga el RSC con el microciclo ya aceptado
    });
  };

  const cook = () => {
    startTransition(async () => {
      await ensureWeeklyProposal();
      router.refresh();
    });
  };

  const toggleDay = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  const status = hoy?.status ? STATUS_HOY[hoy.status] : null;

  return (
    <div className="flex flex-col h-full gap-2 overflow-y-auto pr-1">
      {/* ---------- Pulso del vestuario + contexto de partidos ---------- */}
      <div className={`grid gap-1.5 ${pulse ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
        {pulse && (
          <>
            <HoyStat title="Inercia anímica">
              <p className="text-lg font-black text-slate-100 leading-tight">
                {pulse.morale}
                <span className="text-[10px] text-slate-500 font-bold">/10</span>
              </p>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden my-1">
                <div className={`h-full ${gaugeBar(pulse.morale)}`} style={{ width: `${pulse.morale * 10}%` }} />
              </div>
              {pulse.streak != null && (
                <p className="text-[10px] text-slate-500 truncate">
                  {pulse.streak > 0 ? `▲ Racha: +${pulse.streak} victorias` : pulse.streak < 0 ? `▼ Racha: ${pulse.streak} derrotas` : "Racha: empates"}
                </p>
              )}
            </HoyStat>
            <HoyStat title="Fatiga grupal">
              <p className="text-lg font-black text-slate-100 leading-tight">
                {pulse.fatigue}
                <span className="text-[10px] text-slate-500 font-bold">/10</span>
              </p>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden my-1">
                <div className={`h-full ${gaugeBar(pulse.fatigue)}`} style={{ width: `${pulse.fatigue * 10}%` }} />
              </div>
              <p className="text-[10px] text-slate-500 truncate">
                {pulse.fatigue >= 7 ? "Carga alta: semana controlada" : "Nivel de carga asumible"}
              </p>
            </HoyStat>
          </>
        )}
        <HoyStat title="Último partido">
          {lastMatch ? (
            <>
              <p className="text-lg font-black text-slate-100 leading-tight font-mono">
                {lastMatch.goalsFor}–{lastMatch.goalsAgainst}
              </p>
              <p className="text-[10px] text-slate-500 truncate">vs {lastMatch.opponent} · {lastMatch.isHome ? "en casa" : "fuera"}</p>
            </>
          ) : (
            <p className="text-[11px] text-slate-500">Sin partidos aún</p>
          )}
        </HoyStat>
        <HoyStat title="Próximo partido">
          {nextMatch ? (
            <>
              <p className="text-sm font-black text-emerald-400 leading-tight truncate">vs {nextMatch.opponent}</p>
              <p className="text-[10px] text-slate-500 truncate" suppressHydrationWarning>
                {nextMatch.isHome ? "🏠" : "✈️"} {fmtKickoff(nextMatch.kickoffIso)}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-slate-500">Calendario por definir</p>
          )}
        </HoyStat>
      </div>

      {/* ---------- Sin propuesta: cero pantallas en blanco ---------- */}
      {!hoy ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-800 p-6 text-center">
          <p className="text-sm font-bold text-slate-200">El motor no tiene propuesta cocinada para esta semana</p>
          <p className="text-[11px] text-slate-500 max-w-xs">
            Con un toque, cocinamos el microciclo a partir del último partido (diagnóstico) y del pulso del vestuario.
          </p>
          <button
            onClick={cook}
            disabled={pending}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg font-bold min-h-[36px]"
          >
            {pending ? "Cocinando…" : "⚡ Cocinar propuesta"}
          </button>
        </div>
      ) : (
        <>
          {/* ---------- Microciclo ---------- */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="font-bold text-slate-100 text-sm">
                Microciclo · <span suppressHydrationWarning>{fmtShort(hoy.weekStartIso)}</span>
              </p>
              {status && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
              )}
            </div>
            {hoy.tacticalDirectives.length > 0 && (
              <div className="space-y-1">
                {hoy.tacticalDirectives.map((d, i) => (
                  <p key={i} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                    <span className="text-emerald-400 shrink-0" aria-hidden>▸</span> {d}
                  </p>
                ))}
              </div>
            )}
            {hoy.diagnosisSummary && (
              <p className="text-[11px] text-slate-400 leading-snug">
                <span className="font-semibold text-slate-300">Diagnóstico del motor: </span>
                {hoy.diagnosisSummary}
              </p>
            )}
          </div>

          {/* ---------- Qué falló (conectado con el diagnóstico del rival/partido) ---------- */}
          {hoy.issues.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide px-0.5">
                Qué falló {hoy.engineVersion ? `(${hoy.engineVersion})` : ""}
              </p>
              {hoy.issues.map((iss, i) => {
                const kind = ISSUE_KIND[iss.kind] ?? ISSUE_KIND.TACTICAL;
                return (
                  <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1.5 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${kind.cls}`}>{kind.label}</span>
                      {iss.phase && (
                        <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                          {PHASE_LABEL[iss.phase] ?? iss.phase}
                        </span>
                      )}
                      <span className="text-[10px] text-amber-400" title={`Severidad ${iss.severity}/5`} aria-label={`Severidad ${iss.severity} de 5`}>
                        {"⚠".repeat(Math.max(1, Math.min(5, iss.severity)))}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug">{iss.evidence}</p>
                    {iss.subPrinciple && (
                      <p className="text-[10px] text-slate-500">Subprincipio: {iss.subPrinciple}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ---------- Días de la semana (acordeón) ---------- */}
          <div className="space-y-1.5">
            {hoy.sessions.map((s) => {
              const isOpen = open[s.id] ?? false;
              const isToday = s.dateIso.slice(0, 10) === todayIso.slice(0, 10);
              return (
                <div key={s.id} className="bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleDay(s.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-2 p-2.5 bg-slate-900 hover:bg-slate-800/80 font-semibold text-slate-200 text-left transition"
                  >
                    <span className="flex items-center gap-2 truncate min-w-0">
                      <span className="text-[10px] font-mono bg-emerald-600/15 text-emerald-400 border border-emerald-600/30 px-1.5 py-0.5 rounded shrink-0">
                        {s.label}
                      </span>
                      <span className="truncate capitalize" suppressHydrationWarning>{fmtDay(s.dateIso)}</span>
                      {isToday && (
                        <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold shrink-0">HOY</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {s.durationMin != null && (
                        <span className="text-[10px] text-slate-500 font-mono">{s.durationMin} min</span>
                      )}
                      <span className="text-emerald-400 font-mono">{isOpen ? "▲" : "▼"}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="p-2 bg-slate-950/40 border-t border-slate-800/80 space-y-1.5">
                      {s.objective && (
                        <p className="text-[11px] text-slate-400 leading-snug">{s.objective}</p>
                      )}
                      {s.tasks.length === 0 && (
                        <p className="text-[11px] text-slate-500 text-center py-1">Sesión libre — aún sin tareas asignadas.</p>
                      )}
                      {s.tasks.map((t) => {
                        const expanded = expandedTask === `${s.id}:${t.order}`;
                        return (
                          <div key={t.order} className="border border-slate-800 rounded bg-slate-900/80 overflow-hidden">
                            <button
                              onClick={() => setExpandedTask(expanded ? null : `${s.id}:${t.order}`)}
                              aria-expanded={expanded}
                              className="w-full flex justify-between items-center gap-2 p-2 hover:bg-slate-800/60 text-left transition"
                            >
                              <span className="font-medium text-slate-300 truncate">
                                <span className="text-emerald-400 font-mono mr-1.5">{t.order}.</span>
                                {t.title}
                              </span>
                              <span className="flex items-center gap-1 shrink-0">
                                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">
                                  {INTENSITY_LABEL[t.intensity] ?? t.intensity}
                                </span>
                                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                                  {t.durationMin ?? "—"} min
                                </span>
                              </span>
                            </button>
                            {expanded && (
                              <div className="px-2 pb-2 pt-1 border-t border-slate-800/80 space-y-1.5">
                                <p className="text-[11px] text-slate-400 leading-snug">{t.objective}</p>
                                <div className="flex flex-wrap gap-1">
                                  <Chip>
                                    {t.playersMin}
                                    {t.playersMax ? `–${t.playersMax}` : "+"} jug.
                                  </Chip>
                                  {(t.spaceLengthM || t.spaceWidthM) && (
                                    <Chip>
                                      Espacio {t.spaceLengthM ?? "–"}×{t.spaceWidthM ?? "–"} m
                                    </Chip>
                                  )}
                                </div>
                                {t.rationale && (
                                  <p className="text-[11px] italic text-slate-500 border-l-2 border-emerald-600/40 pl-2 leading-snug">
                                    Por qué esta tarea: {t.rationale}
                                  </p>
                                )}
                                {t.corrige && (
                                  <p className="text-[10px] text-amber-400/90 leading-snug">
                                    ⚠ Corrige: {t.corrige}
                                  </p>
                                )}
                                {t.videoUrl && (
                                  <a
                                    href={t.videoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[11px] font-semibold"
                                  >
                                    ▶ Vídeo real de la tarea
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {hoy.sessions.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-800 p-3 text-slate-500 text-center text-[11px]">
                El microciclo aún no tiene sesiones asignadas.
              </p>
            )}
          </div>

          {/* ---------- Por qué este plan (auditoría del motor) ---------- */}
          {hoy.audit && hoy.audit.prescriptions.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Por qué este plan</p>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                  motor {hoy.audit.version}
                </span>
              </div>
              {hoy.audit.prescriptions.map((p, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-600/15 text-emerald-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-300 truncate">
                      {p.taskTitle}
                      {p.sessionLabel && <span className="ml-1.5 text-[10px] text-emerald-400 font-mono">{p.sessionLabel}</span>}
                    </p>
                    <p className="text-[10px] text-slate-500 leading-snug">{p.rationale}</p>
                    {p.relevance != null && (
                      <p className="text-[10px] text-slate-600">
                        {p.relevance === 3 ? "Núcleo" : p.relevance === 2 ? "Refuerza" : "Apoyo"}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {hoy.audit.discarded.length > 0 && (
                <details className="group rounded-lg border border-slate-800 bg-slate-950/50 overflow-hidden">
                  <summary className="cursor-pointer list-none px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 flex items-center justify-between hover:text-slate-200">
                    Candidatas evaluadas y descartadas ({hoy.audit.discarded.length})
                    <span className="text-[10px] text-slate-600 group-open:hidden">ver</span>
                    <span className="hidden text-[10px] text-slate-600 group-open:inline">ocultar</span>
                  </summary>
                  <div className="px-2.5 pb-2 space-y-1">
                    {hoy.audit.discarded.map((d, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 bg-slate-900/80 rounded px-2 py-1">
                        <p className="text-[11px] text-slate-400 min-w-0">{d.taskTitle}</p>
                        <p className="text-[10px] text-slate-600 text-right shrink-0">{d.reason}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* ---------- CTA: decisión con un toque ---------- */}
          {hoy.status === "PROPOSED" ? (
            <button
              onClick={accept}
              disabled={pending}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white py-3 rounded-lg font-bold text-sm min-h-[44px] shadow-lg shadow-emerald-900/40"
            >
              {pending ? "Guardando…" : "✅ Aceptar Plan"}
            </button>
          ) : (
            <div className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2.5 text-center">
              <p className="text-sm font-bold text-emerald-400">
                {STATUS_HOY[hoy.status ?? ""]?.label ?? hoy.status}
              </p>
              <p className="text-[11px] text-emerald-500/80 mt-0.5">
                Plan de la semana cerrado. Toca cualquier tarea para retocarla (próxima fase).
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
