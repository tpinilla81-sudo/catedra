"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

type Props = {
  userName: string;
  role: string;
};

const ROLE_LABELS: Record<string, string> = {
  COACH_ADMIN: "Míster",
  ANALYST: "Analista",
  PLATFORM_ADMIN: "Plataforma",
};

export function UserMenu({ userName, role }: Props) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-right hidden sm:block">
        <p className="text-sm font-semibold text-zinc-200 leading-tight">
          {userName}
        </p>
        <p className="text-xs text-emerald-400 font-medium">
          {ROLE_LABELS[role] ?? role}
        </p>
      </div>
      <Button
        variant="outline"
        size="icon"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="h-11 w-11 rounded-2xl border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
      >
        <LogOut className="w-5 h-5" aria-hidden />
      </Button>
    </div>
  );
}
