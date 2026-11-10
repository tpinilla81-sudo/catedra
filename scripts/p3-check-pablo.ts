// Lee el estado persistido de Pablo Ferrer tras el test visual
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const pablo = await db.player.findFirst({
  where: { lastName: { contains: "Ferrer" } },
  select: { id: true, firstName: true, lastName: true },
});

if (!pablo) {
  console.log("Pablo Ferrer no encontrado");
  process.exit(0);
}

const ev = await db.liveMatchEvaluation.findFirst({
  where: { playerId: pablo.id },
  orderBy: { statusUpdatedAt: "desc" },
});

const fatigueEvents = await db.matchTelemetryEvent.findMany({
  where: { playerId: pablo.id, type: "FATIGUE" },
  orderBy: { timestamp: "desc" },
  take: 3,
  select: { minute: true, value: true, timestamp: true },
});

console.log(
  JSON.stringify(
    {
      player: `${pablo.firstName} ${pablo.lastName}`,
      evaluation: ev
        ? {
            isStarter: ev.isStarter,
            fatigueFlag: ev.fatigueFlag,
            clinicalFlag: ev.clinicalFlag,
            tacticalFlag: ev.tacticalFlag,
            statusUpdatedAt: ev.statusUpdatedAt?.toISOString(),
          }
        : null,
      lastFatigueEvents: fatigueEvents.map((e) => ({
        minute: e.minute,
        value: e.value,
        at: e.timestamp.toISOString(),
      })),
    },
    null,
    2,
  ),
);
await db.$disconnect();
