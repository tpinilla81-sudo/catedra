#!/usr/bin/env python3
"""Empaqueta la entrega sobre el tip REAL de GitHub main sin depender del
estado mutable de refs locales: recibe el SHA del commit de entrega (TIP),
verifica que desciende de origin/main (ff-only garantizado), mueve
refs/heads/main al TIP de forma atómica (el bundle debe llevar
refs/heads/main para el fetch de la Action Autopilot) y sube
bundle -> base64 -> dpaste con round-trip byte a byte.

Uso: python3 scripts/empaquetar-tip.py <sha-del-tip>
"""
import base64
import hashlib
import re
import subprocess
import sys
import time
import urllib.request

ROOT = "/home/z/my-project"


def run(args, check=True):
    r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise SystemExit(f"FALLO: {' '.join(args)}\n{r.stderr}")
    return (r.stdout or "") + (r.stderr or "")


def sha(b):
    return hashlib.sha256(b).hexdigest()


if len(sys.argv) < 2:
    raise SystemExit("uso: empaquetar-tip.py <sha-del-tip>")
TIP = sys.argv[1].strip()

# 0) tip real de GitHub
run(["git", "fetch", "origin", "main"])
FF = run(["git", "rev-parse", "origin/main"]).strip()
print(f"BASE (origin/main) = {FF}")
print(f"TIP (entrega)      = {TIP}")

# 1) el TIP debe descender del main de GitHub (merge --ff-only en la Action)
run(["git", "merge-base", "--is-ancestor", FF, TIP])
print("FF-OK: el tip desciende del main de GitHub")

# 2) el diff BASE..TIP no debe arrastrar ruido
stat = run(["git", "diff", FF, TIP, "--stat"])
print("--- diff BASE..TIP ---")
print(stat)
if "skills/" in stat:
    raise SystemExit("el diff arrastra skills/")

# 3) refs/heads/main -> TIP (atómico) y bundle
run(["git", "update-ref", "refs/heads/main", TIP])
run(["git", "bundle", "create", "/tmp/paquete.bundle", f"{FF}..main"])
heads = run(["git", "bundle", "list-heads", "/tmp/paquete.bundle"]).strip()
print(f"bundle heads: {heads}")
if "refs/heads/main" not in heads:
    raise SystemExit("el bundle no lleva refs/heads/main")

# 4) base64 + dpaste + round-trip byte a byte
bundle = open("/tmp/paquete.bundle", "rb").read()
bh = sha(bundle)
b64 = base64.encodebytes(bundle)
open("/tmp/paquete.b64.txt", "wb").write(b64)
print(f"bundle: {len(bundle)} B  sha256={bh}")

up = subprocess.run(["curl", "-fsS", "--max-time", "90", "-F", "content=</tmp/paquete.b64.txt",
                     "-F", "expiry=never", "https://dpaste.org/api/"],
                    capture_output=True, timeout=100)
if up.returncode != 0:
    raise SystemExit(f"upload fallo: {up.stderr.decode()[:200]}")
url = up.stdout.decode().strip().strip('"').strip()
print(f"subido: {url}")

time.sleep(2)
back = urllib.request.urlopen(urllib.request.Request(
    url.rstrip("/") + "/raw", headers={"User-Agent": "curl/8"}), timeout=60).read()
recomp = base64.b64decode(re.sub(rb"\s+", b"", back))
if sha(recomp) != bh:
    raise SystemExit("round-trip del BUNDLE mismatch")
print("round-trip COMPLETO verificado (texto y bundle byte a byte)")

print("\n===== DATOS PARA EL USUARIO =====")
print(f"URL={url}/raw")
print(f"SHA256={bh}")
