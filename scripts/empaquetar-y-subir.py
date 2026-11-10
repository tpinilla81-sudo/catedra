#!/usr/bin/env python3
"""Empaqueta cb2b99c..main, sube a dpaste (base64) y verifica round-trip.
Imprime URL + SHA256 listos para el dispatch de Autopilot."""
import base64
import hashlib
import subprocess
import time
import urllib.request

ROOT = "/home/z/my-project"
BASE = "cb2b99c"
DPASTE = "https://dpaste.org/api/"


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


subprocess.run(
    ["git", "-C", ROOT, "bundle", "create", "/tmp/paquete.bundle", f"{BASE}..main"],
    check=True, capture_output=True,
)
bundle = open("/tmp/paquete.bundle", "rb").read()
bh = sha(bundle)
heads = subprocess.run(
    ["git", "-C", ROOT, "bundle", "list-heads", "/tmp/paquete.bundle"],
    capture_output=True, text=True,
).stdout.strip()
print(f"bundle: {len(bundle)} B  sha256={bh}")
print(f"heads:  {heads}")

b64 = base64.encodebytes(bundle)
print(f"texto base64: {len(b64)} B")

open("/tmp/paquete.b64.txt", "wb").write(b64)
p = subprocess.run(
    ["curl", "-fsS", "--max-time", "90", "-F", "content=</tmp/paquete.b64.txt",
     "-F", "expiry=never", DPASTE],
    capture_output=True, timeout=100,
)
if p.returncode != 0:
    raise SystemExit(f"upload fallo: {p.stderr.decode()[:200]}")
url = p.stdout.decode().strip().strip('"').strip()
print(f"subido: {url}")

time.sleep(2)
req = urllib.request.Request(url.rstrip("/") + "/raw", headers={"User-Agent": "curl/8"})
back = urllib.request.urlopen(req, timeout=60).read()
if sha(back) != sha(b64):
    raise SystemExit("round-trip del TEXTO mismatch")
recomp = base64.b64decode(re.sub(rb"\s+", b"", back) if False else back, validate=False)
# dpaste puede alterar saltos: decodificamos limpiando whitespace
import re
recomp = base64.b64decode(re.sub(rb"\s+", b"", back))
if sha(recomp) != bh:
    raise SystemExit("round-trip del BUNDLE mismatch")
print("round-trip COMPLETO verificado (texto y bundle byte a byte)")

print("\n===== DATOS PARA EL USUARIO =====")
print(f"URL={url}/raw")
print(f"SHA256={bh}")
