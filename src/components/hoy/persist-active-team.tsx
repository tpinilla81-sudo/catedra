"use client";

// Persistencia silenciosa del último equipo activo (lastTeamId).
// Al reentrar, el míster cae directamente en su equipo — fricción cero.
import { useEffect, useRef } from "react";
import { setActiveTeam } from "@/app/dashboard/today/actions";

export function PersistActiveTeam({ teamId }: { teamId: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    setActiveTeam(teamId).catch(() => {});
  }, [teamId]);
  return null;
}
