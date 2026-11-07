// ============================================================================
// PILAR 2 — IMPORTACIÓN MASIVA DE PLANTILLA (CSV / Excel)
// ----------------------------------------------------------------------------
// Toda la lógica real de la carga masiva vive aquí (fuente única compartida
// con la Server Action y con la validación E2E del Pilar 2):
//   • parseCsv        → parser RFC-4180 (comillas, delimitador auto, BOM).
//   • fileToMatrix    → File (.csv/.xlsx/.xls) → matriz de celdas.
//   • buildColumnMap  → cabeceras flexibles castellano/inglés/abreviaturas.
//   • parse* / clamp* → saneado de dorsales, posiciones, ratings y estados.
//   • applySquadImport→ matching por nombre normalizado + create/update +
//                       errores fila a fila, bajo Tenant Guard del equipo.
// ============================================================================
import * as XLSX from "xlsx";
import type { PlayerStatus, Position, PrismaClient } from "@prisma/client";
import { normalizeName, normalizePosition } from "@/lib/taxonomy";

// ---------- Tipos de resultado ----------

export type ImportRowResult = {
  row: number;
  name: string;
  ok: boolean;
  action: "created" | "updated" | "error";
  error?: string;
};

export type ImportSummary = {
  ok: boolean;
  created: number;
  updated: number;
  errors: number;
  rows: ImportRowResult[];
  error?: string;
};

export const MAX_ROWS = 200;

export type PlayerQuickPatch = {
  status?: PlayerStatus;
  technicalRating?: number | null;
  tacticalRating?: number | null;
  physicalRating?: number | null;
  statusNote?: string | null;
};

// ---------- Parser CSV (RFC-4180: comillas, delimitador auto) ----------

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM UTF-8

  const firstLine =
    text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (const d of Object.keys(counts)) {
    counts[d] = (firstLine.match(new RegExp(escapeRegExp(d), "g")) ?? []).length;
  }
  const delim =
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ",";

  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      cur.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field);
      field = "";
      rows.push(cur);
      cur = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ---------- File → matriz de celdas (.xlsx / .xls / .csv / .txt) ----------

export async function fileToMatrix(
  file: File,
): Promise<{ matrix: string[][] } | { error: string }> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) return { error: "El Excel no tiene hojas." };
      const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
      }).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []));
      return { matrix };
    } catch (e) {
      return {
        error: `No se pudo leer el archivo: ${e instanceof Error ? e.message : "error desconocido"}`,
      };
    }
  }

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return { matrix: parseCsv(await file.text()) };
  }

  return { error: "Formato no soportado. Usa .csv, .xlsx o .xls." };
}

// ---------- Cabeceras flexibles (castellano / inglés / abreviaturas) ----------

function normHeader(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export const HEADER_ALIASES: Record<string, string[]> = {
  firstName: ["nombre", "name", "first", "firstname", "primer nombre", "nom"],
  lastName: ["apellidos", "apellido", "lastname", "last", "surname", "apellidos jugador"],
  fullName: ["jugador", "player", "nombre completo", "full name", "nombre y apellidos", "futbolista", "nombre jugador"],
  shirtNumber: ["dorsal", "numero", "no", "no.", "n", "number", "#", "camiseta"],
  position: ["posicion", "pos", "demarcacion", "position", "demarcacion principal", "posicion principal", "puesto"],
  secondary: ["secundarias", "secundaria", "posiciones secundarias", "polivalencias", "polivalencia", "secondary", "secondary positions", "demarcaciones secundarias"],
  technical: ["tecnico", "tec", "technical", "valoracion tecnica", "rating tecnico"],
  tactical: ["tactico", "tac", "tactical", "valoracion tactica", "rating tactico"],
  physical: ["fisico", "fis", "physical", "valoracion fisica", "rating fisico"],
  status: ["estado", "status", "disponibilidad"],
  note: ["nota", "notas", "statusnote", "observaciones", "apunte", "comentario"],
};

export function buildColumnMap(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const h = normHeader(cell);
    if (!h) return;
    // Coincidencia EXACTA únicamente: evita falsos positivos del tipo
    // "nota" → dorsal("no") o "nombre completo" → nombre.
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] !== undefined) continue;
      if (aliases.includes(h)) {
        map[field] = idx;
        return;
      }
    }
  });
  return map;
}

