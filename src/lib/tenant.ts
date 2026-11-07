// ============================================================================
// TENANT GUARD — Aislamiento multi-tenant por Club (Prisma Client Extension)
// ----------------------------------------------------------------------------
// Toda consulta/escritura de dominio pasa por aquí. El clubId proviene SIEMPRE
// de la sesión JWT (nunca del cliente), por lo que un usuario de un club no
// puede leer ni escribir datos de otro, aunque manipule IDs en el front.
//
// Estrategias por modelo:
//   1. CLUB_SCOPED     → tiene clubId propio: se inyecta { clubId } en el where
//                        y se valida/inyecta en create/createMany/upsert.
//   2. LIBRARY_SCOPED  → Task / SubPrinciple: visibilidad "propio + Cátedra
//                        global" (OR: [{ clubId }, { clubId: null }]).
//                        Escritura: siempre se fuerza clubId del tenant (nunca
//                        un usuario puede publicar contenido global).
//   3. RELATION_SCOPED → modelos sin clubId (TacticalEvent, Session...): el
//                        scope se inyecta como filtro por la relación padre.
//   4. EXCLUDED        → Club / User: gestionados directamente por la capa de
//                        auth (login, perfil). Nunca expuestos a listados de dominio.
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

type Row = Record<string, unknown>;

/** Modelos con clubId propio */
const CLUB_SCOPED = new Set([
  "Season",
  "Team",
  "Player",
  "TeamPulse",
  "Match",
  "Microcycle",
  "EngineRun",
]);

/** Modelos de la Biblioteca de Sabiduría: propios del club + Cátedra global (clubId = null) */
const LIBRARY_SCOPED = new Set(["Task", "SubPrinciple"]);

/** Modelos sin clubId: aislamiento por la relación hacia su padre del tenant */
const RELATION_SCOPES: Record<string, (clubId: string) => Row> = {
  MatchReport: (c) => ({ match: { clubId: c } }),
  TacticalEvent: (c) => ({ report: { match: { clubId: c } } }),
  PlayerMatchNote: (c) => ({ report: { match: { clubId: c } } }),
  Session: (c) => ({ microcycle: { clubId: c } }),
  SessionTask: (c) => ({ session: { microcycle: { clubId: c } } }),
  // DiagnosisIssue no lleva clubId propio: cuelga de Microcycle (del tenant)
  DiagnosisIssue: (c) => ({ microcycle: { clubId: c } }),
  MicrocycleMatch: (c) => ({
    OR: [{ microcycle: { clubId: c } }, { match: { clubId: c } }],
  }),
  TaskSubPrinciple: (c) => ({
    task: { OR: [{ clubId: c }, { clubId: null }] },
  }),
};

const WHERE_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

function scopeFor(model: string, clubId: string): Row | null {
  if (CLUB_SCOPED.has(model)) return { clubId };
  if (LIBRARY_SCOPED.has(model)) return { OR: [{ clubId }, { clubId: null }] };
  const rel = RELATION_SCOPES[model];
  return rel ? rel(clubId) : null;
}

/** Combina el where original con el scope (semántica AND) */
function withScope(where: Row | undefined, scope: Row): Row {
  const base = where ?? {};
  const prevAnd = base.AND;
  const andList: Row[] = Array.isArray(prevAnd)
    ? (prevAnd as Row[])
    : prevAnd
      ? [prevAnd as Row]
      : [];
  return { ...base, AND: [...andList, scope] };
}

/** Inyecta o valida clubId en un objeto data de escritura */
function enforceClubId(data: Row, clubId: string, model: string): Row {
  if (data.clubId && data.clubId !== clubId) {
    throw new Error(
      `Tenant Guard: escritura cross-tenant bloqueada en ${model}.`,
    );
  }
  return { ...data, clubId };
}

export function createTenantClient(clubId: string | null): PrismaClient {
  // PLATFORM_ADMIN (clubId = null): modo plataforma, sin inyección.
  // Solo se usa en APIs de administración; el flujo de club nunca llega aquí.
  if (!clubId) return db;

  return db.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelName = model as string;
          const a = args as Row;

          // 1) Escrituras: forzar clubId del tenant
          const writesData =
            operation === "create" ||
            operation === "createMany" ||
            operation === "upsert";
          if (writesData && (CLUB_SCOPED.has(modelName) || LIBRARY_SCOPED.has(modelName))) {
            if (operation === "create") {
              a.data = enforceClubId(a.data as Row, clubId, modelName);
            } else if (operation === "createMany") {
              a.data = Array.isArray(a.data)
                ? (a.data as Row[]).map((d) => enforceClubId(d, clubId, modelName))
                : enforceClubId(a.data as Row, clubId, modelName);
            } else if (operation === "upsert") {
              a.create = enforceClubId(a.create as Row, clubId, modelName);
            }
          }

          // 2) Lecturas/escrituras con where: inyectar scope en AND
          const scope = scopeFor(modelName, clubId);
          if (scope && WHERE_OPS.has(operation)) {
            a.where = withScope(a.where as Row | undefined, scope);
          }

          return query(a);
        },
      },
    },
  }) as unknown as PrismaClient;
}
