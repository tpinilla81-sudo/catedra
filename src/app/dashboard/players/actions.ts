"use server";

// ============================================================================
// SERVER ACTIONS — PILAR 2: PLANTILLA E INGESTA ÁGIL
// ----------------------------------------------------------------------------
// importSquadFile  → carga masiva por CSV/Excel (drag & drop). La lógica real
//                    (parser, validación, matching, escrituras) vive en
//                    @/lib/squad-import, fuente única compartida con la
//                    validación E2E del Pilar 2.
// updatePlayerQuick→ edición de un toque (estado de disponibilidad, ratings).
// Ambas ejecutan bajo Tenant Guard: nunca se puede escribir fuera del club.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { PlayerStatus } from "@prisma/client";
import { requireTenantContext } from "@/lib/session";
import {
  applySquadImport,
  fileToMatrix,
  type ImportSummary,
  type PlayerQuickPatch,
} from "@/lib/squad-import";

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

  await db.player.update({
    where: { id: playerId },
    data: {
      ...(patch.status && statuses.includes(patch.status) ? { status: patch.status } : {}),
      ...(clamp(patch.technicalRating) !== undefined ? { technicalRating: clamp(patch.technicalRating), ratingsUpdatedAt: new Date() } : {}),
      ...(clamp(patch.tacticalRating) !== undefined ? { tacticalRating: clamp(patch.tacticalRating), ratingsUpdatedAt: new Date() } : {}),
      ...(clamp(patch.physicalRating) !== undefined ? { physicalRating: clamp(patch.physicalRating), ratingsUpdatedAt: new Date() } : {}),
      ...(patch.statusNote !== undefined ? { statusNote: patch.statusNote?.slice(0, 200) || null } : {}),
    },
  });

  revalidatePath("/dashboard/players");
  revalidatePath("/dashboard/today");
  return { ok: true };
}
