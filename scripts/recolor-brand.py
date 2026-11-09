#!/usr/bin/env python3
# ============================================================================
# RECOLOR CATEDRA by Método — dark zinc → crema/verde marca
# Mapeo ordenado: primero variantes con opacidad y prefijos (más largas),
# después tokens simples. Aplica a todos los .tsx de src/.
# ============================================================================
import pathlib
import re

# (orden fijo) token → reemplazo
MAPPING = [
    # ---------- CTA ámbar especial (texto verde corteza sobre ámbar) ----------
    ("bg-amber-400 hover:bg-amber-300 text-zinc-950",
     "bg-[#e3a93c] hover:bg-[#d69a2d] text-peel"),

    # ---------- zinc backgrounds (opacas primero) ----------
    ("bg-zinc-950/95", "bg-white/95"),
    ("bg-zinc-950/90", "bg-white/90"),
    ("bg-zinc-950/80", "bg-white/85"),
    ("bg-zinc-950/60", "bg-cream-dark/70"),
    ("bg-zinc-950", "bg-cream"),
    ("bg-zinc-900/80", "bg-white/90"),
    ("bg-zinc-900/60", "bg-white/80"),
    ("bg-zinc-900/40", "bg-white/65"),
    ("bg-zinc-900", "bg-white"),
    ("hover:bg-zinc-800/70", "hover:bg-cream-dark/75"),
    ("bg-zinc-800/80", "bg-cream-dark/85"),
    ("bg-zinc-800/70", "bg-cream-dark/75"),
    ("bg-zinc-800/60", "bg-cream-dark/70"),
    ("bg-zinc-800/50", "bg-cream-dark/60"),
    ("bg-zinc-800/30", "bg-cream-dark/40"),
    ("hover:bg-zinc-800", "hover:bg-cream-dark"),
    ("bg-zinc-800", "bg-cream-dark"),
    ("hover:bg-zinc-700", "hover:bg-cream-border-strong"),
    ("bg-zinc-700", "bg-cream-border-strong"),
    ("bg-zinc-600", "bg-[#b9b49c]"),

    # ---------- zinc borders ----------
    ("border-zinc-800/70", "border-cream-border/80"),
    ("border-zinc-800/60", "border-cream-border/70"),
    ("border-zinc-800", "border-cream-border"),
    ("border-zinc-700", "border-cream-border-strong"),
    ("border-zinc-600", "border-[#b9b49c]"),
    ("border-zinc-500", "border-[#a8a389]"),
    ("hover:border-zinc-600", "hover:border-[#b9b49c]"),
    ("hover:border-zinc-500", "hover:border-[#a8a389]"),
    ("divide-zinc-800", "divide-cream-border"),

    # ---------- zinc text ----------
    ("hover:text-zinc-200", "hover:text-[#2a4630]"),
    ("hover:text-zinc-300", "hover:text-[#3d5844]"),
    ("hover:text-zinc-100", "hover:text-peel"),
    ("text-zinc-200", "text-[#2a4630]"),
    ("text-zinc-300", "text-[#3d5844]"),
    ("text-zinc-400", "text-[#5d7263]"),
    ("text-zinc-500", "text-[#6c8070]"),
    ("text-zinc-600", "text-[#8a9a8d]"),
    ("text-zinc-700", "text-[#7c8f7e]"),
    ("text-zinc-100", "text-peel"),
    ("text-zinc-50", "text-peel"),
    ("text-zinc-950", "text-white"),

    # ---------- emerald → verde marca ----------
    ("text-emerald-300/80", "text-brand-600/90"),
    ("text-emerald-400/80", "text-brand-600/90"),
    ("text-emerald-400/70", "text-brand-600/90"),
    ("text-emerald-300", "text-brand-600"),
    ("text-emerald-400", "text-brand-600"),
    ("text-emerald-200/80", "text-brand/90"),
    ("text-emerald-200/70", "text-brand/90"),
    ("text-emerald-200", "text-brand"),
    ("hover:text-emerald-200", "hover:text-brand"),
    ("bg-emerald-500/90", "bg-brand-600/95"),
    ("hover:bg-emerald-400", "hover:bg-brand"),
    ("bg-emerald-500", "bg-brand-600"),
    ("bg-emerald-400/70", "bg-brand-400/70"),
    ("bg-emerald-400", "bg-brand-400"),
    ("border-emerald-400/60", "border-brand-600/60"),
    ("border-emerald-400", "border-brand-600"),
    ("shadow-emerald-500/20", "shadow-brand-600/25"),
    ("focus-visible:outline-emerald-400", "focus-visible:outline-brand-600"),
    # tints emerald-500/5../30 y borders /20../50 se conservan (veladuras claras)

    # ---------- amber → dorado legible sobre crema ----------
    ("text-amber-300/80", "text-[#8a6206]/90"),
    ("text-amber-200/90", "text-[#7c5606]"),
    ("text-amber-300", "text-[#8a6206]"),
    ("text-amber-400", "text-[#8a6206]"),
    ("hover:bg-amber-300", "hover:bg-[#d69a2d]"),
    ("bg-amber-400/15", "bg-[#e3a93c]/15"),
    ("bg-amber-400", "bg-[#e3a93c]"),
    ("bg-amber-300", "bg-[#d69a2d]"),
    ("shadow-amber-400/20", "shadow-[#e3a93c]/30"),

    # ---------- rose → rojo legible sobre crema ----------
    ("text-rose-200/90", "text-[#8f1d22]"),
    ("text-rose-200", "text-[#8f1d22]"),
    ("text-rose-300", "text-[#b4232a]"),
    ("text-rose-400", "text-[#b4232a]"),
    ("text-red-300", "text-[#b4232a]"),
    ("hover:text-red-50", "hover:text-white"),
    ("hover:text-rose-300", "hover:text-[#b4232a]"),
    ("hover:bg-rose-400", "hover:bg-[#a81f24]"),
    ("bg-rose-400", "bg-[#e05252]"),
    ("bg-rose-500", "bg-[#c62f32]"),

    # ---------- violet (Cátedra) ----------
    ("text-violet-300", "text-[#6d28d9]"),
    ("bg-violet-500/90", "bg-[#7c3aed]"),
    ("hover:bg-violet-400", "hover:bg-[#6d28d9]"),

    # ---------- sky ----------
    ("text-sky-300", "text-[#0369a1]"),
]

