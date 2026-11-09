"use client";

// ============================================================================
// PILAR 2 — ALTA MANUAL DE JUGADOR (diálogo)
// ----------------------------------------------------------------------------
// Complemento de la importación masiva: para cuando llega un jugador suelto
// y no merece la pena re-importar el CSV. Perfil pre-partido completo desde
// el primer día (RPE, lesiones, académico, fortaleza) + demarcaciones.
// ============================================================================

import { useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PositionPicker } from "@/components/players/position-picker";
import { createPlayer } from "@/app/dashboard/players/actions";
import { RPE_MAX, RPE_MIN } from "@/lib/squad-import";
import { useToast } from "@/hooks/use-toast";

export function NewPlayerDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    shirtNumber: "",
    primaryPosition: "CM",
    secondary: [] as string[],
    fatigueRPE: "",
    medicalNotes: "",
    academicStress: "",
    tacticalStrength: "",
  });
  const { toast } = useToast();

  function reset() {
    setForm({
      firstName: "",
      lastName: "",
      shirtNumber: "",
      primaryPosition: "CM",
      secondary: [],
      fatigueRPE: "",
      medicalNotes: "",
      academicStress: "",
      tacticalStrength: "",
    });
    setError(null);
  }

  function submit() {
    if (pending) return;
    setError(null);
    const rpeTrim = form.fatigueRPE.trim();
    startTransition(async () => {
      const res = await createPlayer({
        firstName: form.firstName,
        lastName: form.lastName,
        shirtNumber: form.shirtNumber.trim() === "" ? null : Number(form.shirtNumber),
        primaryPosition: form.primaryPosition,
        secondaryPositions: form.secondary,
        fatigueRPE: rpeTrim === "" ? null : Number(rpeTrim),
        medicalNotes: form.medicalNotes.trim() || null,
        academicStress: form.academicStress.trim() || null,
        tacticalStrength: form.tacticalStrength.trim() || null,
      });
      if (res.ok) {
        toast({
          title: "Jugador creado",
          description: `${form.firstName} ${form.lastName} ya está en la plantilla.`,
          duration: 2200,
        });
        reset();
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          className="min-h-[48px] rounded-2xl bg-brand-600 hover:bg-brand-400 text-cream font-black"
          aria-label="Añadir jugador nuevo"
        >
          <UserPlus className="w-5 h-5" aria-hidden />
          <span>Nuevo</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white border-cream-border rounded-3xl max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-peel text-lg font-black">Nuevo jugador</DialogTitle>
          <DialogDescription className="text-[#5d7263] text-sm">
            Alta rápida con su perfil pre-partido completo. Los campos de
            decisión (RPE, lesiones, académico) puedes dejarlos vacíos y
            completarlos después en su ficha.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="np-first" className="text-xs font-bold text-[#6c8070] uppercase tracking-widest">
                Nombre *
              </Label>
              <Input
                id="np-first"
                className="mt-1 min-h-[48px] rounded-2xl bg-cream-dark/70 border-cream-border-strong text-peel placeholder:text-[#8a9a8d]"
                placeholder="Nombre"
                maxLength={60}
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="np-last" className="text-xs font-bold text-[#6c8070] uppercase tracking-widest">
                Apellidos
              </Label>
              <Input
                id="np-last"
                className="mt-1 min-h-[48px] rounded-2xl bg-cream-dark/70 border-cream-border-strong text-peel placeholder:text-[#8a9a8d]"
                placeholder="Apellidos"
                maxLength={60}
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="np-shirt" className="text-xs font-bold text-[#6c8070] uppercase tracking-widest">
                Dorsal (opcional)
              </Label>
              <Input
                id="np-shirt"
                inputMode="numeric"
                className="mt-1 min-h-[48px] rounded-2xl bg-cream-dark/70 border-cream-border-strong text-peel placeholder:text-[#8a9a8d]"
                placeholder="0-999"
                maxLength={3}
                value={form.shirtNumber}
                onChange={(e) => setForm((f) => ({ ...f, shirtNumber: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
            <div>
              <Label htmlFor="np-rpe" className="text-xs font-bold text-[#6c8070] uppercase tracking-widest">
                RPE actual (1-{RPE_MAX})
              </Label>
              <Input
                id="np-rpe"
                inputMode="numeric"
                className="mt-1 min-h-[48px] rounded-2xl bg-cream-dark/70 border-cream-border-strong text-peel placeholder:text-[#8a9a8d]"
                placeholder={`1-${RPE_MAX}, vacío = sin marcar`}
                maxLength={2}
                value={form.fatigueRPE}
                onChange={(e) => setForm((f) => ({ ...f, fatigueRPE: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
          </div>

          <PositionPicker
            main={form.primaryPosition}
            secondary={form.secondary}
            onMainChange={(p) =>
              setForm((f) => ({ ...f, primaryPosition: p, secondary: f.secondary.filter((s) => s !== p) }))
            }
            onToggleSecondary={(p) =>
              setForm((f) => ({
                ...f,
                secondary: f.secondary.includes(p)
                  ? f.secondary.filter((s) => s !== p)
                  : [...f.secondary, p],
              }))
            }
          />

          <div>
            <Label htmlFor="np-injury" className="text-xs font-bold text-[#6c8070] uppercase tracking-widest">
              Lesiones activas / precauciones médicas
            </Label>
            <Textarea
              id="np-injury"
              className="mt-1 min-h-[64px] rounded-2xl bg-cream-dark/70 border-cream-border-strong text-peel placeholder:text-[#8a9a8d]"
              placeholder="Ej.: esguince de tobillo derecho, alta prevista en 3 semanas"
              maxLength={500}
              value={form.medicalNotes}
              onChange={(e) => setForm((f) => ({ ...f, medicalNotes: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="np-academic" className="text-xs font-bold text-[#6c8070] uppercase tracking-widest">
              Horarios / estrés académico
            </Label>
            <Textarea
              id="np-academic"
              className="mt-1 min-h-[64px] rounded-2xl bg-cream-dark/70 border-cream-border-strong text-peel placeholder:text-[#8a9a8d]"
              placeholder="Ej.: exámenes esta semana, llega tarde los martes"
              maxLength={500}
              value={form.academicStress}
              onChange={(e) => setForm((f) => ({ ...f, academicStress: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="np-tacticalStrength" className="text-xs font-bold text-[#6c8070] uppercase tracking-widest">
              Fortaleza principal
            </Label>
            <Input
              id="np-tacticalStrength"
              className="mt-1 min-h-[48px] rounded-2xl bg-cream-dark/70 border-cream-border-strong text-peel placeholder:text-[#8a9a8d]"
              placeholder="Ej.: desmarque al espacio"
              maxLength={500}
              value={form.tacticalStrength}
              onChange={(e) => setForm((f) => ({ ...f, tacticalStrength: e.target.value }))}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-[#b4232a]">
              {error}
            </p>
          )}

          <Button
            onClick={submit}
            disabled={pending || form.firstName.trim().length === 0}
            className="w-full min-h-[56px] rounded-2xl bg-brand-600 hover:bg-brand-400 text-cream font-black text-base"
          >
            {pending ? (
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
            ) : (
              <>
                <UserPlus className="w-5 h-5" aria-hidden /> Crear jugador
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
