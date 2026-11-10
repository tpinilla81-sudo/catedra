// E2E API — Pilar 2: /api/pilar2/tasks (POST/GET) y /api/pilar2/tasks/[id] (GET/PUT)
// Requiere: servidor dev en :3000 + cookie jar de sesión (argv[2]).
// Sin dependencias: fetch global. Falla (exit 1) al primer check roto.
import fs from "fs";

const JAR = process.argv[2];
if (!JAR) {
  console.error("Falta la ruta del cookie jar");
  process.exit(1);
}
const BASE = "http://localhost:3000";

// ---------- cookie jar (formato Netscape escrito por curl -c) ----------
// Las líneas de cookies HttpOnly empiezan por "#HttpOnly_" (NO son comentarios).
function cookiesHeader() {
  try {
    return fs
      .readFileSync(JAR, "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("# ") && !l.startsWith("# httponly"))
      .map((l) => {
        const raw = l.startsWith("#HttpOnly_") ? l.slice("#HttpOnly_".length) : l;
        const p = raw.split("\t");
        return `${p[5]}=${p.slice(6).join("\t")}`;
      })
      .filter((c) => c !== "=" && !c.endsWith("="))
      .join("; ");
  } catch {
    return "";
  }
}

let pass = 0;
let fail = 0;
function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ FALLO: ${name} ${extra}`);
  }
}

async function call(method, path, body, { noAuth = false } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(noAuth ? {} : { cookie: cookiesHeader() }),
    },
    redirect: "manual",
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const fichas = (dx = 0) => [
  { id: "a", eq: "propia", x: 10 + dx, y: 34, num: 1 },
  { id: "b", eq: "propia", x: 40 + dx, y: 20, num: 9 },
  { id: "r", eq: "rival", x: 70 + dx, y: 34 },
];
const frame = (dx, etiqueta, extra = {}) => ({
  fichas: fichas(dx),
  balon: { x: 40 + dx, y: 20 + dx, con: "b", ...extra },
  etiqueta,
  ms: 800,
});

const anim3 = {
  clave: "personalizada",
  titulo: "Presión alta test",
  descripcion: "Pizarra E2E",
  fotogramas: [frame(0, "inicio"), frame(6, "pase", { trazo: "pase" }), frame(12, "remate", { trazo: "tiro" })],
};

console.log("— T1 · POST crear tarea con pizarra (title/description/category/animationData)");
let r = await call("POST", "/api/pilar2/tasks", {
  title: "TEST E2E · Rondo 4v2 con pizarra",
  description: "Objetivo E2E: conservación bajo presión con pizarra propia",
  category: "OFFENSIVE",
  animationData: anim3,
});
check("status 201", r.status === 201, `→ ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
const id = r.json?.task?.id;
check("devuelve id", typeof id === "string" && id.length > 0);
check(
  "animationData persistido con 3 fotogramas",
  r.json?.task?.animationData?.fotogramas?.length === 3,
);

console.log("— T2 · GET lista contiene la tarea nueva");
r = await call("GET", "/api/pilar2/tasks?limit=100");
check("status 200", r.status === 200);
check(
  "la tarea aparece en el listado",
  Array.isArray(r.json?.tasks) && r.json.tasks.some((t) => t.id === id),
);

console.log("— T3 · GET ficha individual devuelve la pizarra");
r = await call("GET", `/api/pilar2/tasks/${id}`);
check("status 200", r.status === 200);
check(
  "fotogramas == 3 y coordenadas acotadas",
  r.json?.task?.animationData?.fotogramas?.length === 3 &&
    r.json.task.animationData.fotogramas.every((f) =>
      f.fichas.every((p) => p.x >= 0 && p.x <= 105 && p.y >= 0 && p.y <= 68),
    ),
);

console.log("— T4 · PUT actualiza la pizarra (2 fotogramas) y el título");
r = await call("PUT", `/api/pilar2/tasks/${id}`, {
  title: "TEST E2E · Rondo editado",
  animationData: { ...anim3, fotogramas: [frame(0, "solo inicio"), frame(8, "salida", { trazo: "conduccion" })] },
});
check("status 200", r.status === 200, `→ ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
check("fotogramas == 2 tras el PUT", r.json?.task?.animationData?.fotogramas?.length === 2);
check("título actualizado", r.json?.task?.title === "TEST E2E · Rondo editado");

console.log("— T5 · PUT con pizarra corrupta → 400 (nunca se persiste)");
r = await call("PUT", `/api/pilar2/tasks/${id}`, { animationData: { fotogramas: "no-soy-array" } });
check("status 400", r.status === 400, `→ ${r.status}`);
r = await call("PUT", `/api/pilar2/tasks/${id}`, {
  animationData: {
    ...anim3,
    fotogramas: [
      { fichas: [{ id: "a", eq: "propia", x: 999, y: 34, num: 1 }, ...fichas().slice(1)], balon: { x: 40, y: 20, con: "b" }, etiqueta: "clamp" },
      frame(8, "salida", { trazo: "conduccion" }),
    ],
  },
});
check("coordenadas fuera del campo se ACOTAN → 200", r.status === 200, `→ ${r.status}`);
check(
  "x=999 persistido como 105 (clamp al campo)",
  r.json?.task?.animationData?.fotogramas?.[0]?.fichas?.[0]?.x === 105,
  `→ ${JSON.stringify(r.json?.task?.animationData?.fotogramas?.[0]?.fichas?.[0])}`,
);

console.log("— T6 · PUT partial SIN animationData NO borra la pizarra");
r = await call("PUT", `/api/pilar2/tasks/${id}`, { repetitions: "3 series x 5'" });
check("status 200", r.status === 200);
check("pizarra intacta (2 fotogramas)", r.json?.task?.animationData?.fotogramas?.length === 2);

console.log("— T7 · animationData null borra la pizarra");
r = await call("PUT", `/api/pilar2/tasks/${id}`, { animationData: null });
check("status 200", r.status === 200);
check("animationData == null", r.json?.task?.animationData === null);

console.log("— T8 · POST sin sesión → 401");
r = await call(
  "POST",
  "/api/pilar2/tasks",
  { title: "Anónimo", description: "no deberías", category: "OFFENSIVE" },
  { noAuth: true },
);
check("status 401", r.status === 401, `→ ${r.status}`);

console.log("— T9 · POST con categoría inválida → 400");
r = await call("POST", "/api/pilar2/tasks", {
  title: "Fase rara",
  description: "categoría imposible",
  category: "NAVAL",
});
check("status 400", r.status === 400, `→ ${r.status}`);

console.log("— T10 · GET id inexistente → 404");
r = await call("GET", "/api/pilar2/tasks/no-existe-123");
check("status 404", r.status === 404, `→ ${r.status}`);

console.log(`\nRESULTADO API E2E: ${pass} OK · ${fail} FALLOS`);
process.exit(fail > 0 ? 1 : 0);
