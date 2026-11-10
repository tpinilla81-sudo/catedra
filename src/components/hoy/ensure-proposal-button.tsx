"use client";

// Red de seguridad de la regla de oro: si por lo que sea no existe propuesta
// para esta semana, un solo toque la cocina desde los datos reales.
// Variante compact para la zona fija (sticky master) de Hoy.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ensureWeeklyProposal } from "@/app/dashboard/today/actions";
import { ChefHat } from "lucide-react";

export function EnsureProposalButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleCook = () => {
    startTransition(async () => {
      const res = await ensureWeeklyProposal();
      if (res.ok) {
        toast.success(res.created ? "Propuesta cocinada" : "Ya existía propuesta", {
          description: "Revisa el plan y acéptalo con un toque.",
        });
        router.refresh();
      } else {
        toast.error("No se pudo generar la propuesta");
      }
    });
  };

  if (compact) {
    return (
      <Button
        onClick={handleCook}
        disabled={pending}
        className="h-11 px-4 text-sm font-black rounded-2xl bg-[#e3a93c] hover:bg-[#d69a2d] text-peel shadow-md shadow-[#e3a93c]/30 min-h-[44px]"
      >
        <ChefHat className="w-4 h-4 mr-1.5" aria-hidden />
        {pending ? "Cocinando…" : "Cocinar propuesta"}
      </Button>
    );
  }

  return (
    <Button
      onClick={handleCook}
      disabled={pending}
      className="w-full h-20 text-xl font-bold rounded-3xl bg-[#e3a93c] hover:bg-[#d69a2d] text-peel shadow-lg shadow-[#e3a93c]/30 min-h-[44px]"
    >
      <ChefHat className="w-7 h-7 mr-3" aria-hidden />
      {pending ? "Cocinando la semana…" : "Cocinar propuesta del lunes"}
    </Button>
  );
}
