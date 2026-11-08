"use client";

// ============================================================================
// PILAR 3 — TABLÓN DE EVALUACIÓN TÁCTICA EN DIRECTO (Modo Vestuario)
// ----------------------------------------------------------------------------
// Pizarra viva durante el partido: titulares sobre el terreno de juego,
// banqueta al lado y ficha 1-clic por jugador (positivos a reforzar /
// correctivos a corregir). Cada toque guarda al instante vía
// POST /api/matches/:id/evaluations — sin botón "guardar", el partido no espera.
// El estado previo (titulares y tags ya anotados) llega del servidor para
// sobrevivir a una recarga; el toggle Titular/Suplente corrige la alineación
// de partida en cualquier momento.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Radio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { POSITION_SHORT, POSITION_LABEL, TACTICAL_TAG_META } from "@/lib/taxonomy";

// ---------- Tipos ----------

export type LivePlayerData = {
  id: string;
  firstName: string;
  lastName: string;
  shirtNumber: number | null;
  mainPosition: string;
};

export type LiveTagData = {
  id: string;
  code: string;
  type: string;
  createdAt: string;
};

export type LiveEvaluationData = {
  playerId: string;
  isStarter: boolean;
  tags: LiveTagData[];
};

type EvalApiResponse = {
  ok: boolean;
  error?: string;
  evaluation?: { id: string; playerId: string; isStarter: boolean; totalTags: number };
};

const POSITIVE_CODES = Object.entries(TACTICAL_TAG_META)
  .filter(([, m]) => m.type === "POSITIVE")
  .map(([code, m]) => ({ code, label: m.label }));
const CORRECTIVE_CODES = Object.entries(TACTICAL_TAG_META)
  .filter(([, m]) => m.type === "CORRECTIVE")
  .map(([code, m]) => ({ code, label: m.label }));

// ---------- Componente ----------

