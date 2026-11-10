// Obtiene ids reales del seed para los tests e2e del Pilar 3
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const match = await db.match.findFirst({
  orderBy: { kickoffAt: "desc" },
  select: { id: true, teamId: true, opponent: true, status: true },
});

const players = await db.player.findMany({
  where: { teamId: match?.teamId, isActive: true },
  orderBy: { shirtNumber: "asc" },
  select: { id: true, firstName: true, lastName: true, primaryPosition: true },
  take: 4,
});

console.log(
  JSON.stringify({
    matchId: match?.id,
    opponent: match?.opponent,
    status: match?.status,
    teamId: match?.teamId,
    players,
  }),
);
await db.$disconnect();
