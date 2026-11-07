// ============================================================================
// VERIFICACIÓN DE SEED — conteos por tabla clave + usuarios de login.
// Se ejecuta con `bun scripts/check-seed.ts` contra la BD local (:5432).
// Solo lectura: count() + findMany de emails/roles.
// ============================================================================
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const counts = {
  clubs: await db.club.count(),
  users: await db.user.count(),
  teams: await db.team.count(),
  players: await db.player.count(),
  tasks: await db.task.count(),
  subPrinciples: await db.subPrinciple.count(),
  matches: await db.match.count(),
  pulses: await db.teamPulse.count(),
  microcycles: await db.microcycle.count(),
  opponentReports: await db.opponentReport.count(),
  weaknesses: await db.opponentWeakness.count(),
  engineRuns: await db.engineRun.count(),
};
console.table(counts);

const users = await db.user.findMany({
  select: { email: true, role: true, club: { select: { name: true } } },
  orderBy: { email: "asc" },
});
for (const u of users) {
  console.log(`login → ${u.email}  ·  ${u.role}  ·  ${u.club?.name ?? "plataforma"}`);
}

await db.$disconnect();
