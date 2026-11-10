#!/usr/bin/env python3
"""Regresión del parser de voz (Pilar 3): compila src/lib/voice-events.ts
y ejecuta la batería de frases de vestuario. Uso:
    python3 scripts/test-voice-parser.py
Sale 0 solo si TODOS los casos encajan (status + outcome + coordenadas)."""
import shutil
import subprocess
import sys

ROOT = "/home/z/my-project"
OUT = "/tmp/voice-parser-test"

CASES_JS = r"""
import { parseVoiceEvent } from "./voice-events.mjs";

const cases = [
  ["recuperamos banda derecha", "ok RECOVERED_BALL origin(50,82) end(62,82)"],
  ["recuperamos en medio campo y sacan por banda derecha", "ok RECOVERED_BALL origin(50,50) end(50,82)"],
  ["disparo rival desde la frontal", "ok SHOT_AGAINST origin(78,50) end(68,50)"],
  ["nos chutan desde tres cuartos", "ok SHOT_AGAINST origin(68,50) end(58,50)"],
  ["contra por el carril izquierdo", "ok COUNTER_ATTACK origin(50,18) end(68,18)"],
  ["robo en el campo rival y sigue la jugada", "ok RECOVERED_BALL origin(75,50) end(87,50)"],
  ["recuperamos", "partial RECOVERED_BALL"],
  ["qué bien chicos vamos", "none"],
  ["nos roban el balón en medio campo", "none"],
  ["transición rival por la derecha", "ok COUNTER_ATTACK origin(50,82) end(68,82)"],
  ["remate desde la banda izquierda", "ok SHOT_AGAINST origin(50,18) end(40,18)"],
  ["balón recuperado en el área propia", "ok RECOVERED_BALL origin(8,50) end(20,50)"],
  ["¡contra!", "partial COUNTER_ATTACK"],
  ["tiro", "partial SHOT_AGAINST"],
  ["Córner a favor", "none"],
  ["Robamos en tres cuartos y transición por dentro", "ok RECOVERED_BALL origin(68,50) end(68,50)"],
  ["al contrario que ayer", "none"],
];

let pass = 0;
for (const [phrase, expected] of cases) {
  const r = parseVoiceEvent(phrase);
  let got;
  if (r.status === "ok") got = `ok ${r.outcome} origin(${r.origin.x},${r.origin.y}) end(${r.end.x},${r.end.y})`;
  else if (r.status === "partial") got = `partial ${r.outcome}`;
  else got = "none";
  const ok = got === expected;
  console.log((ok ? "✓" : "✗") + ` "${phrase}" → ${got}` + (ok ? "" : `  [esperado: ${expected}]`));
  if (ok) pass += 1;
}
console.log(`${pass}/${cases.length} casos correctos`);
process.exit(pass === cases.length ? 0 : 1);
"""


def main() -> int:
    subprocess.run(
        ["npx", "tsc", "src/lib/voice-events.ts", "--outDir", OUT,
         "--module", "es2020", "--target", "es2020", "--skipLibCheck"],
        cwd=ROOT, check=True, capture_output=True,
    )
    shutil.copy(f"{OUT}/voice-events.js", f"{OUT}/voice-events.mjs")
    with open(f"{OUT}/cases.mjs", "w", encoding="utf-8") as f:
        f.write(CASES_JS)
    p = subprocess.run(["node", f"{OUT}/cases.mjs"], capture_output=True, text=True)
    print(p.stdout, end="")
    if p.returncode != 0:
        print(p.stderr, file=sys.stderr)
    return p.returncode


if __name__ == "__main__":
    sys.exit(main())
