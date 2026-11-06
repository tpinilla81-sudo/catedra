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
import { Goal, LockKeyhole, Mail, UserRound } from "lucide-react";

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
      router.push("/dashboard/today");
      router.refresh();
    });
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-zinc-950">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="mx-auto w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <Goal className="w-10 h-10 text-emerald-400" aria-hidden />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-zinc-50">
            MÉTODO
          </h1>
          <p className="text-zinc-400">
            El ecosistema del cuerpo técnico
          </p>
        </div>

        <form
          className="space-y-5 rounded-3xl border border-zinc-800 bg-zinc-900 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-300 flex items-center gap-2">
              <Mail className="w-4 h-4 text-zinc-500" aria-hidden />
              Email del cuerpo técnico
            </Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 text-lg rounded-2xl bg-zinc-950 border-zinc-700"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-300 flex items-center gap-2">
              <LockKeyhole className="w-4 h-4 text-zinc-500" aria-hidden />
              Contraseña
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-14 text-lg rounded-2xl bg-zinc-950 border-zinc-700"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="w-full h-16 text-xl font-bold rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 min-h-[44px]"
          >
            <UserRound className="w-6 h-6 mr-2" aria-hidden />
            {pending ? "Entrando…" : "Entrar al vestuario"}
          </Button>
        </form>

        <div className="text-center text-sm text-zinc-500 space-y-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="font-semibold text-zinc-400">Acceso demo (Fase 1)</p>
          <p>Míster · mister@cfmetodo.es · metodo2025</p>
          <p>Analista · analista@cfmetodo.es · metodo2025</p>
        </div>
      </div>
    </main>
  );
}
