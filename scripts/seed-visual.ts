// Material visual para el smoke test del tablón en directo (Pilar 3).
// Crea equipo + 16 jugadores con perfil pre-partido + partido en 1h +
// alineación de partida (11) + estados en directo ya anotados.
// Deja el matchId en tool-results/visual-match-id.txt. Idempotente.
import { PrismaClient } from "@prisma/client";
import { subHours } from "date-fns";
import { mkdirSync, writeFileSync } from "node:fs";

const raw = new PrismaClient({ datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/metodo" } } });

// Limpieza de ejecuciones previas
for (const t of await raw.team.findMany({ where: { name: "Equipo Visual TEST" } })) {
  await raw.match.deleteMany({ where: { teamId: t.id } });
  await raw.player.deleteMany({ where: { teamId: t.id } });
  await raw.team.delete({ where: { id: t.id } });
}

const club = await raw.club.findUniqueOrThrow({ where: { slug: "cf-metodo" } });
const season = await raw.season.findFirstOrThrow({ where: { clubId: club.id, isActive: true } });
const team = await raw.team.create({ data: { clubId: club.id, seasonId: season.id, name: "Equipo Visual TEST" } });

const mk = (shirt: number, first: string, last: string, pos: string, extra: object = {}) =>
  raw.player.create({
    data: { clubId: club.id, teamId: team.id, firstName: first, lastName: last, shirtNumber: shirt, mainPosition: pos as never, ...extra },
  });

const [gk, lb, cb1, cb2, rb, dm, cm1, cm2, lw, rw, cf, ...banqueta] = await Promise.all([
  mk(1, "Iker", "Ríos", "GK"),
  mk(2, "Hugo", "Salas", "LB"),
  mk(3, "Marc", "Vidal", "CB", { secondaryPositions: ["DM"] as never }),
  mk(4, "Pau", "Serra", "CB"),
  mk(5, "Ot", "Zabala", "RB"),
  mk(6, "Rodri", "Cases", "DM", { strength: "Pase rompe líneas" }),
  mk(7, "Gavi", "Molina", "CM", { currentRpe: 9, injuryHistory: "Sobrecarga isquios izquierdo" }),
  mk(8, "Pedri", "Nogal", "AM", { academicConstraints: "Exámenes finales esta semana" }),
  mk(9, "Ansu", "Pons", "LW", { currentRpe: 3, secondaryPositions: ["RW", "CF"] as never }),
  mk(10, "Lamine", "Puig", "RW", { strength: "1vs1 desequilibrante" }),
  mk(11, "Ferran", "Marí", "CF", { currentRpe: 6 }),
  mk(13, "Nil", "Fort", "GK"),
  mk(14, "Eric", "Busquets", "CB"),
  mk(15, "Dani", "Vergés", "CM"),
  mk(17, "Álex", "Turmo", "LW"),
  mk(19, "Ilias", "Romero", "SS"),
]);

const match = await raw.match.create({
  data: { clubId: club.id, teamId: team.id, opponent: "CDAtlético Vela", kickoffAt: subHours(new Date(), 1), isHome: true, competition: "Liga · J9" },
});

const once: Array<[string, string | null, string | null, string | null]> = [
  [gk.id, null, null, null],
  [lb.id, null, null, null],
  [cb1.id, null, null, null],
  [cb2.id, "HEAVY", null, null],
  [rb.id, null, null, null],
  [dm.id, null, null, "EXPLOITING"],
  [cm1.id, "EXHAUSTED", "MINOR", "STRUGGLING"],
  [cm2.id, null, null, null],
  [lw.id, null, null, null],
  [rw.id, null, null, "EXPLOITING"],
  [cf.id, null, null, null],
];
for (const [playerId, fatigueFlag, clinicalFlag, tacticalFlag] of once) {
  await raw.liveMatchEvaluation.upsert({
    where: { matchId_playerId: { matchId: match.id, playerId } },
    create: { matchId: match.id, playerId, isStarter: true, fatigueFlag: fatigueFlag as never, clinicalFlag: clinicalFlag as never, tacticalFlag: tacticalFlag as never, statusUpdatedAt: new Date() },
    update: { isStarter: true, fatigueFlag: fatigueFlag as never, clinicalFlag: clinicalFlag as never, tacticalFlag: tacticalFlag as never, statusUpdatedAt: new Date() },
  });
}
// Un tag acumulado para ver el contador
const evalLw = await raw.liveMatchEvaluation.findUniqueOrThrow({
  where: { matchId_playerId: { matchId: match.id, playerId: lw.id } },
});
await raw.matchTag.create({ data: { evaluationId: evalLw.id, code: "GOOD_UNMARKED" as never, type: "POSITIVE" as never } });

mkdirSync("tool-results", { recursive: true });
writeFileSync("tool-results/visual-match-id.txt", match.id);
// El tablón firma contra el equipo ACTIVO del míster (lastTeamId) — apúntalo
// al equipo visual durante el smoke y guarda el original para restaurarlo.
const mister = await raw.user.findUniqueOrThrow({
  where: { email: "mister@cfmetodo.es" },
  select: { id: true, lastTeamId: true },
});
writeFileSync("tool-results/visual-last-team.txt", mister.lastTeamId ?? "");
await raw.user.update({ where: { id: mister.id }, data: { lastTeamId: team.id } });
console.log("match visual:", match.id, "· jugadores:", banqueta.length + 11);
await raw.$disconnect();
