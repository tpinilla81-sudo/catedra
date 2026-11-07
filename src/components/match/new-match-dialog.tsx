"use client";

// ============================================================================
// PILAR 3 — NUEVO PARTIDO (alta exprés con un toque)
// ----------------------------------------------------------------------------
// • Botón "+ Nuevo" en la cabecera de Partidos → hoja de alta táctil.
// • Mínimo campos: rival, fecha, hora y casa/fuera. Competición y lugar
//   opcionales. Cero fricción: al crear salta directo a la ingesta de 3 pasos
//   (semáforo → pizarra táctica sobre el campo → cuaderno).
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMatch } from "@/app/dashboard/matches/actions";

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function NewMatchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("17:30");
  const [isHome, setIsHome] = useState(true);
  const [competition, setCompetition] = useState("");
  const [location, setLocation] = useState("");

  function reset() {
    setOpponent("");
    setDate(todayISO());
    setTime("17:30");
    setIsHome(true);
    setCompetition("");
    setLocation("");
    setError(null);
  }

  function submit() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await createMatch({
        opponent,
        date,
        time,
        isHome,
        competition: competition || undefined,
        location: location || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      reset();
      // Directo a la ingesta del partido recién creado (flujo de 3 pasos).
      router.push(`/dashboard/match?g=${res.matchId}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          className="min-h-[48px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black border border-emerald-400/60"
          aria-label="Crear partido nuevo"
        >
          <Plus className="w-5 h-5" aria-hidden />
          <span className="hidden sm:inline">Nuevo partido</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-zinc-900 border-zinc-800 rounded-3xl max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle className="text-zinc-50 text-lg font-black">
            Nuevo partido
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            Date de alta en 20 segundos. Al crear, pasas directo a la ingesta:
            semáforo, pizarra táctica y cuaderno de notas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Rival */}
          <div className="space-y-2">
            <Label htmlFor="nm-opponent" className="text-zinc-300">
              Rival
            </Label>
            <Input
              id="nm-opponent"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="Ej. Atlético Torrent"
              maxLength={80}
              className="h-12 rounded-2xl bg-zinc-950 border-zinc-700 text-zinc-100"
            />
          </div>

          {/* Fecha + Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="nm-date" className="text-zinc-300">
                Fecha
              </Label>
              <Input
                id="nm-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-12 rounded-2xl bg-zinc-950 border-zinc-700 text-zinc-100 [color-scheme:dark]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nm-time" className="text-zinc-300">
                Hora
              </Label>
              <Input
                id="nm-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-12 rounded-2xl bg-zinc-950 border-zinc-700 text-zinc-100 [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Casa / Fuera */}
          <div className="space-y-2">
            <Label className="text-zinc-300">Condición</Label>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Condición del partido">
              <button
                type="button"
                onClick={() => setIsHome(true)}
                aria-pressed={isHome}
                className={`min-h-[48px] rounded-2xl border font-bold transition ${
                  isHome
                    ? "bg-emerald-500/15 border-emerald-400/60 text-emerald-300"
                    : "bg-zinc-950 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                En casa
              </button>
              <button
                type="button"
                onClick={() => setIsHome(false)}
                aria-pressed={!isHome}
                className={`min-h-[48px] rounded-2xl border font-bold transition ${
                  !isHome
                    ? "bg-amber-500/15 border-amber-400/60 text-amber-300"
                    : "bg-zinc-950 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Fuera
              </button>
            </div>
          </div>

          {/* Competición + Lugar (opcionales) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="nm-comp" className="text-zinc-300">
                Competición <span className="text-zinc-600">(opcional)</span>
              </Label>
              <Input
                id="nm-comp"
                value={competition}
                onChange={(e) => setCompetition(e.target.value)}
                placeholder="Liga · Jornada 12"
                maxLength={60}
                className="h-12 rounded-2xl bg-zinc-950 border-zinc-700 text-zinc-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nm-loc" className="text-zinc-300">
                Lugar <span className="text-zinc-600">(opcional)</span>
              </Label>
              <Input
                id="nm-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Campo municipal"
                maxLength={80}
                className="h-12 rounded-2xl bg-zinc-950 border-zinc-700 text-zinc-100"
              />
            </div>
          </div>

          {/* Error inline */}
          {error && (
            <p
              role="alert"
              className="rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-sm px-4 py-3"
            >
              {error}
            </p>
          )}

          {/* CTA */}
          <Button
            onClick={submit}
            disabled={pending || opponent.trim().length < 2}
            className="w-full min-h-[56px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-lg font-black"
          >
            {pending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> Creando…
              </>
            ) : (
              "Crear partido y registrar ingesta"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
