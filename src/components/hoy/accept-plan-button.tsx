"use client";

// [✅ Aceptar Plan] — la decisión del lunes con UN toque.
// Variante compact para la zona fija (sticky master) de Hoy.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acceptPlan } from "@/app/dashboard/today/actions";
import { CheckCheck } from "lucide-react";

export function AcceptPlanButton({
  microcycleId,
  compact = false,
}: {
  microcycleId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const handleAccept = () => {
    startTransition(async () => {
      const res = await acceptPlan(microcycleId);
      if (res.ok) {
        setDone(true);
        toast.success("Plan aceptado. ¡A entrenar!", {
          description: "El microciclo queda bloqueado como plan de la semana.",
        });
        router.refresh();
      } else {
        toast.error("No se pudo aceptar el plan");
      }
    });
  };

  if (compact) {
    return (
      <Button
        onClick={handleAccept}
        disabled={pending || done}
        className="h-11 px-4 text-sm font-black rounded-2xl bg-brand-600 hover:bg-brand text-white shadow-md shadow-brand-600/25 min-h-[44px]"
      >
        <CheckCheck className="w-4 h-4 mr-1.5" aria-hidden />
        {done ? "Aceptado" : pending ? "Aceptando…" : "Aceptar Plan"}
      </Button>
    );
  }

  return (
    <Button
      onClick={handleAccept}
      disabled={pending || done}
      className="w-full h-20 text-2xl font-black rounded-3xl bg-brand-600 hover:bg-brand text-white shadow-lg shadow-brand-600/25 min-h-[44px]"
    >
      <CheckCheck className="w-7 h-7 mr-3" aria-hidden />
      {done ? "Plan aceptado" : pending ? "Aceptando…" : "✅ Aceptar Plan"}
    </Button>
  );
}
