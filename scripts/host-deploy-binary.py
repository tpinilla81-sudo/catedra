#!/usr/bin/env python3
"""
Sube el bundle binario de despliegue a un host que sirve BYTES CRUDOS
(necesario: autopilot.yml hace curl + sha256sum -c sobre lo descargado).

Orden de hosts: 0x0.st -> catbox.moe -> litterbox -> tmpfiles.org
Verifica round-trip byte a byte (sha256) y que el bundle es válido.
"""
import hashlib
import subprocess
import sys
import time
import urllib.request

BUNDLE = "/tmp/thin-deploy.bundle"
ROOT = "/home/z/my-project"
BASE = "649ec09"


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def regenerar() -> bytes:
    subprocess.run(
        ["git", "-C", ROOT, "bundle", "create", BUNDLE, f"{BASE}..main"],
        check=True, capture_output=True,
    )
    return open(BUNDLE, "rb").read()


def post_file(url: str, data: bytes, campo: str, extra: list[str]) -> str:
    tmp = "/tmp/paquete.bin"
    with open(tmp, "wb") as f:
        f.write(data)
    cmd = ["curl", "-fsS", "--max-time", "120", "-A", "catedra-deploy/1.0",
           "-F", f"{campo}=@{tmp}"] + extra + [url]
    p = subprocess.run(cmd, capture_output=True, timeout=130)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode()[:200])
    return p.stdout.decode().strip()


def hosts(data: bytes):
    yield ("0x0.st", "https://0x0.st", "file", [], 1)
    yield ("catbox.moe", "https://catbox.moe/user/api.php", "fileToUpload",
           ["-F", "reqtype=fileupload"], 1)
    yield ("litterbox", "https://litterbox.catbox.moe/resources/internals/api.php",
           "fileToUpload", ["-F", "reqtype=fileupload", "-F", "time=72h"], 1)
    yield ("tmpfiles.org", "https://tmpfiles.org/api/v1/upload", "file", [], 1)


def url_directa(nombre: str, respuesta: str) -> str:
    r = respuesta.strip()
    if nombre == "0x0.st":
        return r if r.startswith("http") else ""
    if nombre == "catbox.moe" or nombre == "litterbox":
        return r if r.startswith("http") else ""
    if nombre == "tmpfiles.org":
        # {"status":"success","data":{"url":"https://tmpfiles.org/123/x.bin"}}
        import json
        try:
            u = json.loads(r)["data"]["url"]
            return u.replace("tmpfiles.org/", "tmpfiles.org/dl/")
        except Exception:
            return ""
    return ""


def main() -> None:
    bundle = regenerar()
    bh = sha(bundle)
    tip = subprocess.run(
        ["git", "-C", ROOT, "rev-parse", "--short", "main"],
        capture_output=True, text=True,
    ).stdout.strip()
    heads = subprocess.run(
        ["git", "-C", ROOT, "bundle", "list-heads", BUNDLE],
        capture_output=True, text=True,
    ).stdout.strip()
    print(f"bundle: {len(bundle)} B  sha256={bh}")
    print(f"heads:  {heads}")
    if tip not in heads:
        print(f"💥 el tip del bundle NO es {tip} — abortando")
        sys.exit(1)

    for nombre, url, campo, extra, _ in hosts(bundle):
        try:
            resp = post_file(url, bundle, campo, extra)
            u = url_directa(nombre, resp)
            if not u:
                print(f"[{nombre}] respuesta no reconocida: {resp[:120]}")
                continue
            time.sleep(2)
            req = urllib.request.Request(u, headers={"User-Agent": "curl/8"})
            back = urllib.request.urlopen(req, timeout=60).read()
            if sha(back) == bh:
                print(f"[{nombre}] OK round-trip byte a byte: {u}")
                print(f"\nURL_BINARIA={u}")
                print(f"SHA256={bh}")
                return
            print(f"[{nombre}] round-trip MISMATCH (recibidos {len(back)} B)")
        except Exception as e:
            print(f"[{nombre}] fallo: {e}")
    print("\n💥 ningún host sirvió bytes crudos")
    sys.exit(1)


if __name__ == "__main__":
    main()
