"use server";

// ============================================================================
// SERVER ACTIONS — PILAR 3: INGESTA POST-PARTIDO EXPRÉS (< 3 MIN)
// ----------------------------------------------------------------------------
// submitMatchReport → guarda en UNA transacción: MatchReport (semáforo +
//   sliders), TacticalEvent[] (pizarra táctil) y PlayerMatchNote[] (cuaderno).
//   Después dispara el HOOK DEL MOTOR (Pilar 4):
//     1. Refresca la racha de resultados del Pulso colectivo.
//     2. Regenera el diagnóstico de los microciclos aún PROPOSED afectados
//        (semana del partido y semana siguiente), para que la propuesta del
//        lunes refleje EXACTAMENTE lo ocurrido en el campo.
//     3. Devuelve la evidencia detectada para feedback inmediato en la UI.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Semaphore, TacticalEventType } from "@prisma/client";
import { requireTenantContext } from "@/lib/session";
import {
  buildIssueDrafts,
  collectInputs,
  computeResultsStreak,
  mondayOf,
  refreshProposalsWithNewEvidence,
} from "@/lib/engine/diagnose";

// ---------- Tipos ----------

export type EventInput = {
  x: number;
  y: number;
  type: string;
  playerId?: string | null;
  minute?: number | null;
};

export type NoteInput = {
  playerId: string;
  flag: string;
  note?: string | null;
};

export type SubmitPayload = {
  gameId: string;
  goalsFor: number;
  goalsAgainst: number;
  sensation: string;
  perceivedLoad: number;
  collectiveAttitude: number;
  tacticalExecution: number;
  notes?: string | null;
  events: EventInput[];
  playerNotes: NoteInput[];
};

export type SubmitResult =
  | {
      ok: true;
      reportId: string;
      engineEvidence: string[];
      refreshedWeeks: string[];
      eventsSaved: number;
      notesSaved: number;
    }
  | { ok: false; error: string };

const SEMAPHORES: Semaphore[] = ["GREEN", "AMBER", "RED"];
const EVENT_TYPES: TacticalEventType[] = [
  "BALL_LOSS",
  "BALL_RECOVERY",
  "POSITIVE_DUEL",
  "NEGATIVE_DUEL",
  "ATTEMPTED_SHOT",
  "GOAL_FOR",
  "GOAL_AGAINST",
  "OPPONENT_CHANCE",
  "CUSTOM",
];

