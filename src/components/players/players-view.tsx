"use client";

// ============================================================================
// PILAR 2 — VISTA DE PLANTILLA (Modo Vestuario, táctil)
// ----------------------------------------------------------------------------
// • Filtros rápidos por demarcación principal (1 toque, chips con contador).
// • Tarjetas grandes: dorsal, posición, POLIVALENCIAS (Position[]) visibles,
//   perfiles 1-5 como barras de puntos, estado de disponibilidad con color.
// • Toque en tarjeta → hoja inferior con edición de un toque (estado + ratings
//   con steppers + nota corta) vía updatePlayerQuick.
// ============================================================================

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Minus, Plus, UserCog } from "lucide-react";
import type { PlayerStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ImportSquadDialog } from "@/components/players/import-squad";
import { updatePlayerQuick } from "@/app/dashboard/players/actions";
import {
  PLAYER_STATUS_META,
  POSITION_GROUPS,
  POSITION_LABEL,
  positionGroupKey,
} from "@/lib/taxonomy";
import { useToast } from "@/hooks/use-toast";

export type PlayerCardData = {
  id: string;
  firstName: string;
  lastName: string;
  shirtNumber: number | null;
  mainPosition: string;
  secondaryPositions: string[];
  technicalRating: number | null;
  tacticalRating: number | null;
  physicalRating: number | null;
  status: string;
  statusNote: string | null;
};

type EditorDraft = {
  status: string;
  technicalRating: number | null;
  tacticalRating: number | null;
  physicalRating: number | null;
  statusNote: string;
};

const STATUSES = ["AVAILABLE", "INJURED", "SUSPENDED", "RETURNING"] as const;

function RatingBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl bg-zinc-800/50 px-2 py-1.5">
      <p className="text-[10px] font-bold text-zinc-500 tracking-widest">{label}</p>
      <div className="flex gap-0.5 mt-1" aria-label={`${label}: ${value ?? "sin valorar"} de 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${value && i <= value ? "bg-emerald-400" : "bg-zinc-700"}`}
          />
        ))}
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-zinc-800/60 px-3 py-2">
      <span className="text-sm font-semibold text-zinc-300">{label}</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-2xl border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-800"
          onClick={() => onChange(Math.max(1, (value ?? 3) - 1))}
          aria-label={`Bajar ${label}`}
        >
          <Minus className="w-5 h-5" aria-hidden />
        </Button>
        <span className="w-8 text-center text-xl font-black text-zinc-50" aria-live="polite">
          {value ?? "–"}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-2xl border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-800"
          onClick={() => onChange(Math.min(5, (value ?? 3) + 1))}
          aria-label={`Subir ${label}`}
        >
          <Plus className="w-5 h-5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function PlayersView({
  teamName,
  players: initialPlayers,
}: {
  teamName: string;
  players: PlayerCardData[];
}) {
  const [players, setPlayers] = useState(initialPlayers);
  const [filter, setFilter] = useState<string>("ALL");

  // Los datos del servidor (RSC) son la fuente de verdad: tras un
  // router.refresh() (importación, edición) se sincroniza el estado local.
  useEffect(() => {
    setPlayers(initialPlayers);
  }, [initialPlayers]);

  const [editing, setEditing] = useState<PlayerCardData | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [saving, startTransition] = useTransition();
  const { toast } = useToast();

  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: players.length };
    for (const g of POSITION_GROUPS) {
      map[g.key] = players.filter((p) => positionGroupKey(p.mainPosition) === g.key).length;
    }
    return map;
  }, [players]);

  const filtered = useMemo(
    () =>
      filter === "ALL"
        ? players
        : players.filter((p) => positionGroupKey(p.mainPosition) === filter),
    [players, filter],
  );

  const stats = useMemo(
    () => ({
      available: players.filter((p) => p.status === "AVAILABLE").length,
      out: players.filter((p) => p.status === "INJURED" || p.status === "SUSPENDED").length,
      poly: players.filter((p) => p.secondaryPositions.length > 0).length,
    }),
    [players],
  );

  function openEditor(p: PlayerCardData) {
    setEditing(p);
    setDraft({
      status: p.status,
      technicalRating: p.technicalRating,
      tacticalRating: p.tacticalRating,
      physicalRating: p.physicalRating,
      statusNote: p.statusNote ?? "",
    });
  }

  function saveEditor() {
    if (!editing || !draft) return;
    const target = editing;
    // Snapshot para el rollback: si la Server Action falla (red, guard,
    // validación), la tarjeta vuelve a su estado REAL pre-optimista.
    const snapshot = players.find((p) => p.id === target.id);
    const patch = {
      status: draft.status as PlayerStatus,
      technicalRating: draft.technicalRating,
      tacticalRating: draft.tacticalRating,
      physicalRating: draft.physicalRating,
      statusNote: draft.statusNote.trim() || null,
    };
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === target.id
          ? {
              ...p,
              status: draft.status,
              technicalRating: draft.technicalRating,
              tacticalRating: draft.tacticalRating,
              physicalRating: draft.physicalRating,
              statusNote: draft.statusNote.trim() || null,
            }
          : p,
      ),
    );
    startTransition(async () => {
      try {
        await updatePlayerQuick(target.id, patch);
        toast({
          title: "Ficha actualizada",
          description: `${target.firstName} ${target.lastName}`,
          duration: 1800,
        });
        setEditing(null);
      } catch {
        // Rollback del estado optimista + aviso claro: nada queda a medias.
        if (snapshot) {
          setPlayers((prev) =>
            prev.map((p) => (p.id === snapshot.id ? snapshot : p)),
          );
        }
        toast({
          title: "No se pudo guardar la ficha",
          description: `Los cambios de ${target.firstName} se han restaurado. Revisa tu conexión e inténtalo de nuevo.`,
          variant: "destructive",
          duration: 5000,
        });
      }
    });
  }

  return (
    <div>
      {/* ---------- Cabecera ---------- */}
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 leading-tight truncate">Pilar 2 · {teamName}</p>
            <h1 className="text-2xl font-black text-zinc-50 leading-tight">Plantilla</h1>
          </div>
          <ImportSquadDialog />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 space-y-5 pt-5">
        {/* ---------- Pulso de plantilla ---------- */}
        <section aria-label="Resumen de plantilla" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-3xl bg-zinc-900 border border-zinc-800 p-4">
            <p className="text-xs font-semibold text-zinc-400">JUGADORES</p>
            <p className="text-2xl font-black text-zinc-50 mt-1">{players.length}</p>
          </div>
          <div className="rounded-3xl bg-zinc-900 border border-zinc-800 p-4">
            <p className="text-xs font-semibold text-zinc-400">DISPONIBLES</p>
            <p className="text-2xl font-black text-emerald-400 mt-1">{stats.available}</p>
          </div>
          <div className="rounded-3xl bg-zinc-900 border border-zinc-800 p-4">
            <p className="text-xs font-semibold text-zinc-400">BAJAS</p>
            <p className="text-2xl font-black text-rose-400 mt-1">{stats.out}</p>
          </div>
          <div className="rounded-3xl bg-zinc-900 border border-zinc-800 p-4">
            <p className="text-xs font-semibold text-zinc-400">POLIVALENTES</p>
            <p className="text-2xl font-black text-amber-300 mt-1">{stats.poly}</p>
          </div>
        </section>

        {/* ---------- Filtros rápidos por demarcación ---------- */}
        <section aria-label="Filtros por demarcación">
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {[{ key: "ALL", label: "Todos" }, ...POSITION_GROUPS].map((chip) => {
              const active = filter === chip.key;
              return (
                <button
                  key={chip.key}
                  onClick={() => setFilter(chip.key)}
                  aria-pressed={active}
                  className={`shrink-0 min-h-[44px] px-4 py-2 rounded-full border text-sm font-bold transition ${
                    active
                      ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {chip.label}
                  <span className={`ml-1.5 text-xs font-black ${active ? "text-emerald-400/80" : "text-zinc-600"}`}>
                    {counts[chip.key] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ---------- Tarjetas ---------- */}
        <section aria-label="Listado de jugadores" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.length === 0 && (
            <p className="col-span-full rounded-3xl border border-dashed border-zinc-800 px-6 py-10 text-center text-zinc-500">
              No hay jugadores en esta demarcación.{" "}
              <span className="text-zinc-400">Importa la plantilla con el botón de arriba.</span>
            </p>
          )}
          {filtered.map((p) => {
            const statusMeta = PLAYER_STATUS_META[p.status] ?? PLAYER_STATUS_META.AVAILABLE;
            return (
              <button
                key={p.id}
                onClick={() => openEditor(p)}
                className="w-full rounded-3xl border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-zinc-600 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                aria-label={`Editar ficha de ${p.firstName} ${p.lastName}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-lg font-black text-zinc-100 shrink-0">
                    {p.shirtNumber ?? "–"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-zinc-50 truncate">
                        {p.firstName} {p.lastName}
                      </p>
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusMeta.dot}`}
                        title={statusMeta.label}
                        aria-label={statusMeta.label}
                      />
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge
                        variant="outline"
                        className="rounded-lg bg-emerald-500/10 text-emerald-300 border-emerald-500/30 font-black"
                      >
                        {p.mainPosition}
                      </Badge>
                      <span className="text-xs text-zinc-500">{POSITION_LABEL[p.mainPosition] ?? p.mainPosition}</span>
                      {p.status !== "AVAILABLE" && (
                        <Badge variant="outline" className={`rounded-lg ${statusMeta.chip}`}>
                          {statusMeta.label}
                        </Badge>
                      )}
                    </div>
                    {p.secondaryPositions.length > 0 && (
                      <p className="text-xs mt-1.5 flex items-center gap-1 flex-wrap">
                        <span className="text-zinc-500 font-semibold">Polivalente:</span>
                        {p.secondaryPositions.map((s) => (
                          <span
                            key={s}
                            title={POSITION_LABEL[s] ?? s}
                            className="rounded-md bg-zinc-800 px-1.5 py-0.5 font-bold text-amber-200/90"
                          >
                            {s}
                          </span>
                        ))}
                      </p>
                    )}
                    {p.statusNote && (
                      <p className="text-xs italic text-amber-300/80 mt-1 truncate">{p.statusNote}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <RatingBar label="TÉC" value={p.technicalRating} />
                  <RatingBar label="TAC" value={p.tacticalRating} />
                  <RatingBar label="FÍS" value={p.physicalRating} />
                </div>
              </button>
            );
          })}
        </section>
      </div>

      {/* ---------- Editor rápido (hoja inferior táctil) ---------- */}
      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent
          side="bottom"
          className="bg-zinc-900 border-zinc-800 rounded-t-3xl max-h-[92vh] overflow-y-auto px-4 pb-10 pt-2"
        >
          <SheetHeader className="text-left pb-1">
            <SheetTitle className="text-xl font-black text-zinc-50">
              {editing?.firstName} {editing?.lastName}
            </SheetTitle>
            <SheetDescription className="text-zinc-400 text-sm">
              {editing?.shirtNumber != null ? `Dorsal ${editing.shirtNumber} · ` : ""}
              {POSITION_LABEL[editing?.mainPosition ?? "CF"] ?? ""}
              {editing?.secondaryPositions.length
                ? ` · polivalente: ${editing.secondaryPositions.join(", ")}`
                : ""}
            </SheetDescription>
          </SheetHeader>

          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-3 mb-2">
            Estado de disponibilidad
          </p>
          <div className="grid grid-cols-2 gap-2">
            {STATUSES.map((s) => {
              const meta = PLAYER_STATUS_META[s];
              const selected = draft?.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDraft((d) => (d ? { ...d, status: s } : d))}
                  aria-pressed={selected}
                  className={`min-h-[52px] rounded-2xl border px-3 py-2.5 text-sm font-bold transition ${
                    selected ? meta.chip : "bg-zinc-800/60 border-zinc-800 text-zinc-400"
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>

          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-5 mb-2">
            Perfiles (1–5)
          </p>
          <div className="space-y-2">
            <Stepper
              label="Técnico"
              value={draft?.technicalRating ?? null}
              onChange={(v) => setDraft((d) => (d ? { ...d, technicalRating: v } : d))}
            />
            <Stepper
              label="Táctico"
              value={draft?.tacticalRating ?? null}
              onChange={(v) => setDraft((d) => (d ? { ...d, tacticalRating: v } : d))}
            />
            <Stepper
              label="Físico"
              value={draft?.physicalRating ?? null}
              onChange={(v) => setDraft((d) => (d ? { ...d, physicalRating: v } : d))}
            />
          </div>

          <Input
            className="mt-4 min-h-[48px] rounded-2xl bg-zinc-800/60 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
            placeholder="Apunte corto (molestias, rol esta semana…)"
            maxLength={200}
            value={draft?.statusNote ?? ""}
            onChange={(e) => setDraft((d) => (d ? { ...d, statusNote: e.target.value } : d))}
          />

          <Button
            onClick={saveEditor}
            disabled={saving}
            className="mt-4 w-full min-h-[56px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-base"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
            ) : (
              <>
                <UserCog className="w-5 h-5" aria-hidden /> Guardar cambios
              </>
            )}
          </Button>
        </SheetContent>
      </Sheet>

    </div>
  );
}
