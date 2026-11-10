// ============================================================================
// API — PILAR 3: EVALUACIÓN TÁCTICA EN DIRECTO (tablón + ficha rápida 1-toque)
// ----------------------------------------------------------------------------
//   POST /api/matches/:matchId/evaluations
//        { playerId, isStarter?, tagCode?,
//          fatigueFlag?: FatigueFlag|null, clinicalFlag?: ClinicalFlag|null,
//          tacticalFlag?: TacticalFlag|null }
//        → upsert de la evaluación (1 por jugador y partido) + tag opcional
//          + estado de la ficha rápida (los 3 ejes de la ficha 1-toque).
//        Sin tagCode solo marca/quita la alineación de partida (isStarter).
//        Los flags son ESTADO: solo se toca el eje presente en el body;
//        null explícito apaga el eje (toggle), valor válido lo fija.
//   GET  /api/matches/:matchId/evaluations
//        → evaluaciones + tags + estado de la ficha (restaurar el tablón).
//
// Multi-tenant: el clubId viene SIEMPRE de la sesión JWT. Match y Player se
// leen a través del cliente con Tenant Guard (un id de otro club desaparece →
// 404); LiveMatchEvaluation/MatchTag no llevan clubId propio, así que toda
// escritura se construye únicamente con ids ya validados contra el club.
// El tipo del tag (POSITIVE/CORRECTIVE) y la validez de los flags los decide
// el servidor con los mapas canónicos de taxonomy.ts — nunca se confía en
// el cliente.
// ============================================================================
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type {
  ClinicalFlag,
  FatigueFlag,
  TacticalFlag,
  TagCode,
} from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { createTenantClient } from "@/lib/tenant";
import {
  CLINICAL_FLAG_META,
  FATIGUE_FLAG_META,
  TACTICAL_FLAG_META,
  TACTICAL_TAG_META,
} from "@/lib/taxonomy";

type RouteParams = { params: Promise<{ id: string }> };

type EvalBody = {
  playerId?: string;
  isStarter?: boolean;
  tagCode?: string;
  fatigueFlag?: string | null;
  clinicalFlag?: string | null;
  tacticalFlag?: string | null;
};

/** Ejes de estado de la ficha rápida → mapa canónico que valida cada valor */
const FLAG_AXES = {
  fatigueFlag: FATIGUE_FLAG_META,
  clinicalFlag: CLINICAL_FLAG_META,
  tacticalFlag: TACTICAL_FLAG_META,
} as const;

type FlagKey = keyof typeof FLAG_AXES;