# Aplicar en orden: variantes con prefijo (hover:, focus-visible:, shadow-…)
# ya están en la tabla antes que sus tokens base donde importa.
SKIP_FILES = {"app-nav.tsx"}  # se elimina; no importa

changed_files = 0
total_replacements = 0
for path in sorted(pathlib.Path("/home/z/my-project/src").rglob("*.tsx")):
    if path.name in SKIP_FILES:
        continue
    src = path.read_text()
    out = src
    n = 0
    for old, new in MAPPING:
        if old in out:
            n += out.count(old)
            out = out.replace(old, new)
    if out != src:
        path.write_text(out)
        changed_files += 1
        total_replacements += n
        print(f"{n:4d}  {path.relative_to('/home/z/my-project')}")

print(f"\nfiles changed: {changed_files}, replacements: {total_replacements}")

# ---------- Comprobación de restos ----------
leftovers = []
for path in sorted(pathlib.Path("/home/z/my-project/src").rglob("*.tsx")):
    for i, line in enumerate(path.read_text().splitlines(), 1):
        for m in re.finditer(r"(?:bg|text|border|divide)-zinc-\d+", line):
            leftovers.append(f"{path.relative_to('/home/z/my-project')}:{i}: {m.group()}")
print("\nleftover zinc:", len(leftovers))
for l in leftovers[:12]:
    print(" ", l)
