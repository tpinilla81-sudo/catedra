#!/usr/bin/env python3
"""
Sube el paquete fino de despliegue (bundle git) a dpaste.org como TEXTO
(base64), con expiry=never, y verifica el round-trip byte a byte.

Estrategia:
  1) regenera el bundle fino 890592a..main desde el repo sandbox
  2) base64 -w76 -> texto
  3) intenta subir el texto entero; si dpaste lo rechaza, parte en 2/4 trozos
  4) verifica round-trip de CADA trozo y del bundle recompuesto
  5) imprime: URLs raw + sha256 del bundle + bloque listo para Codespaces
"""
import base64
import hashlib
import subprocess
import sys
import time
import urllib.request

ROOT = "/home/z/my-project"
DPASTE = "https://dpaste.org/api/"
BASE = "649ec09"  # commit actual de GitHub main (producción)


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def upload(content: bytes) -> str:
    tmp = "/tmp/up-piece.txt"
    with open(tmp, "wb") as f:
        f.write(content)
    p = subprocess.run(
        ["curl", "-fsS", "--max-time", "90", "-F", f"content=<{tmp}",
         "-F", "expiry=never", DPASTE],
        capture_output=True, timeout=100,
    )
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode()[:300])
    return p.stdout.decode().strip().strip('"').strip()


def fetch_raw(url: str) -> bytes:
    req = urllib.request.Request(url.rstrip("/") + "/raw",
                                 headers={"User-Agent": "curl/8"})
    return urllib.request.urlopen(req, timeout=60).read()


def main() -> None:
    # 1) bundle fino
    subprocess.run(
        ["git", "-C", ROOT, "bundle", "create", "/tmp/thin-deploy.bundle",
         f"{BASE}..main"],
        check=True, capture_output=True,
    )
    bundle = open("/tmp/thin-deploy.bundle", "rb").read()
    bh = sha(bundle)
    print(f"bundle: {len(bundle)} B  sha256={bh}")

    # commit tip (para informar)
    tip = subprocess.run(
        ["git", "-C", ROOT, "log", "--oneline", "-1"],
        capture_output=True, text=True,
    ).stdout.strip()
    print(f"tip incluido: {tip}")

    # 2) base64 multilinea
    b64 = base64.encodebytes(bundle)  # 76 cols, termina en \n
    print(f"texto base64: {len(b64)} B")

    # 3) subir (entero, si no -> trozos)
    pieces: list[tuple[str, bytes]] = []  # (url, contenido_verificado)
    try:
        url = upload(b64)
        time.sleep(1)
        back = fetch_raw(url)
        if sha(back) == sha(b64):
            pieces = [(url, b64)]
            print(f"OK entero: {url}")
        else:
            print("round-trip del entero MISMATCH; parto en trozos")
    except Exception as e:
        print(f"entero falló ({e}); parto en trozos")

    if not pieces:
        n = 2
        while not pieces and n <= 8:
            lines = b64.splitlines(keepends=True)
            size = (len(lines) + n - 1) // n
            chunks = [b"".join(lines[i * size:(i + 1) * size])
                      for i in range(n)]
            pieces = []
            ok = True
            for idx, ch in enumerate(chunks, 1):
                try:
                    u = upload(ch)
                    time.sleep(1)
                    back = fetch_raw(u)
                    if sha(back) != sha(ch):
                        print(f"  trozo {idx}: MISMATCH")
                        ok = False
                        break
                    pieces.append((u, ch))
                    print(f"  trozo {idx}/{n} OK: {u} ({len(ch)} B)")
                except Exception as e:
                    print(f"  trozo {idx}: {e}")
                    ok = False
                    break
            if ok:
                break
            n *= 2
            pieces = []

    if not pieces:
        print("\n💥 no se pudo subir")
        sys.exit(1)

    # 4) round-trip del conjunto
    joined = b"".join(fetch_raw(u) for u, _ in pieces)
    recomposed = base64.b64decode(joined, validate=False)  # el b64 lleva \n de línea
    if sha(recomposed) != bh:
        print("\n💥 el bundle recomputado NO coincide")
        sys.exit(1)
    print("round-trip COMPLETO verificado: el bundle que bajará es byte a byte el mío")

    # 5) salida
    print("\n===== DATOS PARA EL USUARIO =====")
    print("URLS=" + " ".join(u + "/raw" for u, _ in pieces))
    print(f"SHA256={bh}")
    print(f"NPIEZAS={len(pieces)}")


if __name__ == "__main__":
    main()
