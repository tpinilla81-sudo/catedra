// Sanity visual del reparto en el campo (Pilar 3 · terreno por demarcaciones)
import { computePitchSlots, type LivePlayerData } from "../src/components/match/live-match-board";

const mk = (n: number, first: string, last: string, pos: string): LivePlayerData => ({
  id: `p${n}`,
  firstName: first,
  lastName: last,
  shirtNumber: n,
  primaryPosition: pos,
  secondaryPositions: [],
  fatigueRPE: null,
  medicalNotes: null,
  academicStress: null,
  tacticalStrength: null,
  status: "AVAILABLE",
  statusNote: null,
});

// 4-3-3 clásico + doble lateral carrilero para probar el packing
const once = [
  mk(1, "Iker", "Portero", "GK"),
  mk(2, "Hugo", "Lateral", "LB"),
  mk(3, "Marc", "Central", "CB"),
  mk(4, "Pau", "Zagа", "CB"), // dos centrales → colisión de baseX resuelta
  mk(5, "Ot", "LateralDer", "RB"),
  mk(6, "Rodri", "Pivote", "DM"),
  mk(7, "Gavi", "Interior", "CM"),
  mk(8, "Pedri", "Mediapunta", "AM"),
  mk(9, "Lamine", "Extremo", "RW"),
  mk(10, "Ansu", "ExtremoIzq", "LW"),
  mk(11, "Ferran", "Nueve", "CF"),
];

const slots = computePitchSlots(once);
let failures = 0;
const seen = new Map<string, string>();
for (const p of once) {
  const s = slots.get(p.id);
  if (!s) { console.log(`❌ ${p.firstName} sin hueco`); failures++; continue; }
  const key = `${s.x},${s.y}`;
  if (seen.has(key)) { console.log(`❌ SOLAPE: ${seen.get(key)} y ${p.firstName} en ${key}`); failures++; }
  seen.set(key, p.firstName);
  console.log(`${p.firstName.padEnd(7)} ${p.primaryPosition.padEnd(3)} → x=${String(s.x).padStart(5)} y=${String(s.y).padStart(4)}`);
}

const gk = slots.get("p1")!;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "✅" : "❌"} ${name}`); if (!cond) failures++; };
check("GK centrado abajo (50, 88)", gk.x === 50 && gk.y === 88);
check("los 2 centrales quedaron separados", slots.get("p3")!.x !== slots.get("p4")!.x);
check("defensa en y=72", [2, 3, 4, 5].every((n) => slots.get(`p${n}`)!.y === 72));
check("pivote por debajo del mediocampo (56 > 41)", slots.get("p6")!.y > slots.get("p7")!.y);
check("ataque arriba (y=19)", [9, 10, 11].every((n) => slots.get(`p${n}`)!.y === 19));
const defXs = [2, 3, 4, 5].map((n) => slots.get(`p${n}`)!.x).sort((a, b) => a - b);
check("línea de 4 ordenada sin gap loco", defXs[3] - defXs[0] <= 86 && defXs[0] < defXs[1] && defXs[1] < defXs[2] && defXs[2] < defXs[3]);
check("11 titulares con hueco", slots.size === 11);
console.log(failures === 0 ? "PITCH SLOTS OK" : `FALLOS: ${failures}`);
process.exit(failures ? 1 : 0);
