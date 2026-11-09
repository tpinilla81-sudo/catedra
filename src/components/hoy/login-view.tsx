"use client";

// Login Modo Vestuario: cero fricción — credenciales demo precargadas,
// botón gigante y un solo toque para entrar.
import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LockKeyhole, Mail, UserRound } from "lucide-react";

export function LoginView() {
  const router = useRouter();
  const [email, setEmail] = useState("mister@cfmetodo.es");
  const [password, setPassword] = useState("metodo2025");
  const [pending, startTransition] = useTransition();

  const handleLogin = () => {
    startTransition(async () => {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        toast.error("Credenciales incorrectas", {
          description: "Comprueba email y contraseña del cuerpo técnico.",
        });
        return;
      }
      toast.success("Bienvenido al vestuario");
      // La raíz enruta por rol: club → Hoy · PLATFORM_ADMIN → Cátedra
      router.push("/");
      router.refresh();
    });
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-cream">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <img
            src="/logo.svg"
            alt="Logotipo de CATEDRA by Método"
            className="mx-auto w-24 h-24 drop-shadow-sm"
          />
          <h1 className="text-4xl font-black tracking-tight text-peel leading-none">
            CÁTEDRA
          </h1>
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-brand-600">
            by Método
          </p>
          <p className="text-[#5d7263]">
            El ecosistema del cuerpo técnico
          </p>
        </div>

        <form
          className="space-y-5 rounded-3xl border border-cream-border bg-white p-6"
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[#3d5844] flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#6c8070]" aria-hidden />
              Email del cuerpo técnico
            </Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 text-lg rounded-2xl bg-cream border-cream-border-strong"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-[#3d5844] flex items-center gap-2">
              <LockKeyhole className="w-4 h-4 text-[#6c8070]" aria-hidden />
              Contraseña
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-14 text-lg rounded-2xl bg-cream border-cream-border-strong"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="w-full h-16 text-xl font-bold rounded-2xl bg-brand-600 hover:bg-brand text-white min-h-[44px]"
          >
            <UserRound className="w-6 h-6 mr-2" aria-hidden />
            {pending ? "Entrando…" : "Entrar al vestuario"}
          </Button>
        </form>

        <div className="text-center text-sm text-[#6c8070] space-y-1 rounded-2xl border border-cream-border bg-white/80 p-4">
          <p className="font-semibold text-[#5d7263]">Acceso demo (Fase 1)</p>
          <p>Míster · mister@cfmetodo.es · metodo2025</p>
          <p>Analista · analista@cfmetodo.es · metodo2025</p>
        </div>
      </div>
    </main>
  );
}
