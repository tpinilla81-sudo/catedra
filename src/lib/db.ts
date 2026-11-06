// Cliente Prisma base (SIN scope de tenant).
// USO RESTRINGIDO: bootstrap de auth (login), seed y operaciones de plataforma.
// Toda consulta de dominio debe pasar por createTenantClient(clubId) en src/lib/tenant.ts.
import { PrismaClient } from "@prisma/client";
import { ensurePostgresUrl } from "@/lib/env-guard";

ensurePostgresUrl();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
