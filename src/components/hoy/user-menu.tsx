"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { FlaskConical, LogOut } from "lucide-react";

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
        <p className="text-sm font-semibold text-[#2a4630] leading-tight">
          {userName}
        </p>
        <p className="text-xs text-brand-600 font-medium">
          {ROLE_LABELS[role] ?? role}
        </p>
      </div>
      {role !== "ANALYST" && (
        <Link
          href="/dashboard/quality"
          aria-label="Panel de validación E2E"
          title="Panel de validación E2E"
          className="h-11 w-11 rounded-2xl border border-cream-border-strong text-[#5d7263] hover:bg-cream-dark hover:text-peel flex items-center justify-center"
        >
          <FlaskConical className="w-5 h-5" aria-hidden />
        </Link>
      )}
      <Button
        variant="outline"
        size="icon"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="h-11 w-11 rounded-2xl border-cream-border-strong text-[#3d5844] hover:bg-cream-dark hover:text-peel"
      >
        <LogOut className="w-5 h-5" aria-hidden />
      </Button>
    </div>
  );
}
