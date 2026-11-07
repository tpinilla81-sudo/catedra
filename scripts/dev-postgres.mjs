// Bootstrap de PostgreSQL local para desarrollo (sin root, binarios embebidos).
// Idempotente: si el data dir ya existe, solo arranca y garantiza la BD "metodo".
// En producción (Vercel + Neon) esto NO se usa: solo DATABASE_URL de Neon.
import EmbeddedPostgres from "embedded-postgres";
import fs from "fs";

const DATA_DIR = "/home/z/my-project/.pgdata";

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "postgres",
  password: "postgres",
  port: 5432,
  persistent: true,
});

try {
  if (!fs.existsSync(DATA_DIR)) {
    await pg.initialise();
    console.log("PG: data dir inicializado");
  }
  await pg.start();
  console.log("PG: servidor arrancado en :5432");
  try {
    await pg.createDatabase("metodo");
    console.log("PG: base de datos 'metodo' creada");
  } catch {
    console.log("PG: base de datos 'metodo' ya existía");
  }
  console.log("POSTGRES_READY");
} catch (err) {
  console.error("PG bootstrap error:", err);
  process.exit(1);
}

// Mantener el proceso vivo
setInterval(() => {}, 1 << 30);
