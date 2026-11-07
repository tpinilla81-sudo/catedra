// Raíz "/" — punto de entrada único (Modo Vestuario).
// Sin sesión → login con un toque. Con sesión:
//   • PLATFORM_ADMIN (sin club) → Cátedra global /dashboard/catedra
//   • Rol de club → Vista Hoy
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { LoginView } from "@/components/hoy/login-view";
import { HoyView } from "@/components/hoy/hoy-view";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user?.id) return <LoginView />;
  // El PLATFORM_ADMIN gestiona la Cátedra global: nunca debe ver el login
  // (antes quedaba atrapado aquí por no tener clubId).
  if (user.role === "PLATFORM_ADMIN") redirect("/dashboard/catedra");
  if (!user.clubId) return <LoginView />;
  return <HoyView />;
}