function clamp10(n: number): number {
  return Math.min(10, Math.max(1, Math.round(n)));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

// ---------- ACTION: guardar ingesta completa ----------

export async function submitMatchReport(
  payload: SubmitPayload,
): Promise<SubmitResult> {
  const { db, user, team } = await requireTenantContext();

  // El Tenant Guard ya filtra por club; además exigimos que el partido sea
  // del equipo activo (un analista no ingesta partidos de otra plantilla).
  const match = await db.match.findUnique({ where: { id: payload.gameId } });
  if (!match) return { ok: false, error: "Partido no encontrado." };
  if (match.teamId !== team.id) {
    return { ok: false, error: "El partido pertenece a otro equipo del club." };
  }

  // ---------- Validación y saneado ----------
  const roster = await db.player.findMany({
    where: { teamId: team.id },
    select: { id: true },
  });
  const validPlayers = new Set(roster.map((p) => p.id));

  const sensation = (SEMAPHORES as string[]).includes(payload.sensation)
    ? (payload.sensation as Semaphore)
    : "AMBER";

  const reportData = {
    sensation,
    perceivedLoad: clamp10(payload.perceivedLoad),
    collectiveAttitude: clamp10(payload.collectiveAttitude),
    tacticalExecution: clamp10(payload.tacticalExecution),
    notes: payload.notes?.trim().slice(0, 500) || null,
  };

  const cleanEvents = payload.events
    .filter((e) => (EVENT_TYPES as string[]).includes(e.type))
    .slice(0, 500)
    .map((e) => ({
      playerId: e.playerId && validPlayers.has(e.playerId) ? e.playerId : null,
      minute:
        e.minute != null && Number.isFinite(e.minute)
          ? Math.min(130, Math.max(0, Math.round(e.minute)))
          : null,
      x: clamp01(e.x),
      y: clamp01(e.y),
      type: e.type as TacticalEventType,
    }));

  const cleanNotes = payload.playerNotes
    .filter(
      (n) =>
        validPlayers.has(n.playerId) && (SEMAPHORES as string[]).includes(n.flag),
    )
    .slice(0, 60)
    .map((n) => ({
      playerId: n.playerId,
      flag: n.flag as Semaphore,
      note: n.note?.trim().slice(0, 140) || null,
    }));

  const goalsFor = Math.min(99, Math.max(0, Math.round(payload.goalsFor || 0)));
  const goalsAgainst = Math.min(
    99,
    Math.max(0, Math.round(payload.goalsAgainst || 0)),
  );

  // ---------- Escritura transaccional ----------
  try {
    const saved = await db.$transaction(async (tx) => {
      const existing = await tx.matchReport.findUnique({
        where: { matchId: match.id },
      });

      const report = existing
        ? await tx.matchReport.update({
            where: { id: existing.id },
            data: { ...reportData, createdById: user.id },
          })
        : await tx.matchReport.create({
            data: { matchId: match.id, createdById: user.id, ...reportData },
          });

      // La pizarra se re-envía completa → reemplazo limpio de eventos
      await tx.tacticalEvent.deleteMany({ where: { reportId: report.id } });
      if (cleanEvents.length > 0) {
        await tx.tacticalEvent.createMany({
          data: cleanEvents.map((e) => ({ reportId: report.id, ...e })),
        });
      }

      // Cuaderno: una nota por jugador y partido (editable)
      for (const n of cleanNotes) {
        const noteExisting = await tx.playerMatchNote.findFirst({
          where: { reportId: report.id, playerId: n.playerId },
        });
        if (noteExisting) {
          await tx.playerMatchNote.update({
            where: { id: noteExisting.id },
            data: { flag: n.flag, note: n.note },
          });
        } else {
          await tx.playerMatchNote.create({
            data: { reportId: report.id, ...n },
          });
        }
      }

      await tx.match.update({
        where: { id: match.id },
        data: { goalsFor, goalsAgainst, status: "ANALYZED" },
      });

      return report;
    });

    // ---------- HOOK DEL MOTOR (Pilar 3 → Pilar 4) ----------
    // 1) Pulso: racha de resultados siempre viva
    const streak = await computeResultsStreak(db, team.id);
    await db.teamPulse.updateMany({
      where: { teamId: team.id, date: mondayOf(new Date()) },
      data: { resultsStreak: streak },
    });

    // 2) Microciclos aún PROPOSED de esta semana y la siguiente → diagnóstico
    //    regenerado con la evidencia recién guardada.
    const refresh = await refreshProposalsWithNewEvidence(
      db,
      team.id,
      match.kickoffAt,
    );

    // 3) Evidencia para feedback inmediato en la UI
    const inputs = await collectInputs(db, team.id, mondayOf(new Date()));
    const drafts = await buildIssueDrafts(db, team.id, inputs);

    revalidatePath("/dashboard/today");
    revalidatePath("/dashboard/matches");
    revalidatePath("/dashboard/players");
    revalidatePath("/dashboard/match");

    return {
      ok: true,
      reportId: saved.id,
      engineEvidence: drafts.slice(0, 3).map((d) => d.evidence),
      refreshedWeeks: refresh.refreshedWeeks,
      eventsSaved: cleanEvents.length,
      notesSaved: cleanNotes.length,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `No se pudo guardar la ingesta: ${e.message.slice(0, 140)}`
          : "No se pudo guardar la ingesta.",
    };
  }
}
