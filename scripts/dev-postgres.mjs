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
  // Reparar dirs de runtime SOLO si ya existe un clúster válido (PG_VERSION).
  // Si .pgdata no existe o está vacía (sandbox reciclado), hay que dejar que el
  // initdb de la librería inicialice de cero: crear los dirs ANTES hace que la
  // librería crea que ya hay clúster y salta initdb → "postgresql.conf missing".
  const hasCluster = fs.existsSync(`${DATA_DIR}/PG_VERSION`);
  if (hasCluster) {
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
  } else {
    if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true, force: true });
    console.log("PG: sin clúster previo → initdb desde cero");
  }

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
  });

  // Sin clúster previo (PG_VERSION ausente) la librería NO auto-inicializa:
  // hay que ejecutar initdb explícitamente antes de arrancar postmaster.
  if (!fs.existsSync(`${DATA_DIR}/PG_VERSION`)) {
    console.log("PG: ejecutando initdb (initialise)…");
    await pg.initialise();
    fs.chmodSync(DATA_DIR, 0o700);
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

// Mantener el proceso vivo mientras dure el dev server
setInterval(() => {}, 1 << 30);
