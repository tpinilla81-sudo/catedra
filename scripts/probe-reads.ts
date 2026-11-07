// PROBE 3 — Verificación de LECTURAS y updates con where del guard (los caminos SÍ blindados)
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createTenantClient } from "../src/lib/tenant";
import { db } from "../src/lib/db";

function ensureUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/metodo";
  }
}
ensureUrl();

const TAG = `zzz-read-${randomUUID().slice(0, 8)}`;
let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  const clubA = await db.club.create({ data: { name: "Read A", slug: `${TAG}-a` } });
  const clubB = await db.club.create({ data: { name: "Read B", slug: `${TAG}-b` } });
  const seasonA = await db.season.create({ data: { clubId: clubA.id, name: "S", startDate: new Date(), endDate: new Date() } });
  const teamA = await db.team.create({ data: { clubId: clubA.id, seasonId: seasonA.id, name: "TA" } });
  const seasonB = await db.season.create({ data: { clubId: clubB.id, name: "S", startDate: new Date(), endDate: new Date() } });
  const teamB = await db.team.create({ data: { clubId: clubB.id, seasonId: seasonB.id, name: "TB" } });
  const playerB = await db.player.create({ data: { clubId: clubB.id, teamId: teamB.id, firstName: "P", lastName: "B", mainPosition: "CM" } });
  const matchB = await db.match.create({ data: { clubId: clubB.id, teamId: teamB.id, opponent: "Rival", kickoffAt: new Date() } });

  const A = createTenantClient(clubA.id) as unknown as PrismaClient;
  try {
    // Lectura findUnique de un partido ajeno
    const m = await A.match.findUnique({ where: { id: matchB.id } });
    check("findUnique match ajeno → null (no visible)", m === null);

    // Lectura de plantilla ajena
    const ps = await A.player.findMany({ where: { teamId: teamB.id } });
    check("findMany jugadores de otro club → vacío", ps.length === 0);

    // update where ajeno → debe fallar (P2025) y NO actualizar
    let blocked = false;
    try {
      await A.player.update({ where: { id: playerB.id }, data: { lastName: "HACKED" } });
    } catch (e) {
      blocked = true;
      check("update where ajeno rechazado", true, (e as Error).message.slice(0, 60));
    }
    if (!blocked) {
      const after = await db.player.findUnique({ where: { id: playerB.id } });
      if (after?.lastName === "HACKED") fail++;
      else pass++;
    }
    const after2 = await db.player.findUnique({ where: { id: playerB.id } });
    check("jugador B intacto tras intento de update desde A", after2?.lastName === "B");

    // delete ajeno
    let delBlocked = false;
    try {
      await A.player.delete({ where: { id: playerB.id } });
    } catch { delBlocked = true; }
    check("delete where ajeno rechazado", delBlocked);
    check("jugador B sigue existiendo", (await db.player.findUnique({ where: { id: playerB.id } })) !== null);

    // microciclo ajeno por unique compuesto
    const weekStart = new Date();
    const mcB = await db.microcycle.create({ data: { clubId: clubB.id, teamId: teamB.id, weekStart } });
    const mc = await A.microcycle.findUnique({ where: { teamId_weekStart: { teamId: teamB.id, weekStart } } });
    check("findUnique microciclo ajeno por compuesto → null", mc === null);
    await db.microcycle.delete({ where: { id: mcB.id } });
  } finally {
    await db.player.deleteMany({ where: { clubId: { in: [clubA.id, clubB.id] } } });
    await db.match.deleteMany({ where: { clubId: { in: [clubA.id, clubB.id] } } });
    await db.team.deleteMany({ where: { clubId: { in: [clubA.id, clubB.id] } } });
    await db.season.deleteMany({ where: { clubId: { in: [clubA.id, clubB.id] } } });
    await db.club.deleteMany({ where: { id: { in: [clubA.id, clubB.id] } } });
  }
  console.log(`\n=== PROBE 3: ${pass} ✅ · ${fail} ❌ ===`);
}

main()
  .catch((e) => { console.error("FATAL:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
