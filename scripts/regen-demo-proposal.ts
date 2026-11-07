// Regenera la propuesta PROPOSED del equipo demo con el motor v0.2 y la
// biblioteca limpia (sin material de test). Uso: bun scripts/regen-demo-proposal.ts
import { PrismaClient } from "@prisma/client";
import { createTenantClient } from "../src/lib/tenant";
import { mondayOf } from "../src/lib/utils/dates";
import { runWeeklyProposalPipeline } from "../src/lib/engine/pipeline";

const raw = new PrismaClient({ datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/metodo" } } });
const clubA = await raw.club.findUniqueOrThrow({ where: { slug: "cf-metodo" } });
const dbA = createTenantClient(clubA.id) as unknown as PrismaClient;

const team = await raw.team.findUniqueOrThrow({ where: { id: "cmw638dvj0008vc5j50ojth19" } }); // Primer Equipo
const weekStart = mondayOf(new Date()); // lunes-Madrid canónico

const old = await raw.microcycle.findUnique({
  where: { teamId_weekStart: { teamId: team.id, weekStart } },
});
if (old && old.status === "PROPOSED") {
  await raw.microcycle.delete({ where: { id: old.id } });
  console.log("microciclo PROPOSED anterior eliminado");
}

const result = await runWeeklyProposalPipeline(dbA, {
  clubId: clubA.id,
  teamId: team.id,
  weekStart,
});
console.log("regenerado:", {
  microcycleId: result.microcycleId,
  runId: result.runId,
  issues: result.issuesCount,
  prescripciones: result.prescriptions.map((p) => `${p.sessionLabel}: ${p.taskTitle}`),
  descartadas: result.discarded.length,
});

const mc = await raw.microcycle.findUniqueOrThrow({
  where: { id: result.microcycleId! },
  include: { sessions: { include: { tasks: { include: { task: { select: { title: true } } } } } } },
});
for (const s of mc.sessions) {
  console.log(`  ${s.label}: ${s.tasks.map((t) => t.task.title).join(" · ") || "— sin tareas —"}`);
}
await raw.$disconnect();
