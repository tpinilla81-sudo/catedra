// PROBE 2 — Reproducir la condición de carrera de runWeeklyProposalPipeline
// 5 intentos, cada uno en una semana ISO distinta, con clubes efímeros.
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createTenantClient } from "../src/lib/tenant";
import { db } from "../src/lib/db";
import { runWeeklyProposalPipeline } from "../src/lib/engine/pipeline";
import { mondayOf } from "../src/lib/engine/diagnose";
import { addWeeks } from "./probe-helpers";

function ensureUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/metodo";
  }
}
ensureUrl();

const TAG = `zzz-race-${randomUUID().slice(0, 8)}`;

async function main() {
  const club = await db.club.create({ data: { name: "Race Club", slug: TAG } });
  const season = await db.season.create({
    data: { clubId: club.id, name: "2026/27", startDate: new Date(), endDate: new Date() },
  });
  const team = await db.team.create({
    data: { clubId: club.id, seasonId: season.id, name: "Race Team" },
  });
  const client = createTenantClient(club.id) as unknown as PrismaClient;

  let reproduced = 0;
  let serialized = 0;
  let other = 0;
  try {
    for (let i = 0; i < 5; i++) {
      const weekStart = addWeeks(mondayOf(new Date()), 1 + i); // semanas futuras distintas
      const [r1, r2] = await Promise.allSettled([
        runWeeklyProposalPipeline(client, { clubId: club.id, teamId: team.id, weekStart }),
        runWeeklyProposalPipeline(client, { clubId: club.id, teamId: team.id, weekStart }),
      ]);
      const rejected = [r1, r2].filter((r) => r.status === "rejected");
      if (rejected.length === 0) {
        const oneCreated =
          (r1.status === "fulfilled" && r1.value.created) ||
          (r2.status === "fulfilled" && r2.value.created);
        if (oneCreated) serialized++;
        else other++;
      } else {
        const err = (rejected[0] as PromiseRejectedResult).reason as Error;
        if (err.message.includes("Unique constraint")) reproduced++;
        else other++;
        console.log(`  intento ${i + 1}: rechazado → ${err.message.slice(0, 100)}`);
      }
    }
  } finally {
    await db.engineRun.deleteMany({ where: { clubId: club.id } });
    await db.microcycle.deleteMany({ where: { clubId: club.id } });
    await db.team.delete({ where: { id: team.id } });
    await db.season.delete({ where: { id: season.id } });
    await db.club.delete({ where: { id: club.id } });
  }
  console.log(`\nRESULTADO CARRERA: reproducida=${reproduced}/5 · serializada=${serialized}/5 · otro=${other}/5`);
  if (reproduced > 0) {
    console.log("🚨 CONFIRMADO: dos ensureWeeklyProposal concurrentes → P2002 sin capturar (500 al usuario).");
  } else {
    console.log("⚠️ No reproducida en esta muestra: la ventana TOCTOU existe en el código (findUnique → ...pipeline... → create), pero Prisma serializó las llamadas en este entorno. Riesgo latente bajo concurrencia real (varios dispositivos).");
  }
}

main()
  .catch((e) => { console.error("FATAL:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