export function LiveMatchBoard({
  matchId,
  players,
  initialEvaluations,
}: {
  matchId: string;
  players: LivePlayerData[];
  initialEvaluations: LiveEvaluationData[];
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<LivePlayerData | null>(null);
  const [starterIds, setStarterIds] = useState<Set<string>>(
    () => new Set(initialEvaluations.filter((e) => e.isStarter).map((e) => e.playerId)),
  );
  const [tagCounts, setTagCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const e of initialEvaluations) counts[e.playerId] = e.tags.length;
    return counts;
  });
  const [recentTags, setRecentTags] = useState<Record<string, string[]>>(() => {
    const recent: Record<string, string[]> = {};
    for (const e of initialEvaluations) {
      recent[e.playerId] = e.tags.map((t) => t.code);
    }
    return recent;
  });
  const [loadingTag, setLoadingTag] = useState<string | null>(null);
  const [savingLineup, setSavingLineup] = useState(false);

  const { starters, bench } = useMemo(() => {
    const ordered = [...players].sort(
      (a, b) => (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99),
    );
    return {
      starters: ordered.filter((p) => starterIds.has(p.id)),
      bench: ordered.filter((p) => !starterIds.has(p.id)),
    };
  }, [players, starterIds]);

  // Cerrar la ficha con Escape (el míster tiene las manos ocupadas)
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const postEvaluation = useCallback(
    async (payload: { playerId: string; isStarter?: boolean; tagCode?: string }) => {
      const res = await fetch(`/api/matches/${matchId}/evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as EvalApiResponse | null;
      if (!res.ok || !data?.ok || !data.evaluation) {
        throw new Error(data?.error ?? "No se pudo guardar la anotación.");
      }
      return data.evaluation;
    },
    [matchId],
  );

  const handleAddTag = async (player: LivePlayerData, code: string, label: string) => {
    setLoadingTag(code);
    try {
      const evaluation = await postEvaluation({
        playerId: player.id,
        isStarter: starterIds.has(player.id),
        tagCode: code,
      });
      setTagCounts((prev) => ({ ...prev, [player.id]: evaluation.totalTags }));
      setRecentTags((prev) => ({
        ...prev,
        [player.id]: [...(prev[player.id] ?? []), code],
      }));
    } catch (err) {
      console.error("Error guardando tag táctico:", err);
      toast({
        title: "No se pudo anotar",
        description: err instanceof Error ? err.message : `${label}: inténtalo de nuevo.`,
        variant: "destructive",
      });
    } finally {
      setLoadingTag(null);
    }
  };

  const handleToggleStarter = async (player: LivePlayerData) => {
    const next = !starterIds.has(player.id);
    setSavingLineup(true);
    try {
      await postEvaluation({ playerId: player.id, isStarter: next });
      setStarterIds((prev) => {
        const set = new Set(prev);
        if (next) set.add(player.id);
        else set.delete(player.id);
        return set;
      });
      setSelected(null);
    } catch (err) {
      console.error("Error actualizando la alineación:", err);
      toast({
        title: "No se pudo actualizar la alineación",
        description: err instanceof Error ? err.message : "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setSavingLineup(false);
    }
  };

  const chipBadge = (p: LivePlayerData) =>
    p.shirtNumber ?? POSITION_SHORT[p.mainPosition] ?? "·";

  const renderTagGroup = (
    title: string,
    accent: string,
    items: Array<{ code: string; label: string }>,
    tone: "positive" | "corrective",
  ) => (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${accent}`}>
        {title}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((tag) => (
          <button
            key={tag.code}
            disabled={loadingTag !== null}
            onClick={() => selected && handleAddTag(selected, tag.code, tag.label)}
            className={`flex items-center justify-between p-2.5 text-xs rounded-lg transition-all active:scale-95 disabled:opacity-50 ${
              tone === "positive"
                ? "bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 text-emerald-200"
                : "bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-200"
            }`}
          >
            <span>{tag.label}</span>
            <span className={`font-bold ${loadingTag === tag.code ? "" : tone === "positive" ? "text-emerald-400" : "text-amber-400"}`}>
              {loadingTag === tag.code ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                tone === "positive" ? "+" : "!"
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 rounded-3xl border border-zinc-800 bg-zinc-950">
      {/* ---------- Terreno de juego (titulares) ---------- */}
      <div className="flex-1 bg-emerald-900/40 border-4 border-emerald-500/30 rounded-2xl p-5 relative min-h-[420px] flex flex-col shadow-inner">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-emerald-200 font-bold flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" aria-hidden />
            Terreno de juego · Directo
          </div>
          <span className="text-[11px] text-emerald-200/70">
            {starters.length} titulares · {bench.length} en la banqueta
          </span>
        </div>

        {players.length === 0 ? (
          <div className="my-auto rounded-2xl border border-dashed border-emerald-500/40 px-6 py-10 text-center text-sm text-emerald-100/70">
            Aún no hay jugadores en la plantilla. Da de alta al equipo en
            &ldquo;Plantilla&rdquo; para poder evaluar en directo.
          </div>
        ) : starters.length === 0 ? (
          <div className="my-auto rounded-2xl border border-dashed border-emerald-500/40 px-6 py-10 text-center text-sm text-emerald-100/70">
            Toca un jugador de la banqueta y márcalo como titular para sacarlo
            al terreno de juego.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 my-auto">
            {starters.map((player) => (
              <button
                key={player.id}
                onClick={() => setSelected(player)}
                className={`relative flex flex-col items-center justify-center p-3 rounded-2xl transition-all ${
                  selected?.id === player.id
                    ? "bg-amber-400 text-zinc-950 scale-105 shadow-lg font-bold"
                    : "bg-zinc-950/80 hover:bg-zinc-900 text-zinc-50 border border-emerald-500/30"
                }`}
                aria-label={`${player.firstName} ${player.lastName}, ${POSITION_LABEL[player.mainPosition] ?? player.mainPosition}, ${tagCounts[player.id] ?? 0} anotaciones`}
              >
                <span className="w-9 h-9 rounded-full bg-emerald-500 text-zinc-950 font-black flex items-center justify-center text-base mb-1 shadow">
                  {chipBadge(player)}
                </span>
                <span className="text-xs truncate max-w-[80px]">
                  {player.firstName}
                </span>
                {(tagCounts[player.id] ?? 0) > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-amber-400 text-zinc-950 text-[10px] font-black">
                    {tagCounts[player.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---------- Banqueta de suplentes ---------- */}
      <div className="w-full lg:w-72 bg-zinc-900 p-4 rounded-2xl border border-zinc-800 flex flex-col">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
          Banqueta de suplentes
        </h4>
        <div className="flex flex-wrap lg:flex-col lg:flex-nowrap gap-2 overflow-y-auto max-h-[360px]">
          {bench.map((player) => (
            <button
              key={player.id}
              onClick={() => setSelected(player)}
              className={`flex items-center gap-3 p-2.5 rounded-lg text-left transition-all ${
                selected?.id === player.id
                  ? "bg-amber-400 text-zinc-950 font-bold"
                  : "bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200"
              }`}
            >
              <span className="w-7 h-7 rounded-full bg-zinc-700 text-zinc-50 font-bold flex items-center justify-center text-xs shrink-0">
                {chipBadge(player)}
              </span>
              <span className="text-sm truncate">
                {player.firstName} {player.lastName}
              </span>
              {(tagCounts[player.id] ?? 0) > 0 && (
                <span className="ml-auto flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-amber-400 text-zinc-950 text-[10px] font-black shrink-0">
                  {tagCounts[player.id]}
                </span>
              )}
            </button>
          ))}
          {bench.length === 0 && (
            <p className="text-xs text-zinc-500 px-1 py-2">
              Todo el equipo está sobre el césped.
            </p>
          )}
        </div>
      </div>

      {/* ---------- Ficha flotante del jugador seleccionado ---------- */}
      {selected && (
        <div
          className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Evaluar a ${selected.firstName} ${selected.lastName}`}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-200 max-h-[88vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera de la ficha */}
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-full bg-emerald-500 text-zinc-950 font-black text-lg flex items-center justify-center shrink-0">
                  {chipBadge(selected)}
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-zinc-50 truncate">
                    {selected.firstName} {selected.lastName}
                  </h3>
                  <span className="text-xs text-zinc-400">
                    {POSITION_LABEL[selected.mainPosition] ?? selected.mainPosition} ·{" "}
                    {starterIds.has(selected.id) ? "Titular" : "Suplente"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-zinc-400 hover:text-zinc-50 text-xl font-bold p-1"
                aria-label="Cerrar ficha"
              >
                ✕
              </button>
            </div>

            {/* Tags de evaluación (1 clic) */}
            <div className="space-y-4">
              {renderTagGroup(
                "Aspectos positivos",
                "text-emerald-400",
                POSITIVE_CODES,
                "positive",
              )}
              {renderTagGroup(
                "Aspectos a corregir",
                "text-amber-400",
                CORRECTIVE_CODES,
                "corrective",
              )}
            </div>

            {/* Contadores de la sesión + alineación */}
            <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 flex items-center justify-between gap-3">
              <span>
                Anotaciones en este partido:{" "}
                <span className="font-bold text-zinc-50">
                  {(recentTags[selected.id] ?? []).length} registro(s)
                </span>
              </span>
              <button
                onClick={() => handleToggleStarter(selected)}
                disabled={savingLineup}
                className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                {savingLineup
                  ? "Guardando…"
                  : starterIds.has(selected.id)
                    ? "Pasar al banquillo"
                    : "Marcar como titular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