// ---------- Helpers de valor ----------

export function clampRating(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  const n = Math.round(parseFloat(s));
  if (Number.isNaN(n)) return null;
  return Math.min(5, Math.max(1, n));
}

export function parseShirt(raw: string): number | null {
  const s = raw.trim();
  if (!s || /^(sin|no|-)$/i.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : Math.min(999, Math.max(0, n));
}

const STATUS_ALIASES: Record<string, PlayerStatus> = {
  disponible: "AVAILABLE", available: "AVAILABLE", ok: "AVAILABLE",
  lesionado: "INJURED", injured: "INJURED", lesion: "INJURED",
  sancionado: "SUSPENDED", suspended: "SUSPENDED", sancion: "SUSPENDED",
  reincorporacion: "RETURNING", returning: "RETURNING",
};

export function parseStatus(raw: string): PlayerStatus {
  const key = normHeader(raw);
  return STATUS_ALIASES[key] ?? "AVAILABLE";
}

export function parseSecondary(raw: string, main: string): string[] {
  return raw
    .split(/[,;/·+|]|\sy\s/)
    .map((t) => normalizePosition(t))
    .filter((p): p is string => p !== null && p !== main)
    .filter((p, i, arr) => arr.indexOf(p) === i);
}

// ---------- Núcleo de importación (matching + escritura bajo Tenant Guard) ----------

type SquadImportDb = Pick<PrismaClient, "player">;

type TeamLike = {
  id: string;
  clubId: string;
};

/**
 * Aplica una matriz de celdas (ya parseada desde CSV o Excel) a la plantilla
 * del equipo: detecta cabeceras, valida fila a fila, matchea por nombre
 * normalizado (create vs update) y devuelve el resumen con errores legibles.
 * El `db` llega con Tenant Guard: ninguna fila puede escapar del club.
 */
export async function applySquadImport(
  db: SquadImportDb,
  team: TeamLike,
  matrix: string[][],
): Promise<ImportSummary> {
  if (matrix.length < 2) {
    return { ok: false, created: 0, updated: 0, errors: 0, rows: [], error: "El archivo está vacío o solo tiene cabeceras." };
  }

  // ---------- 1) Detectar fila de cabeceras (en las primeras 5 filas) ----------
  let headerIdx = -1;
  let colMap: Record<string, number> = {};
  for (let i = 0; i < Math.min(5, matrix.length); i++) {
    const candidate = buildColumnMap(matrix[i]);
    if (Object.keys(candidate).length >= 3) {
      headerIdx = i;
      colMap = candidate;
      break;
    }
  }
  if (headerIdx === -1 || (colMap.firstName === undefined && colMap.fullName === undefined)) {
    return {
      ok: false, created: 0, updated: 0, errors: 0, rows: [],
      error: 'No encontramos las columnas necesarias. Cabeceras mínimas: "Nombre" y "Posición" (descarga la plantilla).',
    };
  }

  const cell = (row: string[], field: string): string => {
    const idx = colMap[field];
    return idx === undefined ? "" : String(row[idx] ?? "").trim();
  };

  // ---------- 2) Plantilla existente (matching por nombre normalizado) ----------
  const squad = await db.player.findMany({ where: { teamId: team.id } });
  const byName = new Map<string, (typeof squad)[number]>();
  for (const p of squad) {
    byName.set(normalizeName(`${p.firstName} ${p.lastName}`), p);
  }

  // ---------- 3) Procesar filas ----------
  const rows: ImportRowResult[] = [];
  let created = 0;
  let updated = 0;

  const dataRows = matrix.slice(headerIdx + 1).slice(0, MAX_ROWS);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row.some((c) => c.trim() !== "")) continue;

    const rowNo = headerIdx + 2 + i; // 1-based, cabeceras incluidas
    let firstName = cell(row, "firstName");
    let lastName = cell(row, "lastName");
    if (!firstName && cell(row, "fullName")) {
      const parts = cell(row, "fullName").split(/\s+/);
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ") || "-";
    }
    const displayName = `${firstName} ${lastName}`.trim();

    const posRaw = cell(row, "position");
    const mainPosition = normalizePosition(posRaw);

    if (!firstName) {
      rows.push({ row: rowNo, name: displayName || "(sin nombre)", ok: false, action: "error", error: "Falta el nombre del jugador." });
      continue;
    }
    if (!mainPosition) {
      rows.push({ row: rowNo, name: displayName, ok: false, action: "error", error: `Posición "${posRaw}" no reconocida (usa GK, CB, LB, RB, DM, CM, AM, LM, RM, LW, RW, SS, CF o su nombre castellano).` });
      continue;
    }

    const key = normalizeName(displayName);
    const shirtNumber = parseShirt(cell(row, "shirtNumber"));

    // Dorsal duplicado con OTRO jugador → error claro (unique teamId+shirt)
    if (shirtNumber !== null) {
      const owner = squad.find(
        (p) => p.shirtNumber === shirtNumber && normalizeName(`${p.firstName} ${p.lastName}`) !== key,
      );
      if (owner) {
        rows.push({ row: rowNo, name: displayName, ok: false, action: "error", error: `El dorsal ${shirtNumber} ya lo tiene ${owner.firstName} ${owner.lastName}.` });
        continue;
      }
    }

    const existing = byName.get(key);

    const secondary = parseSecondary(cell(row, "secondary"), mainPosition);
    const technical = clampRating(cell(row, "technical"));
    const tactical = clampRating(cell(row, "tactical"));
    const physical = clampRating(cell(row, "physical"));
    const status = cell(row, "status") ? parseStatus(cell(row, "status")) : null;
    const note = cell(row, "note") || null;

    try {
      if (existing) {
        await db.player.update({
          where: { id: existing.id },
          data: {
            firstName,
            lastName,
            ...(shirtNumber !== null ? { shirtNumber } : {}),
            mainPosition: mainPosition as Position,
            secondaryPositions: secondary as Position[],
            ...(technical !== null ? { technicalRating: technical } : {}),
            ...(tactical !== null ? { tacticalRating: tactical } : {}),
            ...(physical !== null ? { physicalRating: physical } : {}),
            ...(status ? { status } : {}),
            ...(note !== null ? { statusNote: note } : {}),
          },
        });
        updated++;
        rows.push({ row: rowNo, name: displayName, ok: true, action: "updated" });
      } else {
        const createdPlayer = await db.player.create({
          data: {
            clubId: team.clubId,
            teamId: team.id,
            firstName,
            lastName,
            shirtNumber,
            mainPosition: mainPosition as Position,
            secondaryPositions: secondary as Position[],
            technicalRating: technical,
            tacticalRating: tactical,
            physicalRating: physical,
            ...(status ? { status } : {}),
            ...(note !== null ? { statusNote: note } : {}),
          },
        });
        squad.push(createdPlayer);
        created++;
        rows.push({ row: rowNo, name: displayName, ok: true, action: "created" });
      }
    } catch (e) {
      rows.push({
        row: rowNo,
        name: displayName,
        ok: false,
        action: "error",
        error: e instanceof Error ? e.message.slice(0, 120) : "Error de base de datos.",
      });
    }
  }

  const errors = rows.filter((r) => !r.ok).length;

  return { ok: errors === 0, created, updated, errors, rows };
}
