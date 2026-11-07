// Vista "Hoy" — /dashboard/today
// Requiere sesión (middleware). Sin sesión redirige a la raíz (login).
import { HoyView } from "@/components/hoy/hoy-view";

export const dynamic = "force-dynamic";

export default function TodayPage() {
  return <HoyView />;
}
