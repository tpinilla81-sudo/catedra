#!/usr/bin/env python3
"""
Empaqueta los 17 archivos del Pilar 2/3: los sube a dpaste.org (expiry=never),
verifica el round-trip byte a byte (sha256) y genera:
  - /tmp/p3-manifest.tsv  (ruta → URL raw → sha256)
  - /tmp/aplicar-pilar23.sh (script aplicador para Codespaces)
"""
import hashlib
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request

FILES = [
    # --- nuevos (Pilar 3 core) ---
    "prisma/migrations/20261109180000_pilar3_telemetria_directo/migration.sql",
    "src/lib/pilar3.ts",
    "src/app/api/pilar3/events/route.ts",
    "src/app/api/pilar3/matches/[id]/telemetry/route.ts",
    "src/app/api/pilar3/video-bookmarks/route.ts",
    "src/app/api/matches/[id]/evaluations/route.ts",
    # --- actualizados (schema + seed) ---
    "prisma/schema.prisma",
    "prisma/seed.ts",
    # --- actualizados (tablón en directo) ---
    "src/components/match/live-match-board.tsx",
    "src/components/match/ingest-flow.tsx",
    "src/app/dashboard/match/page.tsx",
    "src/app/dashboard/match/live/page.tsx",
    # --- actualizados (Pilar 2 · plantilla) ---
    "src/app/dashboard/players/page.tsx",
    "src/app/dashboard/players/actions.ts",
    "src/components/players/players-view.tsx",
    "src/components/players/new-player-dialog.tsx",
    "src/components/players/position-picker.tsx",
]

ROOT = "/home/z/my-project"
DPASTE = "https://dpaste.org/api/"


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def upload(content: bytes) -> str:
    # multipart/form-data con curl: `-F content=<file` lee el archivo
    tmp = "/tmp/p3-upload.bin"
    with open(tmp, "wb") as f:
        f.write(content)
    p = subprocess.run(
        ["curl", "-fsS", "-F", f"content=<{tmp}", "-F", "expiry=never", DPASTE],
        capture_output=True,
        timeout=60,
    )
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode()[:200])
    return p.stdout.decode().strip().strip('"').strip()


def fetch_raw(url: str) -> bytes:
    req = urllib.request.Request(url.rstrip("/") + "/raw", headers={"User-Agent": "curl/8"})
    return urllib.request.urlopen(req, timeout=60).read()


def main() -> None:
    rows = []
    fails = []
    for i, path in enumerate(FILES, 1):
        data = open(f"{ROOT}/{path}", "rb").read()
        local = sha(data)
        url = None
        for attempt in (1, 2, 3):
            try:
                url = upload(data)
                if url:
                    break
            except Exception as e:
                print(f"  [{i}/{len(FILES)}] reintento {attempt}: {e}", flush=True)
                time.sleep(3)
        if not url:
            fails.append(path)
            print(f"  [{i}/{len(FILES)}] ✗ SUBIDA FALLÓ {path}")
            continue
        time.sleep(1)
        back = fetch_raw(url)
        remote = sha(back)
        status = "OK" if remote == local else "MISMATCH"
        print(f"  [{i}/{len(FILES)}] {status} {path} → {url}  ({len(data)} B)")
        if status != "OK":
            fails.append(path)
            continue
        rows.append((path, url, local))

    if fails:
        print(f"\n💥 FALLOS: {fails}")
        sys.exit(1)

    # manifest
    with open("/tmp/p3-manifest.tsv", "w") as f:
        for path, url, h in rows:
            f.write(f"{path}\t{url}/raw\t{h}\n")

    # script aplicador para Codespaces
    lines = [
        "#!/usr/bin/env bash",
        "# ============================================================",
        "# CATEDRA · Paquete Pilar 2 + Pilar 3 — aplicador automático",
        "# Descarga cada archivo de dpaste, verifica sha256 y lo coloca",
        "# en su ruta. Después: migración + generate + commit + push.",
        "# Uso:  bash aplicar-pilar23.sh",
        "# ============================================================",
        "set -euo pipefail",
        'cd "${CATEDRA_DIR:-/workspaces/catedra}"',
        "",
        "manifest=$(mktemp)",
        "cat > \"$manifest\" << 'MANIFEST'",
    ]
    for path, url, h in rows:
        lines.append(f"{h}\t{url}/raw\t{path}")
    lines += [
        "MANIFEST",
        "",
        'echo "→ Descargando y verificando $(wc -l < "$manifest") archivos…"',
        'ok=0; total=$(wc -l < "$manifest")',
        "",
        'while IFS=$\'\\t\' read -r hash url path; do',
        '  mkdir -p "$(dirname "$path")"',
        '  tmp=$(mktemp)',
        '  curl -fsSL "$url" -o "$tmp"',
        '  if ! echo "$hash  $tmp" | sha256sum -c --quiet > /dev/null 2>&1; then',
        '    echo "  ✗ HASH NO COINCIDE: $path (aborto, no se toca nada)"',
        '    rm -f "$tmp"',
        '    exit 1',
        '  fi',
        '  mv "$tmp" "$path"',
        '  ok=$((ok+1))',
        '  echo "  ✓ [$ok/$total] $path"',
        'done < "$manifest"',
        "",
        'echo ""',
        'echo "→ $ok/$total archivos verificados (sha256) y colocados."',
        "",
        'echo "→ Prisma generate + migración…"',
        "bunx prisma generate",
        "bunx prisma migrate deploy",
        "",
        'echo ""',
        'echo "▸▸▸ SIGUIENTE (te lo dejo listo, lo lanzas tú):"',
        'echo "  git add -A"',
        'echo "  git commit -m \\"feat(p2-p3): telemetría en directo, perfil pre-partido y sync de vídeo\\""',
        'echo "  git push"',
        'echo ""',
        'echo "Después del push: Vercel despliega solo. La migración YA está aplicada."',
    ]
    with open("/tmp/aplicar-pilar23.sh", "w") as f:
        f.write("\n".join(lines) + "\n")

    print("\n🎯 manifest → /tmp/p3-manifest.tsv")
    print("🎯 aplicador → /tmp/aplicar-pilar23.sh")
    print("\nRESUMEN:")
    for path, url, h in rows:
        print(f"  {url}/raw  {path}")


if __name__ == "__main__":
    main()
