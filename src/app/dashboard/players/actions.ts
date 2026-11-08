"use server";

// ============================================================================
// SERVER ACTIONS — PILAR 2: PLANTILLA E INGESTA ÁGIL
// ----------------------------------------------------------------------------
// importSquadFile  → carga masiva por CSV/Excel (drag & drop). La lógica real
//                    (parser, validación, matching, escrituras) vive en
//                    @/lib/squad-import, fuente única compartida con la
//                    validación E2E del Pilar 2.
// updatePlayerQuick→ edición de un toque (estado, ratings y perfil pre-partido).
// createPlayer     → alta manual de un jugador desde el diálogo de Plantilla.
// Todas ejecutan bajo Tenant Guard: nunca se puede escribir fuera del club.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { PlayerStatus, Position } from "@prisma/client";
import { requireTenantContext } from "@/lib/session";
import {
  applySquadImport,
  fileToMatrix,
  sanitizePlayerProfilePatch,
  type ImportSummary,
  type PlayerQuickPatch,
} from "@/lib/squad-import";
import { normalizePosition } from "@/lib/taxonomy";

export type { ImportRowResult, ImportSummary, PlayerQuickPatch } from "@/lib/squad-import";

// ---------- ACTION: importación masiva ----------

export async function importSquadFile(
  formData: FormData,
): Promise<ImportSummary> {
  const { db, team } = await requireTenantContext();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, created: 0, updated: 0, errors: 0, rows: [], error: "No se recibió ningún archivo." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, created: 0, updated: 0, errors: 0, rows: [], error: "Archivo demasiado grande (máx. 5 MB)." };
  }

  const parsed = await fileToMatrix(file);
  if ("error" in parsed) {
    return { ok: false, created: 0, updated: 0, errors: 0, rows: [], error: parsed.error };
  }

  const summary = await applySquadImport(db, team, parsed.matrix);

  revalidatePath("/dashboard/players");
  revalidatePath("/dashboard/today");
  revalidatePath("/dashboard/matches");

  return summary;
}

// ---------- ACTION: edición rápida de ficha ----------

export async function updatePlayerQuick(playerId: string, patch: PlayerQuickPatch) {
  const { db } = await requireTenantContext();

  const clamp = (v: number | null | undefined) =>
    v === null || v === undefined ? undefined : Math.min(5, Math.max(1, Math.round(v)));

  const statuses: PlayerStatus[] = ["AVAILABLE", "INJURED", "SUSPENDED", "RETURNING"];

  // Perfil pre-partido: RPE acotado 1-10 y textos recortados (saneo puro).
  const profile = sanitizePlayerProfilePatch({
    currentRpe: patch.currentRpe,
    injuryHistory: patch.injuryHistory,
    academicConstraints: patch.academicConstraints,
    strength: patch.strength,
  });

  // Demarcaciones: normalizadas, secundarias ≠ principal y sin repetidos.
  let positionData: { mainPosition?: Position; secondaryPositions?: Position[] } = {};
  if (patch.mainPosition !== undefined || patch.secondaryPositions !== undefined) {
    const main = patch.mainPosition !== undefined ? normalizePosition(patch.mainPosition ?? "") : null;
    if (patch.mainPosition !== undefined && !main) {
      return { ok: false as const, error: "Demarcación principal no reconocida." };
    }
    const secondary =
      patch.secondaryPositions !== undefined
        ? (patch.secondaryPositions ?? [])
            .map((p) => normalizePosition(p))
            .filter((p): p is Position => p !== null && p !== main)
            .filter((p, i, arr) => arr.indexOf(p) === i)
        : undefined;
    positionData = {
      ...(main ? { mainPosition: main as Position } : {}),
      ...(secondary !== undefined ? { secondaryPositions: secondary as Position[] } : {}),
    };
  }

  await db.player.update({
    where: { id: playerId },
    data: {
      ...(patch.status && statuses.includes(patch.status) ? { status: patch.status } : {}),
      ...(clamp(patch.technicalRating) !== undefined ? { technicalRating: clamp(patch.technicalRating), ratingsUpdatedAt: new Date() } : {}),
      ...(clamp(patch.tacticalRating) !== undefined ? { tacticalRating: clamp(patch.tacticalRating), ratingsUpdatedAt: new Date() } : {}),
      ...(clamp(patch.physicalRating) !== undefined ? { physicalRating: clamp(patch.physicalRating), ratingsUpdatedAt: new Date() } : {}),
      ...(patch.statusNote !== undefined ? { statusNote: patch.statusNote?.slice(0, 200) || null } : {}),
      ...positionData,
      ...profile.data,
    },
  });

  revalidatePath("/dashboard/players");
  revalidatePath("/dashboard/today");
  return { ok: true };
}

// ---------- ACTION: alta manual de jugador ----------
export type NewPlayerInput = {
  firstName: string;
  lastName: string;
  shirtNumber?: number | null;
  mainPosition: string;
  secondaryPositions?: string[];
  currentRpe?: number | null;
  injuryHistory?: string | null;
  academicConstraints?: string | null;
  strength?: string | null;
};

export type CreatePlayerResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createPlayer(input: NewPlayerInput): Promise<CreatePlayerResult> {
  const { db, team } = await requireTenantContext();

  const firstName = (input.firstName ?? "").trim().slice(0, 60);
  const lastName = ((input.lastName ?? "").trim() || "-").slice(0, 60);
  if (!firstName) {
    return { ok: false, error: "El nombre es obligatorio." };
  }

  const mainPosition = normalizePosition(input.mainPosition ?? "");
  if (!mainPosition) {
    return { ok: false, error: "Demarcación principal no reconocida." };
  }

  // Polivalencias: válidas, distintas de la principal y sin repetidos.
  const secondary = (input.secondaryPositions ?? [])
    .map((p) => normalizePosition(p))
    .filter((p): p is Position => p !== null && p !== mainPosition)
    .filter((p, i, arr) => arr.indexOf(p) === i) as Position[];

  // Dorsal: entero 0-999 y único dentro del equipo (unique teamId+shirt).
  let shirtNumber: number | null = null;
  if (input.shirtNumber !== null && input.shirtNumber !== undefined && `${input.shirtNumber}`.trim() !== "") {
    const n = Math.round(Number(input.shirtNumber));
    if (!Number.isFinite(n) || n < 0 || n > 999) {
      return { ok: false, error: "El dorsal debe ser un número entre 0 y 999." };
    }
    const owner = await db.player.findFirst({
      where: { teamId: team.id, shirtNumber: n },
      select: { firstName: true, lastName: true },
    });
    if (owner) {
      return { ok: false, error: `El dorsal ${n} ya lo tiene ${owner.firstName} ${owner.lastName}.` };
    }
    shirtNumber = n;
  }

  const profile = sanitizePlayerProfilePatch({
    currentRpe: input.currentRpe,
    injuryHistory: input.injuryHistory,
    academicConstraints: input.academicConstraints,
    strength: input.strength,
  });

  try {
    const created = await db.player.create({
      data: {
        clubId: team.clubId,
        teamId: team.id,
        firstName,
        lastName,
        shirtNumber,
        mainPosition: mainPosition as Position,
        secondaryPositions: secondary,
        ...profile.data,
      },
      select: { id: true },
    });

    revalidatePath("/dashboard/players");
    revalidatePath("/dashboard/today");
    return { ok: true, id: created.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint")) {
      return { ok: false, error: `El dorsal ${shirtNumber} ya está ocupado en este equipo.` };
    }
    return { ok: false, error: "No se pudo crear el jugador. Inténtalo de nuevo." };
  }
}
