#!/usr/bin/env python3
"""Renombrado mecánico de campos del Player (Pilar 2/3 schema update):
   mainPosition -> primaryPosition, currentRpe -> fatigueRPE,
   injuryHistory -> medicalNotes, academicConstraints -> academicStress,
   strength -> tacticalStrength (word boundary).
Aplica a src/**, scripts/** y prisma/seed.ts. Imprime diffs resumidos."""
import re
from pathlib import Path

ROOT = Path("/home/z/my-project")
TARGETS: list[Path] = []
for base in [ROOT / "src", ROOT / "scripts"]:
    TARGETS.extend(p for p in base.rglob("*") if p.suffix in {".ts", ".tsx"})
TARGETS.append(ROOT / "prisma" / "seed.ts")

REPLACEMENTS = [
    (re.compile(r"\bmainPosition\b"), "primaryPosition"),
    (re.compile(r"\bcurrentRpe\b"), "fatigueRPE"),
    (re.compile(r"\binjuryHistory\b"), "medicalNotes"),
    (re.compile(r"\bacademicConstraints\b"), "academicStress"),
    (re.compile(r"\bstrength\b"), "tacticalStrength"),
    # ids html y variantes con guion/underscore que referencian el campo
    (re.compile(r"\bmain-position\b"), "primary-position"),
    (re.compile(r"\bed-strength\b"), "ed-tacticalStrength"),
]

changed = 0
for path in sorted(TARGETS):
    text = path.read_text(encoding="utf-8")
    new = text
    for rx, repl in REPLACEMENTS:
        new = rx.sub(repl, new)
    if new != text:
        n = sum(1 for a, b in zip(text.splitlines(), new.splitlines()) if a != b)
        print(f"{path.relative_to(ROOT)}: ~{n} líneas")
        path.write_text(new, encoding="utf-8")
        changed += 1
print(f"\n{changed} archivos modificados")
