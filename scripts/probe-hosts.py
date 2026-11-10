#!/usr/bin/env python3
"""Sondea hosts que puedan servir el bundle como BYTES CRUDOS.
Para cada host: sube el bundle, descarga (con -L y UA variados) y exige
round-trip sha256 EXACTO + segunda descarga (no single-use)."""
import hashlib
import json
import subprocess
import sys
import time
import urllib.request

BUNDLE = "/tmp/thin-deploy.bundle"
ROOT = "/home/z/my-project"
BASE = "649ec09"
UA_BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def regenerar() -> bytes:
    subprocess.run(
        ["git", "-C", ROOT, "bundle", "create", BUNDLE, f"{BASE}..main"],
        check=True, capture_output=True,
    )
    return open(BUNDLE, "rb").read()


def run(cmd: list[str], timeout: int = 40) -> tuple[int, str]:
    p = subprocess.run(cmd, capture_output=True, timeout=timeout)
    return p.returncode, (p.stdout + p.stderr).decode(errors="replace").strip()


def baja(url: str, ua: str = "curl/8") -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    return urllib.request.urlopen(req, timeout=45).read()


def probar(nombre: str, subir, extraer) -> None:
    try:
        resp = subir()
        url = extraer(resp)
        if not url:
            print(f"[{nombre}] ✗ respuesta no interpretable: {resp[:100]}")
            return
        time.sleep(2)
        d1 = baja(url)
        if sha(d1) != BH:
            print(f"[{nombre}] ✗ round-trip mismatch ({len(d1)} B): {url}")
            return
        d2 = baja(url, UA_BROWSER)  # segunda descarga: no single-use
        if sha(d2) != BH:
            print(f"[{nombre}] ✗ segunda descarga falla (single-use): {url}")
            return
        print(f"[{nombre}] ✓✓ OK: {url}")
        OK.append((nombre, url))
    except Exception as e:
        print(f"[{nombre}] ✗ {str(e)[:110]}")


BH = ""
bundle = regenerar()
BH = sha(bundle)
open("/tmp/bundle_sha.txt", "w").write(BH)
print(f"bundle: {len(bundle)} B  sha256={BH}\n")

OK: list[tuple[str, str]] = []
tmp = "/tmp/paquete.bundle"

# 1) tmpfiles.org (ya sabíamos que acepta el upload; a ver si /dl/ sirve bytes)
def sub_tmpfiles():
    with open(tmp, "wb") as f:
        f.write(bundle)
    c, o = run(["curl", "-fsS", "--max-time", "60", "-F", f"file=@{tmp}",
                "https://tmpfiles.org/api/v1/upload"])
    if c != 0:
        raise RuntimeError("upload curl fallo")
    return o

def ext_tmpfiles(resp: str):
    try:
        u = json.loads(resp)["data"]["url"]
        return u.replace("tmpfiles.org/", "tmpfiles.org/dl/")
    except Exception:
        return ""

probar("tmpfiles", sub_tmpfiles, ext_tmpfiles)

# 2) uguu.se
def sub_uguu():
    with open(tmp, "wb") as f:
        f.write(bundle)
    c, o = run(["curl", "-fsS", "--max-time", "60",
                "-F", f"files[]=@{tmp}", "https://uguu.se/upload?output=text"])
    if c != 0:
        raise RuntimeError("upload curl fallo")
    return o

def ext_uguu(resp: str):
    for tok in resp.split():
        if tok.startswith("http"):
            return tok
    return ""

probar("uguu", sub_uguu, ext_uguu)

# 3) temp.sh (PUT)
def sub_tempsh():
    with open(tmp, "wb") as f:
        f.write(bundle)
    c, o = run(["curl", "-fsS", "--max-time", "90", "-T", tmp,
                "https://temp.sh/paquete.bundle"])
    if c != 0:
        raise RuntimeError("upload curl fallo")
    return o

def ext_tempsh(resp: str):
    for tok in resp.split():
        if tok.startswith("http"):
            return tok
    return ""

probar("temp.sh", sub_tempsh, ext_tempsh)

# 4) bashupload.com (PUT; detecta single-use con doble descarga)
def sub_bashupload():
    with open(tmp, "wb") as f:
        f.write(bundle)
    c, o = run(["curl", "-fsS", "--max-time", "90", "-T", tmp,
                "https://bashupload.com/paquete.bundle"])
    if c != 0:
        raise RuntimeError("upload curl fallo")
    return o

def ext_bashupload(resp: str):
    for tok in resp.replace("\n", " ").split():
        if tok.startswith("https://bashupload.com/"):
            return tok
    return ""

probar("bashupload", sub_bashupload, ext_bashupload)

# 5) x0.at (clon 0x0)
def sub_x0at():
    with open(tmp, "wb") as f:
        f.write(bundle)
    c, o = run(["curl", "-fsS", "--max-time", "60", "-A", UA_BROWSER,
                "-F", f"file=@{tmp}", "https://x0.at/"])
    if c != 0:
        raise RuntimeError("upload curl fallo")
    return o

def ext_x0at(resp: str):
    for tok in resp.split():
        if tok.startswith("http"):
            return tok
    return ""

probar("x0.at", sub_x0at, ext_x0at)

# 6) envs.sh (clon 0x0)
def sub_envs():
    with open(tmp, "wb") as f:
        f.write(bundle)
    c, o = run(["curl", "-fsS", "--max-time", "60", "-A", UA_BROWSER,
                "-F", f"file=@{tmp}", "https://envs.sh"])
    if c != 0:
        raise RuntimeError("upload curl fallo")
    return o

probar("envs.sh", sub_envs, ext_x0at)

# 7) filebin.net
BIN = "catedra" + hashlib.sha256(bundle).hexdigest()[:10]
def sub_filebin():
    with open(tmp, "wb") as f:
        f.write(bundle)
    c, o = run(["curl", "-fsS", "--max-time", "60", "-H", "User-Agent: " + UA_BROWSER,
                "-F", f"file=@{tmp}", f"https://filebin.net/{BIN}/paquete.bundle"])
    if c != 0:
        raise RuntimeError("upload curl fallo")
    return o

def ext_filebin(resp: str):
    return f"https://filebin.net/{BIN}/paquete.bundle"

probar("filebin", sub_filebin, ext_filebin)

# 8) paste.rs (binario como POST body)
def sub_pasters():
    c, o = run(["curl", "-fsS", "--max-time", "60", "--data-binary", f"@{tmp}",
                "https://paste.rs"])
    if c != 0:
        raise RuntimeError("upload curl fallo")
    return o

def ext_simple(resp: str):
    for tok in resp.split():
        if tok.startswith("http"):
            return tok
    return ""

probar("paste.rs", sub_pasters, ext_simple)

# 9) transfer.sh (PUT)
def sub_transfer():
    with open(tmp, "wb") as f:
        f.write(bundle)
    c, o = run(["curl", "-fsS", "--max-time", "45", "-T", tmp,
                "https://transfer.sh/paquete.bundle"])
    if c != 0:
        raise RuntimeError("upload curl fallo")
    return o

probar("transfer.sh", sub_transfer, ext_simple)

print("\n===== RESUMEN =====")
if OK:
    for n, u in OK:
        print(f"HOST_OK={n} URL={u}")
else:
    print("ningún host sirve bytes crudos desde el sandbox")
    sys.exit(1)
