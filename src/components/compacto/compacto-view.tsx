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

import { useMemo, useState } from "react";
import Link from "next/link";
import { Home, Plus, Search } from "lucide-react";
import { FIELD_ZONES } from "@/lib/field-zone";

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

export type CompactoData = {
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
  const [activeTab, setActiveTab] = useState<"library" | "squad" | "matches">("library");

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
