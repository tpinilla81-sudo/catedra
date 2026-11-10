// E2E API — Pilar 3: pizarra espacial causa→efecto (vector completo + auto-clip)
// Requiere: servidor dev en :3000 + cookie jar de sesión (argv[2]) + matchId (argv[3]).
// Sin dependencias: fetch global. Falla (exit 1) al final si hay checks rotos.
import fs from "fs";

const JAR = process.argv[2];
const MATCH_ID = process.argv[3];
if (!JAR || !MATCH_ID) {
  console.error("Uso: node scripts/verify-pilar3-espacial.mjs <cookie-jar> <matchId>");
  process.exit(1);
}
const BASE = "http://localhost:3000";

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

// ---------- 1 · sin sesión no hay API ----------
{
  const r = await call("POST", "/api/pilar3/events", { matchId: MATCH_ID, events: [] }, { noAuth: true });
  check("POST /api/pilar3/events sin sesión → 401", r.status === 401, `status=${r.status}`);
}

// ---------- 2 · la página en directo trae el botón Espacial (SSR) ----------
{
  const res = await fetch(`${BASE}/dashboard/match/live?g=${MATCH_ID}`, {
    headers: { cookie: cookiesHeader() },
    redirect: "manual",
  });
  const html = await res.text();
  check("GET /dashboard/match/live → 200", res.status === 200, `status=${res.status}`);
  check("página firma el botón Espacial", html.includes("Pizarra espacial causa a efecto"), "");
}

// ---------- 3 · reloj (idempotente: auto-arranque cubierto igualmente) ----------
{
  const r = await call("POST", "/api/pilar3/events", { matchId: MATCH_ID, action: "START" });
  check("START del reloj → ok", r.json?.ok === true && r.json?.session, `status=${r.status}`);
}

// ---------- 4 · vector válido: causa→efecto persiste ----------
let vecId = "";
{
  const r = await call("POST", "/api/pilar3/events", {
    matchId: MATCH_ID,
    events: [
      {
        type: "ACTION",
        value: "SHOT_AGAINST",
        coordinatesX: 21.5,
        coordinatesY: 33,
        coordinatesX2: 74.5,
        coordinatesY2: 61.25,
      },
    ],
  });
  const ev = r.json?.created?.[0];
  vecId = ev?.id ?? "";
  check("vector SHOT_AGAINST → 200", r.status === 200 && r.json?.ok === true, `status=${r.status}`);
  check("origen (causa) persistido", ev?.coordinatesX === 21.5 && ev?.coordinatesY === 33, JSON.stringify(ev));
  check("fin (efecto) persistido", ev?.coordinatesX2 === 74.5 && ev?.coordinatesY2 === 61.25, JSON.stringify(ev));
  check("minuto sellado por el reloj", typeof ev?.minute === "number" && ev.minute >= 0, `minute=${ev?.minute}`);
}

// ---------- 5 · validación: vector incompleto se rechaza ----------
{
  const r = await call("POST", "/api/pilar3/events", {
    matchId: MATCH_ID,
    events: [{ type: "ACTION", value: "COUNTER_ATTACK", coordinatesX2: 50 }],
  });
  check("vector sin par X2/Y2 → 400", r.status === 400, `status=${r.status}`);
}

// ---------- 6 · validación: fuera de rango se rechaza ----------
{
  const r = await call("POST", "/api/pilar3/events", {
    matchId: MATCH_ID,
    events: [{ type: "ACTION", value: "RECOVERED_BALL", coordinatesX: 10, coordinatesY: 10, coordinatesX2: 150, coordinatesY2: 20 }],
  });
  check("coordinatesX2=150 fuera de rango → 400", r.status === 400, `status=${r.status}`);
}

// ---------- 7 · lote con las 3 consecuencias ----------
{
  const r = await call("POST", "/api/pilar3/events", {
    matchId: MATCH_ID,
    events: [
      { type: "ACTION", value: "COUNTER_ATTACK", coordinatesX: 60, coordinatesY: 40, coordinatesX2: 85, coordinatesY2: 30 },
      { type: "ACTION", value: "RECOVERED_BALL", coordinatesX: 35, coordinatesY: 55, coordinatesX2: 42, coordinatesY2: 48 },
      { type: "ACTION", value: "GOAL_FOR" }, // preset clásico sigue funcionando
    ],
  });
  check("lote de 3 eventos → 200", r.status === 200 && r.json?.created?.length === 3, `status=${r.status} len=${r.json?.created?.length}`);
}

// ---------- 8 · GET telemetría: round-trip completo ----------
{
  const r = await call("GET", `/api/pilar3/matches/${MATCH_ID}/telemetry`);
  const evs = r.json?.events ?? [];
  const vecs = evs.filter((e) => e.coordinatesX2 != null && e.coordinatesY2 != null);
  check("GET /api/pilar3/matches/:id/telemetry → 200", r.status === 200, `status=${r.status}`);
  check("≥3 vectores visibles en la línea temporal", vecs.length >= 3, `vecs=${vecs.length}`);
  const shot = vecs.find((e) => e.value === "SHOT_AGAINST");
  check("round-trip del vector SHOT_AGAINST", shot?.coordinatesX2 === 74.5 && shot?.coordinatesY2 === 61.25, JSON.stringify(shot));
}

// ---------- 9 · auto-clip: bookmark con segundo explícito (instante de la causa) ----------
if (vecId) {
  const r = await call("POST", "/api/pilar3/video-bookmarks", {
    telemetryEventId: vecId,
    videoTimestampSeconds: 137.5,
    notes: "auto-clip del gesto espacial",
  });
  check("bookmark con segundo explícito → ok", r.status === 200 && r.json?.ok === true, `status=${r.status} ${JSON.stringify(r.json)}`);
  const r2 = await call("GET", `/api/pilar3/matches/${MATCH_ID}/telemetry`);
  const marks = r2.json?.bookmarks ?? [];
  check("bookmark enlazado al evento", marks.some((b) => b.telemetryEventId === vecId), `bookmarks=${marks.length}`);
}

// ---------- 10 · tenant guard: partido ajeno no existe ----------
{
  const r = await call("POST", "/api/pilar3/events", {
    matchId: "no-existe-xyz",
    events: [{ type: "ACTION", value: "GOAL_FOR" }],
  });
  check("matchId de otro club → 404", r.status === 404, `status=${r.status}`);
}

console.log(`\nRESULTADO: ${pass} ✓ / ${fail} ✗`);
process.exit(fail === 0 ? 0 : 1);
