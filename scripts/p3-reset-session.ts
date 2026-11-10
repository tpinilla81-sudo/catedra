// Limpia el estado en directo del partido de prueba para que el test de
// round-trip parta de cero (la .pgdata sobrevive entre ejecuciones).
// Elimina: bookmarks → eventos de telemetría → evaluaciones → sesión (1:1).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const match = await db.match.findFirst({
  orderBy: { kickoffAt: "desc" },
  select: { id: true, opponent: true },
});
if (!match) {
  console.error("sin partido de prueba");
  process.exit(1);
}

const session = await db.matchSession.findUnique({
  where: { matchId: match.id },
  select: { id: true },
});

if (session) {
  await db.videoBookmark.deleteMany({ where: { telemetryEvent: { matchId: match.id } } });
  const evs = await db.matchTelemetryEvent.deleteMany({ where: { matchId: match.id } });
  await db.matchTag.deleteMany({ where: { evaluation: { matchId: match.id } } });
  const evals = await db.liveMatchEvaluation.deleteMany({ where: { matchId: match.id } });
  await db.matchSession.delete({ where: { id: session.id } });
  console.log(
    `limpio: ${evs.count} eventos, ${evals.count} evaluaciones, sesión eliminada (${match.opponent})`,
  );
} else {
  console.log(`sin sesión previa (${match.opponent}) — nada que limpiar`);
}

await db.$disconnect();
