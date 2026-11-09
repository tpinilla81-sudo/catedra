#!/usr/bin/env python3
"""
Verificación final del paquete Pilar 2/3:
  1. sha256 de cada archivo local vs manifest (download/pilar23-manifest.txt)
  2. URLs de dpaste accesibles (round-trip real que hará el aplicador)
  3. hash del contenido remoto vs hash del manifest
"""
import hashlib
import sys
import urllib.request

ROOT = "/home/z/my-project"
MANIFEST = f"{ROOT}/download/pilar23-manifest.txt"


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8"})
    return urllib.request.urlopen(req, timeout=30).read()


def main() -> int:
    rows = []
    for line in open(MANIFEST, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        path, url, h = line.split(None, 2)
        rows.append((path.strip(), url.strip(), h.strip()))

    fails = []
    print(f"=== INTEGRIDAD LOCAL ({len(rows)} archivos) ===")
    for path, url, h in rows:
        try:
            local = sha(open(f"{ROOT}/{path}", "rb").read())
            ok = local == h
            print(f"  {'OK ' if ok else '✗✗'} {path}")
            if not ok:
                fails.append((path, "hash local != manifest", local, h))
        except FileNotFoundError as e:
            print(f"  ✗✗ {path} — NO EXISTE")
            fails.append((path, "archivo no existe", "-", h))

    print(f"\n=== DPASTE ACCESIBLE ({len(rows)} URLs) ===")
    for path, url, h in rows:
        try:
            remote = sha(fetch(url))
            ok = remote == h
            print(f"  {'OK ' if ok else '✗✗'} {url}  ({path})")
            if not ok:
                fails.append((path, "hash remoto != manifest", remote, h))
        except Exception as e:
            print(f"  ✗✗ {url} — {type(e).__name__}: {e}")
            fails.append((path, f"URL inaccesible: {e}", "-", h))

    print(f"\n{'=' * 46}")
    if fails:
        print(f"💥 {len(fails)} FALLOS:")
        for f in fails:
            print(f"  {f}")
        return 1
    print("✅ TODO VERDE: 17/17 locales + remotos coinciden con el manifest.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
