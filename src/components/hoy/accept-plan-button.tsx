"use client";

// [✅ Aceptar Plan] — la decisión del lunes con UN toque.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acceptPlan } from "@/app/dashboard/today/actions";
import { CheckCheck } from "lucide-react";

export function AcceptPlanButton({ microcycleId }: { microcycleId: string }) {
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

  return (
    <Button
      onClick={handleAccept}
      disabled={pending || done}
      className="w-full h-20 text-2xl font-black rounded-3xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/20 min-h-[44px]"
    >
      <CheckCheck className="w-7 h-7 mr-3" aria-hidden />
      {done ? "Plan aceptado" : pending ? "Aceptando…" : "✅ Aceptar Plan"}
    </Button>
  );
}
