// Bootstrap de PostgreSQL local para desarrollo (sin root, binarios embebidos).
// Idempotente: si ya hay un PG sirviendo en :5432, no toca nada; si no, repara
// los dirs de runtime que git no versiona, ajusta permisos y arranca.
// En producción (Vercel + Neon) esto NO se usa: solo DATABASE_URL de Neon.
// Lo invoca `npm run dev` en segundo plano → la app siempre tiene base de datos.
import EmbeddedPostgres from "embedded-postgres";
import fs from "fs";
import net from "net";

const DATA_DIR = "/home/z/my-project/.pgdata";
const PORT = 5432;

// ¿Ya hay un PostgreSQL escuchando? → nada que hacer (arranque idempotente).
const portOpen = await new Promise((resolve) => {
  const s = net.connect({ host: "localhost", port: PORT }, () => {
    s.end();
    resolve(true);
  });
  s.on("error", () => resolve(false));
  s.setTimeout(1500, () => {
    s.destroy();
    resolve(false);
  });
});
if (portOpen) {
  console.log("PG: ya activo en :5432 — no se toca nada");
  process.exit(0);
}

try {
  // Dirs de runtime que git no versiona (vacíos): sin ellos postmaster no arranca.
  for (const d of [
    "pg_notify", "pg_tblspc", "pg_replslot", "pg_twophase", "pg_commit_ts",
    "pg_stat_tmp", "pg_dynshmem", "pg_snapshots", "pg_serial", "pg_sockets",
    "pg_multixact/members", "pg_multixact/offsets", "pg_wal/archive_status",
    "pg_subtrans", "pg_logical/mappings", "pg_logical/snapshots",
  ]) {
    fs.mkdirSync(`${DATA_DIR}/${d}`, { recursive: true });
  }
  fs.chmodSync(DATA_DIR, 0o700);

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
  });

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

// Mantener el proceso vivo mientras dure el dev server
setInterval(() => {}, 1 << 30);
