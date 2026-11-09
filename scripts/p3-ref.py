#!/usr/bin/env python3
"""
Extrae refs del snapshot accesible de agent-browser por NOMBRE (no índice).
Uso:  python3 scripts/p3-ref.py <snapshot.txt> <patrón1> [patrón2 ...]
Imprime en una línea las refs (una por patrón, "X" si no hay match).
"""
import re
import sys


def ref_of(txt: str, pat: str) -> str:
    # button "Cargado / Al límite — Vigila sus minutos" [ref=e50]
    m = re.search(r'"[^"]*' + re.escape(pat) + r'[^"]*"\s*\[[^\]]*ref=(e\d+)\]', txt)
    return m.group(1) if m else "X"


def main() -> None:
    snap, patterns = sys.argv[1], sys.argv[2:]
    txt = open(snap, encoding="utf-8", errors="replace").read()
    print(" ".join(ref_of(txt, p) for p in patterns))


if __name__ == "__main__":
    main()
