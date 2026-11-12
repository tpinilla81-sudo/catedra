"use client";

// ============================================================================
// APP SHELL — CATEDRA by Método
// ----------------------------------------------------------------------------
// Menú lateral SOLO con los nombres de las secciones (sin etiquetas de pilar):
//   Hoy · Biblioteca · Plantilla · Partidos · Pizarra Táctica.
//   (mock del míster: la pizarra sale de los partidos y es pestaña global)
//   La Cátedra aparece solo para PLATFORM_ADMIN (contexto de plataforma).
// • Desktop (lg+): sidebar fijo verde corteza + contenido fijo en viewport:
//   SIN scroll de página (cada sección compone su interior).
// • Móvil: barra superior con logo + wordmark y drawer (Sheet) lateral.
// El contenido de cada página se renderiza dentro del shell (children).
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  FileText,
  Home,
  Landmark,
  LogOut,
  Menu,
  Presentation,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export type AppShellKey =
  | "cualitativo"
  | "cuantitativo"
  | "today"
  | "library"
  | "players"
  | "matches"
  | "pizarra";

type Props = {
  active: AppShellKey;
  userName: string;
  role: string;
  /** Partidos con ingesta pendiente (badge de Partidos) */
  pendingIngest?: number;
  children: React.ReactNode;
};

const ROLE_LABELS: Record<string, string> = {
  COACH_ADMIN: "Míster",
  ANALYST: "Analista",
  PLATFORM_ADMIN: "Plataforma",
};

const NAV_ITEMS: Array<{
  key: AppShellKey;
  href: string;
  label: string;
  icon: typeof Home;
}> = [
  // Herramientas de análisis (mock del míster: «Análisis Cualitativo» SUSTITUYE
  // a Suite Táctica y «Análisis Cuantitativo» entra JUSTO DEBAJO).
  { key: "cualitativo", href: "/dashboard/analisis-cualitativo", label: "Análisis Cualitativo", icon: FileText },
  { key: "cuantitativo", href: "/dashboard/analisis-cuantitativo", label: "Análisis Cuantitativo", icon: BarChart3 },
  { key: "today", href: "/dashboard/today", label: "Hoy", icon: Home },
  { key: "library", href: "/dashboard/library", label: "Biblioteca", icon: BookOpen },
  { key: "players", href: "/dashboard/players", label: "Plantilla", icon: Users },
  { key: "matches", href: "/dashboard/matches", label: "Partidos", icon: CalendarDays },
  { key: "pizarra", href: "/dashboard/pizarra", label: "Pizarra Táctica", icon: Presentation },
];

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3 shrink-0" aria-label="Inicio CATEDRA by Método">
      <img src="/logo.svg" alt="" className={compact ? "w-9 h-9" : "w-12 h-12"} />
      <span className="leading-none">
        <span className={`block font-black tracking-tight ${compact ? "text-lg" : "text-2xl"}`}>
          CÁTEDRA
        </span>
        <span className="block text-[10px] font-bold uppercase tracking-[0.28em] mt-1">
          by Método
        </span>
      </span>
    </Link>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function NavList({ active, pendingIngest, onNavigate }: {
  active: AppShellKey;
  pendingIngest?: number;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-1.5 px-3">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex items-center gap-3 min-h-[52px] px-4 rounded-2xl font-bold text-[15px] transition-colors ${
              isActive
                ? "bg-[#1f7a3d] text-[#f5f2e4] shadow-sm"
                : "text-[#c9d6c4] hover:bg-white/5 hover:text-[#f5f2e4]"
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-7 rounded-full bg-[#a8d878]" aria-hidden />
            )}
            <Icon className="w-5 h-5 shrink-0" aria-hidden />
            {item.label}
            {item.key === "matches" && (pendingIngest ?? 0) > 0 && (
              <span
                className="ml-auto flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-[#a8d878] text-[10px] font-black text-[#123a20]"
                title={`${pendingIngest} ingesta${pendingIngest! > 1 ? "s" : ""} pendiente${pendingIngest! > 1 ? "s" : ""}`}
              >
                {pendingIngest}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ active, userName, role, pendingIngest, onNavigate }: {
  active: AppShellKey;
  userName: string;
  role: string;
  pendingIngest?: number;
  onNavigate?: () => void;
}) {
  return (
    <div className="h-full flex flex-col bg-[#123a20]">
      <div className="px-6 pt-7 pb-6 text-[#f5f2e4]">
        <Wordmark />
        <p className="mt-4 text-xs text-[#9db29a] leading-snug">
          El ecosistema del cuerpo técnico
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <NavList active={active} pendingIngest={pendingIngest} onNavigate={onNavigate} />
        {role === "PLATFORM_ADMIN" && (
          <div className="px-3 mt-4">
            <Link
              href="/dashboard/catedra"
              onClick={onNavigate}
              className="flex items-center gap-3 min-h-[52px] px-4 rounded-2xl font-bold text-[15px] text-[#c9d6c4] hover:bg-white/5 hover:text-[#f5f2e4] transition-colors"
            >
              <Landmark className="w-5 h-5 shrink-0" aria-hidden />
              La Cátedra
              <span className="ml-auto text-[10px] font-black tracking-wider rounded-full px-2 py-0.5 bg-white/5 text-[#9db29a]">
                GLOBAL
              </span>
            </Link>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-[#a8d878] text-[#123a20] font-black flex items-center justify-center shrink-0">
            {initials(userName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[#f5f2e4] truncate leading-tight">
              {userName}
            </span>
            <span className="block text-xs font-semibold text-[#a8d878] mt-0.5">
              {ROLE_LABELS[role] ?? role}
            </span>
          </span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="h-11 w-11 rounded-2xl text-[#c9d6c4] hover:bg-white/5 hover:text-[#f5f2e4] flex items-center justify-center transition-colors"
          >
            <LogOut className="w-5 h-5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ active, userName, role, pendingIngest, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    // Shell FIJO en viewport: la página nunca hace scroll — el scroll interno
    // lo decide cada sección dentro de su panel (cabecera y menú siempre visibles).
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-cream lg:block">
      {/* ---------- Sidebar fijo (desktop) ---------- */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[272px] z-40">
        <SidebarBody
          active={active}
          userName={userName}
          role={role}
          pendingIngest={pendingIngest}
        />
      </aside>

      {/* ---------- Barra superior con drawer (móvil) ---------- */}
      <div className="lg:hidden flex-none z-40 border-b border-cream-border bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 h-16 text-peel">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            className="h-11 w-11 -ml-2 rounded-2xl flex items-center justify-center hover:bg-cream-dark transition-colors"
          >
            <Menu className="w-6 h-6" aria-hidden />
          </button>
          <div className="text-peel">
            <Wordmark compact />
          </div>
          <span className="w-9" aria-hidden />
        </div>
      </div>

      {/* ---------- Contenido (panel interno con scroll propio) ---------- */}
      <div className="flex-1 overflow-y-auto overscroll-contain lg:h-[100dvh] lg:flex-none lg:pl-[272px]">
        {children}
      </div>

      {/* ---------- Drawer móvil ---------- */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="p-0 w-[290px] border-none bg-[#123a20] [&>button]:text-[#f5f2e4]"
        >
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SidebarBody
            active={active}
            userName={userName}
            role={role}
            pendingIngest={pendingIngest}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