export async function POST(
  req: NextRequest,
  { params }: RouteParams,
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.clubId) {
    return NextResponse.json(
      { ok: false, error: "Sesión no válida." },
      { status: 401 },
    );
  }

  const { id: matchId } = await params;
  const body = (await req.json().catch(() => null)) as EvalBody | null;
  const playerId = typeof body?.playerId === "string" ? body.playerId : "";
  if (!playerId) {
    return NextResponse.json(
      { ok: false, error: "Falta el jugador." },
      { status: 400 },
    );
  }

  const tagCode = body?.tagCode;
  if (tagCode !== undefined && !(tagCode in TACTICAL_TAG_META)) {
    return NextResponse.json(
      { ok: false, error: "Tag táctico desconocido." },
      { status: 400 },
    );
  }

  // Ejes de estado presentes en el body (ausente = no tocar, null = apagar).
  // Un valor no canónico en cualquier eje → 400, sin tocar la base de datos.
  const rawBody = (body ?? {}) as Record<string, unknown>;
  const flagPatch: Partial<{
    fatigueFlag: FatigueFlag | null;
    clinicalFlag: ClinicalFlag | null;
    tacticalFlag: TacticalFlag | null;
  }> = {};
  for (const axis of Object.keys(FLAG_AXES) as FlagKey[]) {
    if (!(axis in rawBody)) continue;
    const value = rawBody[axis];
    if (value === null || value === "") {
      flagPatch[axis] = null;
      continue;
    }
    if (typeof value === "string" && value in FLAG_AXES[axis]) {
      flagPatch[axis] = value as FatigueFlag & ClinicalFlag & TacticalFlag;
      continue;
    }
    return NextResponse.json(
      { ok: false, error: "Estado de la ficha rápida desconocido." },
      { status: 400 },
    );
  }

  const db = createTenantClient(session.user.clubId);

  // Lecturas con guard: un partido o jugador de otro club no existe para esta sesión
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { id: true, teamId: true },
  });
  if (!match) {
    return NextResponse.json(
      { ok: false, error: "Partido no encontrado." },
      { status: 404 },
    );
  }

  const player = await db.player.findUnique({
    where: { id: playerId },
    select: { id: true, teamId: true, isActive: true },
  });
  if (!player) {
    return NextResponse.json(
      { ok: false, error: "Jugador no encontrado." },
      { status: 404 },
    );
  }
  if (player.teamId !== match.teamId || !player.isActive) {
    return NextResponse.json(
      { ok: false, error: "El jugador no pertenece a este partido." },
      { status: 400 },
    );
  }

  // Upsert de la evaluación (única por partido+jugador): isStarter es la
  // alineación de partida y se puede corregir en cualquier momento. Si se
  // toca algún eje de estado, statusUpdatedAt deja marca de tiempo del toque.
  const isStarter = Boolean(body?.isStarter);
  const statusData = Object.keys(flagPatch).length
    ? { ...flagPatch, statusUpdatedAt: new Date() }
    : {};
  const evaluation = await db.liveMatchEvaluation.upsert({
    where: { matchId_playerId: { matchId: match.id, playerId: player.id } },
    create: { matchId: match.id, playerId: player.id, isStarter, ...statusData },
    update: { isStarter, ...statusData },
  });

  let tag: { id: string; code: string; type: string } | null = null;
  if (tagCode) {
    const meta = TACTICAL_TAG_META[tagCode];
    const created = await db.matchTag.create({
      data: {
        evaluationId: evaluation.id,
        code: tagCode as TagCode,
        type: meta.type,
      },
    });
    tag = { id: created.id, code: created.code, type: created.type };
  }

  const totalTags = await db.matchTag.count({
    where: { evaluationId: evaluation.id },
  });

  return NextResponse.json({
    ok: true,
    evaluation: {
      id: evaluation.id,
      playerId: evaluation.playerId,
      isStarter: evaluation.isStarter,
      totalTags,
      fatigueFlag: evaluation.fatigueFlag,
      clinicalFlag: evaluation.clinicalFlag,
      tacticalFlag: evaluation.tacticalFlag,
      statusUpdatedAt: evaluation.statusUpdatedAt?.toISOString() ?? null,
    },
    tag,
  });
}

export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.clubId) {
    return NextResponse.json(
      { ok: false, error: "Sesión no válida." },
      { status: 401 },
    );
  }

  const { id: matchId } = await params;
  const db = createTenantClient(session.user.clubId);

  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { id: true },
  });
  if (!match) {
    return NextResponse.json(
      { ok: false, error: "Partido no encontrado." },
      { status: 404 },
    );
  }

  const evaluations = await db.liveMatchEvaluation.findMany({
    where: { matchId: match.id },
    orderBy: { timestamp: "asc" },
    include: { tags: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json({
    ok: true,
    evaluations: evaluations.map((e) => ({
      playerId: e.playerId,
      isStarter: e.isStarter,
      fatigueFlag: e.fatigueFlag,
      clinicalFlag: e.clinicalFlag,
      tacticalFlag: e.tacticalFlag,
      statusUpdatedAt: e.statusUpdatedAt?.toISOString() ?? null,
      timestamp: e.timestamp.toISOString(),
      tags: e.tags.map((t) => ({
        id: t.id,
        code: t.code,
        type: t.type,
        createdAt: t.createdAt.toISOString(),
      })),
    })),
  });
}
