#!/usr/bin/env python3
"""Verifica el paste de dpaste: baja /raw, quita whitespace, decodifica y
compara sha256 con el bundle original."""
import base64
import hashlib
import re
import sys
import urllib.request

URL = sys.argv[1] if len(sys.argv) > 1 else "https://dpaste.org/OxYB4/raw"
ESPERADO = "54a32c967baa6782e33366f30889d95499872d6f84ecda8d64022109a1c4ad75"

req = urllib.request.Request(URL, headers={"User-Agent": "curl/8"})
raw = urllib.request.urlopen(req, timeout=60).read()
print(f"descargados {len(raw)} bytes de {URL}")

texto = re.sub(rb"\s+", b"", raw)
bundle = base64.b64decode(texto, validate=True)
h = hashlib.sha256(bundle).hexdigest()
print(f"bundle recomputado: {len(bundle)} B  sha256={h}")
if h == ESPERADO:
    print("✅ ROUND-TRIP COMPLETO OK — byte a byte idéntico")
else:
    print("❌ MISMATCH")
    sys.exit(1)
