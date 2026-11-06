// Guard de entorno para desarrollo en sandbox.
// El sandbox exporta DATABASE_URL=file:... (SQLite del template) por encima del .env;
// aquí lo corregimos para que TODA la app apunte siempre al PostgreSQL local/dev.
// En producción (Vercel + Neon) process.env.DATABASE_URL ya es postgres y esto no hace nada.

export function ensurePostgresUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/metodo";
    return process.env.DATABASE_URL;
  }
  return url;
}
