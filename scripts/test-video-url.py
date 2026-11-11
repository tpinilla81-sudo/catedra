#!/usr/bin/env python3
"""Regresión del parser de URLs de vídeo (Pilar 3 — YouTube + directo):
compila src/lib/video-url.ts y ejecuta la batería de enlaces. Uso:
    python3 scripts/test-video-url.py
Sale 0 solo si TODOS los casos encajan (kind + id / url)."""
import shutil
import subprocess
import sys

ROOT = "/home/z/my-project"
OUT = "/tmp/video-url-test"

CASES_JS = r"""
import { parseVideoUrl, youTubeIdFromUrl } from "./video-url.mjs";

const cases = [
  // YouTube en todos sus formatos
  ["https://youtu.be/dQw4w9WgXcQ", "youtube dQw4w9WgXcQ"],
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube dQw4w9WgXcQ"],
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s", "youtube dQw4w9WgXcQ"],
  ["https://www.youtube.com/embed/dQw4w9WgXcQ", "youtube dQw4w9WgXcQ"],
  ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube dQw4w9WgXcQ"],
  ["https://www.youtube.com/live/dQw4w9WgXcQ", "youtube dQw4w9WgXcQ"],
  ["HTTPS://YOUTU.BE/dQw4w9WgXcQ?si=abc", "youtube dQw4w9WgXcQ"],
  // Vídeo directo
  ["https://club.example.com/grabaciones/jornada12.mp4", "direct https://club.example.com/grabaciones/jornada12.mp4"],
  ["http://192.168.1.50/video/webm/partido.webm", "direct http://192.168.1.50/video/webm/partido.webm"],
  // Inválidos
  ["", "null"],
  ["   ", "null"],
  ["ftp://servidor/partido.mp4", "null"],
  ["mira esto sin enlace", "null"],
  ["https://vimeo.com/123456789", "direct https://vimeo.com/123456789"],
];

let pass = 0;
for (const [input, expected] of cases) {
  const r = parseVideoUrl(input);
  let got;
  if (r === null) got = "null";
  else if (r.kind === "youtube") got = `youtube ${r.id}`;
  else got = `direct ${r.url}`;
  const ok = got === expected;
  console.log((ok ? "✓" : "✗") + ` "${input}" → ${got}` + (ok ? "" : `  [esperado: ${expected}]`));
  if (ok) pass += 1;
}

// El embed de YouTube lleva enablejsapi (necesario para leer el segundo exacto)
const yt = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ");
const embedOk = yt?.kind === "youtube" && yt.embedUrl.includes("enablejsapi=1");
console.log((embedOk ? "✓" : "✗") + " embed con enablejsapi=1");
if (embedOk) pass += 1;

// youTubeIdFromUrl devuelve null fuera de YouTube
const noYt = youTubeIdFromUrl("https://example.com/watch?v=abc") === null;
console.log((noYt ? "✓" : "✗") + " id null fuera de YouTube");
if (noYt) pass += 1;

const total = cases.length + 2;
console.log(`${pass}/${total} casos correctos`);
process.exit(pass === total ? 0 : 1);
"""


def main() -> int:
    subprocess.run(
        ["npx", "tsc", "src/lib/video-url.ts", "--outDir", OUT,
         "--module", "es2020", "--target", "es2020", "--skipLibCheck"],
        cwd=ROOT, check=True, capture_output=True,
    )
    shutil.copy(f"{OUT}/video-url.js", f"{OUT}/video-url.mjs")
    with open(f"{OUT}/cases.mjs", "w", encoding="utf-8") as f:
        f.write(CASES_JS)
    p = subprocess.run(["node", f"{OUT}/cases.mjs"], capture_output=True, text=True)
    print(p.stdout, end="")
    if p.returncode != 0:
        print(p.stderr, file=sys.stderr)
    return p.returncode


if __name__ == "__main__":
    sys.exit(main())
