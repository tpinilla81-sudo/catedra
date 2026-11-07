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
//                        Escritura: en create se fuerza clubId del tenant; en
//                        update se RECHAZA un clubId ajeno (nunca se reescribe
//                        el club de una fila para "nacionalizar" contenido
//                        global de la Cátedra).
//   3. RELATION_SCOPED → modelos sin clubId (TacticalEvent, Session...): el
//                        scope se inyecta como filtro por la relación padre Y
//                        todo create/upsert valida las FKs del padre contra el
//                        club del contexto antes de tocar la base.
//   4. EXCLUDED        → Club / User: gestionados directamente por la capa de
//                        auth (login, perfil). Nunca expuestos a listados de
//                        dominio; aun así sus escrituras validan FKs.
//
// VALIDACIÓN DE FKs EN ESCRITURAS (severidad 1 de la auditoría forense):
//   En create / createMany / update / updateMany / upsert —incluidas escrituras
//   anidadas (create / connect / connectOrCreate / update / upsert a cualquier
//   profundidad)— toda FK escalar (teamId, reportId, subPrincipleId...) o
//   `connect` presente en el payload se comprueba contra la base:
//     • Si el registro destino EXISTE y pertenece a otro club → ERROR.
//     • Si el destino NO existe (aún sin commit dentro de la MISMA transacción
//       —el padre se crea en la misma tx que sus hijos en la ingesta y en el
//       motor—, o id colgante) se permite pasar: la FK de PostgreSQL actúa de
//       última red contra ids inválidos.
//   Las claves de datos planos (Json: metric, inputSnapshot, issuesJson...)
//   y los arrays de datos nunca se interpretan como escrituras anidadas.
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
  // Receta: la tarea Y el subprincipio deben ser visibles para el club
  // (propio o Cátedra global). Solo filtrar por task dejaba ver en el include
  // la conexión tarea-global → subprincipio PRIVADO de otro club.
  TaskSubPrinciple: (c) => ({
    AND: [
      { task: { OR: [{ clubId: c }, { clubId: null }] } },
      { subPrinciple: { OR: [{ clubId: c }, { clubId: null }] } },
    ],
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

const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

const NESTED_WRITE_KEYS = [
  "create",
  "connect",
  "connectOrCreate",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "set",
  "disconnect",
] as const;

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

// ============================================================================
// VALIDACIÓN ANTI CROSS-TENANT DE FKs EN ESCRITURAS
// ============================================================================

type RawDelegate = {
  findMany: (args: { where: Row; select: Row }) => Promise<Row[]>;
};

function delegate(model: string): RawDelegate {
  return (db as unknown as Record<string, RawDelegate>)[model];
}

/** Un check valida un grupo de ids y devuelve los que son EXTRANJEROS al club */
type FkCheck = {
  label: string;
  foreign: (ids: string[], clubId: string) => Promise<Set<string>>;
};

/**
 * Regla para modelos con clubId propio (o biblioteca: clubId null = Cátedra,
 * visible para todos). Un destino SIN registro (misma tx / id colgante) nunca
 * se considera extranjero: lo decide la FK de PostgreSQL.
 */
function clubOwned(model: string, label: string): FkCheck {
  return {
    label,
    foreign: async (ids, clubId) => {
      if (ids.length === 0) return new Set();
      const rows = await delegate(model).findMany({
        where: { id: { in: ids } },
        select: { id: true, clubId: true },
      });
      const out = new Set<string>();
      for (const r of rows) {
        if (r.clubId != null && r.clubId !== clubId) out.add(r.id as string);
      }
      return out;
    },
  };
}

/** Regla para modelos colgantes: extranjero si su padre (vía include) lo es */
function viaParent(model: string, label: string, select: Row, owners: Array<(r: Row) => unknown>): FkCheck {
  return {
    label,
    foreign: async (ids, clubId) => {
      if (ids.length === 0) return new Set();
      const rows = await delegate(model).findMany({
        where: { id: { in: ids } },
        select,
      });
      const out = new Set<string>();
      for (const r of rows) {
        const foreign = owners.some((get) => {
          const club = get(r);
          return club != null && club !== clubId;
        });
        if (foreign) out.add(r.id as string);
      }
      return out;
    },
  };
}

/** Combinación para claves de relación compartidas por varios modelos */
function anyOf(label: string, checks: FkCheck[]): FkCheck {
  return {
    label,
    foreign: async (ids, clubId) => {
      const out = new Set<string>();
      for (const c of checks) {
        for (const id of await c.foreign(ids, clubId)) out.add(id);
      }
      return out;
    },
  };
}

const FK = {
  club: {
    label: "club",
    foreign: async (ids: string[], clubId: string) =>
      new Set(ids.filter((id) => id !== clubId)),
  } as FkCheck,
  team: clubOwned("team", "team"),
  season: clubOwned("season", "season"),
  match: clubOwned("match", "match"),
  player: clubOwned("player", "player"),
  teamPulse: clubOwned("teamPulse", "teamPulse"),
  microcycle: clubOwned("microcycle", "microcycle"),
  engineRun: clubOwned("engineRun", "engineRun"),
  user: clubOwned("user", "usuario (capturedBy/createdBy/acceptedBy)"),
  task: clubOwned("task", "task"),
  subPrinciple: clubOwned("subPrinciple", "subPrinciple"),
  session: viaParent(
    "session",
    "session.microcycle.clubId",
    { id: true, microcycle: { select: { clubId: true } } },
    [(r) => (r.microcycle as Row | undefined)?.clubId],
  ),
  report: viaParent(
    "matchReport",
    "report.match.clubId",
    { id: true, match: { select: { clubId: true } } },
    [(r) => (r.match as Row | undefined)?.clubId],
  ),
  issue: viaParent(
    "diagnosisIssue",
    "issue.microcycle.clubId",
    { id: true, microcycle: { select: { clubId: true } } },
    [(r) => (r.microcycle as Row | undefined)?.clubId],
  ),
  tacticalEvent: viaParent(
    "tacticalEvent",
    "tacticalEvent.report.match.clubId",
    { id: true, report: { select: { match: { select: { clubId: true } } } } },
    [(r) => ((r.report as Row | undefined)?.match as Row | undefined)?.clubId],
  ),
  playerMatchNote: viaParent(
    "playerMatchNote",
    "playerMatchNote (report o player de otro club)",
    {
      id: true,
      report: { select: { match: { select: { clubId: true } } } },
      player: { select: { clubId: true } },
    },
    [
      (r) => ((r.report as Row | undefined)?.match as Row | undefined)?.clubId,
      (r) => (r.player as Row | undefined)?.clubId,
    ],
  ),
  sessionTask: viaParent(
    "sessionTask",
    "sessionTask (session o task de otro club)",
    {
      id: true,
      session: { select: { microcycle: { select: { clubId: true } } } },
      task: { select: { clubId: true } },
    },
    [
      (r) =>
        ((r.session as Row | undefined)?.microcycle as Row | undefined)?.clubId,
      (r) => (r.task as Row | undefined)?.clubId,
    ],
  ),
  taskSubPrinciple: viaParent(
    "taskSubPrinciple",
    "taskSubPrinciple (task o subPrinciple de otro club)",
    {
      id: true,
      task: { select: { clubId: true } },
      subPrinciple: { select: { clubId: true } },
    },
    [
      (r) => (r.task as Row | undefined)?.clubId,
      (r) => (r.subPrinciple as Row | undefined)?.clubId,
    ],
  ),
  microcycleMatch: viaParent(
    "microcycleMatch",
    "microcycleMatch (microcycle o match de otro club)",
    {
      id: true,
      microcycle: { select: { clubId: true } },
      match: { select: { clubId: true } },
    },
    [
      (r) => (r.microcycle as Row | undefined)?.clubId,
      (r) => (r.match as Row | undefined)?.clubId,
    ],
  ),
};

/** FKs escalares → check (nota: clubId se rechaza directamente en el walker) */
const FK_FIELDS: Record<string, FkCheck> = {
  teamId: FK.team,
  lastTeamId: FK.team,
  seasonId: FK.season,
  matchId: FK.match,
  playerId: FK.player,
  microcycleId: FK.microcycle,
  sessionId: FK.session,
  reportId: FK.report,
  taskId: FK.task,
  subPrincipleId: FK.subPrinciple,
  parentId: FK.subPrinciple,
  createdById: FK.user,
  capturedById: FK.user,
  acceptedById: FK.user,
  prescribedIssueId: FK.issue,
};

/**
 * Nombres de relación usables en escrituras (connect/connectOrCreate/set).
 * Las claves compartidas ("tasks", "subPrinciples", "issues"...) combinan los
 * checks de todos los modelos que las usan: cualquier destino que pertenezca
 * a otro club bloquea la escritura; los ids sin registro quedan a la FK.
 */
const RELATION_FIELDS: Record<string, FkCheck> = {
  club: FK.club,
  team: FK.team,
  lastTeam: FK.team,
  season: FK.season,
  match: FK.match,
  player: FK.player,
  microcycle: FK.microcycle,
  session: FK.session,
  report: FK.report,
  task: FK.task,
  subPrinciple: FK.subPrinciple,
  parent: FK.subPrinciple,
  capturedBy: FK.user,
  createdBy: FK.user,
  acceptedBy: FK.user,
  issue: FK.issue,
  analyzedMatches: FK.microcycleMatch,
  usedInMicrocycles: FK.microcycleMatch,
  tasks: anyOf("tasks (SessionTask/TaskSubPrinciple/Task)", [
    FK.sessionTask,
    FK.taskSubPrinciple,
    FK.task,
  ]),
  subPrinciples: anyOf("subPrinciples (TaskSubPrinciple/SubPrinciple)", [
    FK.taskSubPrinciple,
    FK.subPrinciple,
  ]),
  issues: FK.issue,
  events: FK.tacticalEvent,
  playerNotes: FK.playerMatchNote,
  children: FK.subPrinciple,
  createdTasks: FK.task,
  createdReports: FK.report,
  acceptedCycles: FK.microcycle,
  capturedPulses: FK.teamPulse,
  pulses: FK.teamPulse,
  engineRuns: FK.engineRun,
};

function isNestedWrite(v: Row): boolean {
  return NESTED_WRITE_KEYS.some((k) => k in v);
}

function addFk(req: Map<FkCheck, Set<string>>, chk: FkCheck, id: string): void {
  const set = req.get(chk);
  if (set) set.add(id);
  else req.set(chk, new Set([id]));
}

/**
 * Recorre el payload de escritura (a cualquier profundidad) y acumula los ids
 * de FK que hay que validar. Lanza de inmediato si encuentra un clubId ajeno.
 * Solo recorre formas de escritura anidada de Prisma; los objetos de datos
 * planos (Json: metric, inputSnapshot, issuesJson, prescriptions...) y los
 * arrays que no cuelgan de claves de escritura anidada se ignoran.
 */
function collectTenantFks(
  modelName: string,
  payload: unknown,
  clubId: string,
  req: Map<FkCheck, Set<string>>,
): void {
  if (!payload || typeof payload !== "object") return;
  if (Array.isArray(payload)) {
    for (const item of payload) collectTenantFks(modelName, item, clubId, req);
    return;
  }
  const row = payload as Row;

  // El clubId, si aparece en CUALQUIER nivel del payload, jamás puede ser otro
  if (typeof row.clubId === "string" && row.clubId !== clubId) {
    throw new Error(
      `Tenant Guard: escritura cross-tenant bloqueada en ${modelName} (clubId ajeno).`,
    );
  }

  // (c) Item { where, data } de update/updateMany anidados (to-many): los FKs
  //     relevantes viven en `data`
  if (row.where !== undefined && row.data !== undefined) {
    collectTenantFks(modelName, row.data, clubId, req);
  }

  for (const [key, val] of Object.entries(row)) {
    // (a) FK escalar presente en data (a cualquier profundidad del payload)
    const fk = FK_FIELDS[key];
    if (fk && (typeof val === "string" || typeof val === "number")) {
      addFk(req, fk, String(val));
      continue;
    }
    if (val == null || typeof val !== "object" || Array.isArray(val)) continue;

    const nested = val as Row;
    // (b) connect / connectOrCreate / set → el destino debe ser del club
    for (const op of ["connect", "connectOrCreate", "set"] as const) {
      const target = nested[op];
      if (target == null) continue;
      const list = Array.isArray(target) ? target : [target];
      for (const t of list) {
        if (!t || typeof t !== "object") continue;
        const raw = t as Row;
        const id =
          op === "connectOrCreate" ? (raw.where as Row | undefined)?.id : raw.id;
        if (
          (typeof id === "string" || typeof id === "number") &&
          RELATION_FIELDS[key]
        ) {
          addFk(req, RELATION_FIELDS[key], String(id));
        }
      }
    }
    // Los objetos planos (Json) que no son escritura anidada no se recorren
    if (!isNestedWrite(nested)) continue;
  }

  // (d) Recorrido en profundidad de las formas de escritura anidada
  for (const nk of NESTED_WRITE_KEYS) {
    const nv = row[nk];
    if (nv == null || typeof nv !== "object") continue;
    collectTenantFks(modelName, nv, clubId, req);
  }
}

/** Ejecuta la validación acumulada: cualquier FK extranjera aborta la escritura */
async function assertTenantFks(
  modelName: string,
  payload: unknown,
  clubId: string,
): Promise<void> {
  if (!payload || typeof payload !== "object") return;
  const req = new Map<FkCheck, Set<string>>();
  collectTenantFks(modelName, payload, clubId, req);
  for (const [chk, ids] of req) {
    const foreign = await chk.foreign([...ids], clubId);
    if (foreign.size > 0) {
      throw new Error(
        `Tenant Guard: escritura cross-tenant bloqueada en ${modelName} — ${chk.label} (${[...foreign].join(", ")}) pertenece a otro club.`,
      );
    }
  }
}

// ============================================================================

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
          const isClub = CLUB_SCOPED.has(modelName);
          const isLib = LIBRARY_SCOPED.has(modelName);

          // ---------- 1) Escrituras: clubId del tenant + FKs anti cross-tenant ----------
          if (CREATE_OPS.has(operation)) {
            if (isClub || isLib) {
              if (operation === "create") {
                a.data = enforceClubId(a.data as Row, clubId, modelName);
              } else {
                // createMany / createManyAndReturn: objeto o array de filas
                if (Array.isArray(a.data)) {
                  a.data = (a.data as Row[]).map((d) =>
                    enforceClubId(d, clubId, modelName),
                  );
                } else {
                  a.data = enforceClubId(a.data as Row, clubId, modelName);
                }
              }
            }
            await assertTenantFks(modelName, a.data, clubId);
          } else if (operation === "upsert") {
            // Rama create: inyecta clubId del tenant (nunca cross-tenant)
            if (isClub || isLib) {
              a.create = enforceClubId(a.create as Row, clubId, modelName);
            }
            await assertTenantFks(modelName, a.create, clubId);
            // Rama update: en CLUB_SCOPED la fila ya es del tenant (el where
            // lleva scope) → clubId validado/inyectado; en LIBRARY_SCOPED el
            // walker RECHAZA un clubId ajeno sin reescribir filas globales.
            if (isClub) {
              a.update = enforceClubId(a.update as Row, clubId, modelName);
            }
            await assertTenantFks(modelName, a.update, clubId);
          } else if (operation === "update" || operation === "updateMany") {
            // En CLUB_SCOPED la fila destino ya es del tenant → inyectar/validar
            if (isClub) {
              a.data = enforceClubId(a.data as Row, clubId, modelName);
            }
            await assertTenantFks(modelName, a.data, clubId);
          }

          // ---------- 2) Lecturas/escrituras con where: inyectar scope en AND ----------
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
