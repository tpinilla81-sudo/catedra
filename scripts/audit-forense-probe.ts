// ============================================================================
// AUDITORÍA FORENSE — PROBE EMPÍRICO DE RESQUICIOS
// ----------------------------------------------------------------------------
// Prueba contra la base de datos REAL cada sospecha detectada en la lectura
// de código. Crea dos clubes-probe efímeros (ZZZ-AUDIT) y los borra al final.
// NO modifica datos del club demo (CF Método).
// ============================================================================
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createTenantClient } from "../src/lib/tenant";
import { db } from "../src/lib/db";
import {
  collectInputs,
  buildIssueDrafts,
  mondayOf,
} from "../src/lib/engine/diagnose";
import { runWeeklyProposalPipeline } from "../src/lib/engine/pipeline";

ensureUrl();

function ensureUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/metodo";
  }
}

let pass = 0;
let fail = 0;
const findings: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function finding(text: string) {
  findings.push(text);
  console.log(`  🚨 HALLAZGO: ${text}`);
}

const TAG = `zzz-audit-${randomUUID().slice(0, 8)}`;

async function main() {
  console.log(`\n=== PROBE FORENSE (tag ${TAG}) ===\n`);

  // ---------- Setup: club A, club B, contenidos ----------
  const clubA = await db.club.create({ data: { name: "Audit Club A", slug: `${TAG}-a` } });
  const clubB = await db.club.create({ data: { name: "Audit Club B", slug: `${TAG}-b` } });
  const seasonA = await db.season.create({
    data: { clubId: clubA.id, name: "2026/27", startDate: new Date(), endDate: new Date() },
  });
  const teamA = await db.team.create({
    data: { clubId: clubA.id, seasonId: seasonA.id, name: "Audit Team A" },
  });
  const seasonB = await db.season.create({
    data: { clubId: clubB.id, name: "2026/27", startDate: new Date(), endDate: new Date() },
  });
  const teamB = await db.team.create({
    data: { clubId: clubB.id, seasonId: seasonB.id, name: "Audit Team B" },
  });
  const playerA = await db.player.create({
    data: { clubId: clubA.id, teamId: teamA.id, firstName: "Probe", lastName: "Uno", mainPosition: "CM" },
  });
  const playerB = await db.player.create({
    data: { clubId: clubB.id, teamId: teamB.id, firstName: "Probe", lastName: "Dos", mainPosition: "CM" },
  });
  const matchA = await db.match.create({
    data: { clubId: clubA.id, teamId: teamA.id, opponent: "Rival A", kickoffAt: new Date(Date.now() - 86400_000 * 3), status: "PLAYED", goalsFor: 1, goalsAgainst: 2 },
  });
  const reportA = await db.matchReport.create({
    data: { matchId: matchA.id, createdById: (await db.user.create({
      data: { email: `${TAG}-u@audit.es`, name: "Probe User", passwordHash: "x:y", role: "COACH_ADMIN", clubId: clubA.id },
    })).id, sensation: "AMBER", perceivedLoad: 5, collectiveAttitude: 5, tacticalExecution: 5 },
  });
  const microcycleB = await db.microcycle.create({
    data: { clubId: clubB.id, teamId: teamB.id, weekStart: mondayOf(new Date()), status: "PROPOSED" },
  });
  const sessionB = await db.session.create({
    data: { microcycleId: microcycleB.id, date: new Date(), label: "MD-3", objective: "probe" },
  });

  const clientA = createTenantClient(clubA.id) as unknown as PrismaClient;
  const clientB = createTenantClient(clubB.id) as unknown as PrismaClient;

  try {
    // ======================================================================
    console.log("--- A. CREATE en modelos RELATION_SCOPED (sin inyección de club) ---");
    // ======================================================================

    // A1: TacticalEvent.create apuntando al reporte del CLUB B desde el cliente del CLUB A
    let leaked = false;
    try {
      const ev = await clientA.tacticalEvent.create({
        data: { reportId: reportA.id, x: 10, y: 10, type: "BALL_LOSS" },
      });
      // válido: reportA es del club A. La prueba real es con reporte B:
      await clientA.tacticalEvent.delete({ where: { id: ev.id } });
    } catch { /* noop */ }

    // creamos reporte en club B y volvemos a intentar desde A
    const matchB = await db.match.create({
      data: { clubId: clubB.id, teamId: teamB.id, opponent: "Rival B", kickoffAt: new Date(Date.now() - 86400_000 * 3), status: "PLAYED", goalsFor: 0, goalsAgainst: 3 },
    });
    const reportB = await db.matchReport.create({
      data: { matchId: matchB.id, createdById: (await db.user.create({
        data: { email: `${TAG}-ub@audit.es`, name: "Probe User B", passwordHash: "x:y", role: "COACH_ADMIN", clubId: clubB.id },
      })).id, sensation: "GREEN", perceivedLoad: 4, collectiveAttitude: 6, tacticalExecution: 7 },
    });
    try {
      const evForeign = await clientA.tacticalEvent.create({
        data: { reportId: reportB.id, x: 50, y: 50, type: "GOAL_AGAINST" },
      });
      leaked = true;
      // limpiar el dato contaminado
      await db.tacticalEvent.delete({ where: { id: evForeign.id } });
      finding(
        `TENANT LEAK confirmado: TacticalEvent.create permite inyectar eventos en el reporte de OTRO club (guard no protege create de RELATION_SCOPED). Evento ${evForeign.id} creado en reporte B desde cliente A.`,
      );
    } catch (e) {
      check("A1 TacticalEvent.create cross-tenant BLOQUEADO", true, `error: ${(e as Error).message.slice(0, 80)}`);
    }
    if (!leaked) {
      // si el guard lo bloqueó, lo registramos como check explícito
      pass++;
    }

    // A2: PlayerMatchNote.create con reporte B + jugador propio de A
    try {
      const noteForeign = await clientA.playerMatchNote.create({
        data: { reportId: reportB.id, playerId: playerA.id, flag: "RED", note: "inyectada" },
      });
      await db.playerMatchNote.delete({ where: { id: noteForeign.id } });
      finding(
        "TENANT LEAK confirmado: PlayerMatchNote.create permite escribir notas en el cuaderno de OTRO club (con playerId de otro club además).",
      );
    } catch (e) {
      check("A2 PlayerMatchNote.create cross-tenant BLOQUEADO", true);
    }

    // A3: Session.create colgando del microciclo de B
    try {
      const sessForeign = await clientA.session.create({
        data: { microcycleId: microcycleB.id, date: new Date(), label: "MD-1", objective: "inyectada" },
      });
      await db.session.delete({ where: { id: sessForeign.id } });
      finding(
        "TENANT LEAK confirmado: Session.create permite crear sesiones en el microciclo de OTRO club.",
      );
    } catch {
      check("A3 Session.create cross-tenant BLOQUEADO", true);
    }

    // A4: DiagnosisIssue.create colgando del microciclo de B
    try {
      const issueForeign = await clientA.diagnosisIssue.create({
        data: { microcycleId: microcycleB.id, kind: "TACTICAL", severity: 5, evidence: "inyectada por club A" },
      });
      await db.diagnosisIssue.delete({ where: { id: issueForeign.id } });
      finding(
        "TENANT LEAK confirmado: DiagnosisIssue.create permite plantar hallazgos falsos en el diagnóstico de OTRO club.",
      );
    } catch {
      check("A4 DiagnosisIssue.create cross-tenant BLOQUEADO", true);
    }

    // A5: SessionTask.create en la sesión de B
    try {
      const taskForeign = await clientA.sessionTask.create({
        data: { sessionId: sessionB.id, taskId: "no-existe", order: 9 },
      });
      await db.sessionTask.delete({ where: { id: taskForeign.id } });
      finding("TENANT LEAK confirmado: SessionTask.create permite escribir tareas en sesiones de OTRO club.");
    } catch (e) {
      const msg = (e as Error).message;
      // puede fallar por FK (taskId inexistente) — distinguir
      if (msg.includes("Foreign key")) {
        finding("SessionTask.create NO está protegido por el guard: el bloqueo fue solo la FK del taskId inexistente (con un taskId real sería un leak).");
        check("A5 SessionTask.create: bloqueado SOLO por FK, no por guard", true);
      } else {
        check("A5 SessionTask.create cross-tenant BLOQUEADO", true);
      }
    }

    // ======================================================================
    console.log("--- B. UPDATE en modelos CLUB_SCOPED (data sin validar) ---");
    // ======================================================================

    // B1: update intentando mover el clubId de un jugador al club B
    try {
      await clientA.player.update({
        where: { id: playerA.id },
        data: { clubId: clubB.id } as never,
      });
      const after = await db.player.findUnique({ where: { id: playerA.id } });
      if (after?.clubId === clubB.id) {
        finding(
          "TENANT LEAK confirmado: Player.update permite REESCRIBIR clubId (el guard no valida data en update) → el registro migra de club sin cortapisas.",
        );
        // devolver el jugador a su club para no alterar el resto de pruebas
        await db.player.update({ where: { id: playerA.id }, data: { clubId: clubA.id } });
      } else {
        check("B1 update data.clubId no surtió efecto", true);
      }
    } catch (e) {
      check("B1 update data.clubId BLOQUEADO", true, (e as Error).message.slice(0, 80));
    }

    // B2: nested connect a un team de otro club
    try {
      await clientA.player.update({
        where: { id: playerA.id },
        data: { team: { connect: { id: teamB.id } } } as never,
      });
      const after = await db.player.findUnique({ where: { id: playerA.id } });
      if (after?.teamId === teamB.id) {
        finding(
          "TENANT LEAK confirmado: Player.update con nested connect permite APUNTAR un jugador al team de otro club (contaminación cruzada clubId≠team.clubId).",
        );
        await db.player.update({ where: { id: playerA.id }, data: { teamId: teamA.id } });
      } else {
        check("B2 nested connect no surtió efecto", true);
      }
    } catch (e) {
      check("B2 nested connect BLOQUEADO", true, (e as Error).message.slice(0, 80));
    }

    // B3: upsert con rama update que reescribe clubId
    try {
      await clientA.player.upsert({
        where: { id: playerA.id },
        create: { clubId: clubA.id, teamId: teamA.id, firstName: "x", lastName: "x", mainPosition: "CM" },
        update: { clubId: clubB.id } as never,
      });
      const after = await db.player.findUnique({ where: { id: playerA.id } });
      if (after?.clubId === clubB.id) {
        finding("TENANT LEAK confirmado: upsert (rama update) permite reescribir clubId.");
        await db.player.update({ where: { id: playerA.id }, data: { clubId: clubA.id } });
      } else {
        check("B3 upsert rama update no surtió efecto", true);
      }
    } catch (e) {
      check("B3 upsert rama update BLOQUEADO", true, (e as Error).message.slice(0, 80));
    }

    // ======================================================================
    console.log("--- C. Lectura de recetas cruzadas (TaskSubPrinciple) ---");
    // ======================================================================
    // Subprincipio PRIVADO de club B conectado a una tarea GLOBAL → visible para A?
    const globalTask = await db.task.findFirst({ where: { clubId: null } });
    if (globalTask) {
      const spPrivateB = await db.subPrinciple.create({
        data: { clubId: clubB.id, phase: "OFFENSIVE", name: `Secreto B ${TAG}` },
      });
      const tsp = await db.taskSubPrinciple.create({
        data: { taskId: globalTask.id, subPrincipleId: spPrivateB.id, relevance: 3 },
      });
      const visibleByA = await clientA.taskSubPrinciple.findFirst({
        where: { taskId: globalTask.id, subPrincipleId: spPrivateB.id },
        include: { subPrinciple: { select: { name: true } } },
      });
      if (visibleByA) {
        finding(
          `FILTRACIÓN PARCIAL: TaskSubPrinciple (scope por task) expone al club A la conexión tarea-global → subprincipio PRIVADO de B, incluido su nombre («${visibleByA.subPrinciple.name}»). El page.tsx lo re-filtra en JS, pero el guard no.`,
        );
      } else {
        check("C1 TSP con subprincipio privado de B invisible para A", true);
      }
      await db.taskSubPrinciple.delete({ where: { id: tsp.id } });
      await db.subPrinciple.delete({ where: { id: spPrivateB.id } });
    }

    // ======================================================================
    console.log("--- D. Motor: casos borde y determinismo ---");
    // ======================================================================

    // D1: equipo SIN jugadores, SIN partidos, SIN pulso → propuesta válida
    const weekStart = mondayOf(new Date());
    const res0 = await runWeeklyProposalPipeline(clientA, { clubId: clubA.id, teamId: teamA.id, weekStart });
    check("D1 pipeline con plantilla VACÍA crea propuesta sin excepción", res0.created === true, `issues: ${res0.issuesCount}, prescritas: ${res0.prescriptions.length}, descartadas: ${res0.discarded.length}`);
    const mc0 = await db.microcycle.findUnique({
      where: { teamId_weekStart: { teamId: teamA.id, weekStart } },
      include: { sessions: { include: { tasks: true } } },
    });
    if (mc0) {
      // S3: con plantilla vacía la FACTIBILIDAD física manda — ninguna tarea
      // (principal ni de apoyo MD+1/MD-1) llega al césped sin cumplir los
      // requisitos del grupo. Las sesiones quedan vacías y la UI Hoy las
      // cubre como "sesión libre" (regla de oro intacta: cero pantallas blanco).
      const anyTask = mc0.sessions.flatMap((s) => s.tasks);
      check(
        "D2 plantilla vacía → cero tareas inviables (factibilidad S3 también en MD+1/MD-1)",
        anyTask.length === 0,
        `${anyTask.length} tarea(s) asignadas con 0 disponibles`,
      );
      if (anyTask.length > 0) {
        finding(
          `REGRESIÓN S3: el motor asignó ${anyTask.length} tarea(s) con plantilla vacía (0 disponibles) — la factibilidad física de las sesiones de apoyo MD+1/MD-1 ya no se está aplicando.`,
        );
      }
    }

    // D3: carrera — dos pipelines concurrentes para la misma semana en club B
    const [r1, r2] = await Promise.allSettled([
      runWeeklyProposalPipeline(clientB, { clubId: clubB.id, teamId: teamB.id, weekStart }),
      runWeeklyProposalPipeline(clientB, { clubId: clubB.id, teamId: teamB.id, weekStart }),
    ]);
    const rejected = [r1, r2].filter((r) => r.status === "rejected");
    if (rejected.length > 0) {
      const err = (rejected[0] as PromiseRejectedResult).reason as Error;
      check("D3 carrera detectada (una rama rechazada)", true, err.message.slice(0, 120));
      if (err.message.includes("Unique constraint")) {
        finding(
          "CONDICIÓN DE CARRERA confirmada: dos ensureWeeklyProposal concurrentes → el segundo lanza P2002 SIN capturar → la Server Action devuelve error 500 al usuario (ensureWeeklyProposal/acceptPlan no tienen try/catch).",
        );
      }
    } else {
      check("D3 sin carrera (una devolvió created:false)", true);
    }

    // D4: determinismo de buildIssueDrafts.findFirst (sin orderBy)
    const inputs = await collectInputs(clientA, teamA.id, weekStart);
    const spIds = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const drafts = await buildIssueDrafts(clientA, teamA.id, inputs);
      for (const d of drafts) if (d.subPrincipleId) spIds.add(d.subPrincipleId);
    }
    if (spIds.size > 1) {
      finding(
        `NO-DETERMINISMO confirmado: buildIssueDrafts (findFirst sin orderBy) devolvió ${spIds.size} subprincipios distintos en 25 ejecuciones idénticas → el hallazgo y su prescripción cambian entre corridas sin que cambien los datos.`,
      );
    } else {
      check("D4 findFirst determinista en esta muestra", true, `${spIds.size} id distinto`);
    }

    // D5 (post-S3): un pulso VIEJO (30 días) debe ser RECHAZADO por la
    // ventana temporal [weekStart−8d, weekStart+2d] — el motor ya no
    // planifica la semana con datos caducados; aplica defaults seguros.
    const oldPulse = await db.teamPulse.create({
      data: { clubId: clubA.id, teamId: teamA.id, date: new Date(Date.now() - 86400_000 * 30), moraleScore: 3, fatigueScore: 9 },
    });
    const inputsOld = await collectInputs(clientA, teamA.id, weekStart);
    check(
      "D5 pulso de hace 30 días RECHAZADO por ventana temporal (defaults seguros)",
      inputsOld.pulse == null,
      inputsOld.pulse ? `pulse.date=${inputsOld.pulse.date.toISOString().slice(0, 10)} (caducado EN USO)` : "sin pulso → fatiga neutra 5/10, sin hallazgo anímico",
    );
    if (inputsOld.pulse?.id === oldPulse.id) {
      finding(
        "REGRESIÓN S3 (PULSO CADUCADO): collectInputs volvió a usar un pulso de hace 30 días (fatiga 9/10, ánimo 3/10) para la semana actual — la ventana temporal del pulso no se está aplicando.",
      );
    }
    await db.teamPulse.delete({ where: { id: oldPulse.id } });

    // ======================================================================
    console.log("--- E. Fechas/TZ: mondayOf con referencia Europe/Madrid ---");
    // ======================================================================
    // Post-S3: mondayOf decide el lunes con el CALENDARIO DE MADRID
    // (src/lib/utils/dates.ts) y devuelve la medianoche UTC del lunes elegido.
    // E1: lunes 00:30 Madrid (invierno UTC+1) = domingo 23:30 UTC — el caso
    // que con TZ del proceso (UTC) saltaba a la semana anterior.
    const madridMondayEarly = new Date("2026-11-09T00:30:00+01:00");
    const wk = mondayOf(madridMondayEarly);
    const expected = new Date("2026-11-09T00:00:00Z"); // lunes 9 nov
    check(
      "E1 mondayOf(lunes 00:30 Madrid) → lunes 09-nov (sin salto por UTC)",
      wk.getUTCDay() === 1 && wk.getTime() === expected.getTime(),
      `resultado: ${wk.toISOString()} (esperado lunes 2026-11-09)`,
    );
    // E2: domingo 23:30 Madrid (invierno UTC+1) = domingo 22:30 UTC —
    // pertenece a la semana que TERMINA (lunes 02-nov), no a la siguiente.
    const madridSundayLate = new Date("2026-11-08T22:30:00Z");
    const wk2 = mondayOf(madridSundayLate);
    const expected2 = new Date("2026-11-02T00:00:00Z"); // lunes 2 nov
    check(
      "E2 mondayOf(domingo 23:30 Madrid) → lunes 02-nov (misma semana)",
      wk2.getUTCDay() === 1 && wk2.getTime() === expected2.getTime(),
      `resultado: ${wk2.toISOString()} (esperado lunes 2026-11-02)`,
    );
    if (!(wk2.getUTCDay() === 1 && wk2.getTime() === expected2.getTime())) {
      finding(
        "REGRESIÓN S3 (FRONTERA TZ): mondayOf dejó de respetar el calendario de Madrid — un partido del domingo tarde Madrid se computa en la semana equivocada y la ingesta puede refrescar el microciclo equivocado.",
      );
    }
    // E3/E4: horario de verano (UTC+2) — la frontera se mantiene exacta con DST.
    const summerMondayEarly = new Date("2026-07-13T00:30:00+02:00"); // dom 22:30 UTC
    const wk3 = mondayOf(summerMondayEarly);
    const expected3 = new Date("2026-07-13T00:00:00Z"); // lunes 13 jul
    check(
      "E3 mondayOf(lunes 00:30 Madrid, verano UTC+2) → lunes 13-jul",
      wk3.getTime() === expected3.getTime(),
      `resultado: ${wk3.toISOString()} (esperado lunes 2026-07-13)`,
    );
    const summerSundayLate = new Date("2026-07-12T21:30:00Z"); // dom 23:30 Madrid
    const wk4 = mondayOf(summerSundayLate);
    const expected4 = new Date("2026-07-06T00:00:00Z"); // lunes 6 jul
    check(
      "E4 mondayOf(domingo 23:30 Madrid, verano UTC+2) → lunes 06-jul",
      wk4.getTime() === expected4.getTime(),
      `resultado: ${wk4.toISOString()} (esperado lunes 2026-07-06)`,
    );
  } finally {
    // ---------- Cleanup: borrar clubes-probe (cascade) ----------
    await db.club.deleteMany({ where: { id: { in: [clubA.id, clubB.id] } } });
    await db.user.deleteMany({ where: { email: { contains: TAG } } });
    const leftover = await db.club.count({ where: { slug: { startsWith: "zzz-audit" } } });
    console.log(`\n=== LIMPIEZA: clubes-probe restantes: ${leftover} ===`);
  }

  console.log(`\n=== RESUMEN PROBE: ${pass} verificaciones · ${findings.length} hallazgos confirmados ===`);
  console.log("HALLAZGOS:");
  findings.forEach((f, i) => console.log(`  [H${i + 1}] ${f}`));
}

main()
  .catch((e) => {
    console.error("FATAL PROBE:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
