// Raíz "/" — punto de entrada único (Modo Vestuario).
// Sin sesión → login con un toque. Con sesión → Vista Hoy.
import { getSessionUser } from "@/lib/session";
import { LoginView } from "@/components/hoy/login-view";
import { HoyView } from "@/components/hoy/hoy-view";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user?.clubId) return <LoginView />;
  return <HoyView />;
}
