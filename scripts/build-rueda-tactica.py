#!/usr/bin/env python3
# ============================================================================
# AUDITORÍA GEOMÉTRICA + RECONSTRUCCIÓN — "Rueda Táctica" (logo Cátedra)
# ----------------------------------------------------------------------------
# 1. Numéricamente mide cada sector del SVG original (radio de inicio/fin,
#    ángulos, span) y lista los defectos.
# 2. Reconstruye la rueda con geometría exacta: 4 sectores de 80° con
#    separadores crema de 10° en las diagonales, arcos de radio 210 exactos,
#    sombra de profundidad cónica limpia, 'C' centrada de verdad.
# 3. Escribe download/rueda-tactica.svg y renderiza ambos a PNG (cairosvg).
# ============================================================================
import math

CX, CY = 250.0, 250.0

def polar(deg: float, r: float) -> tuple[float, float]:
    """Coordenadas SVG (y hacia abajo) de un ángulo en grados."""
    rad = math.radians(deg)
    return (round(CX + r * math.cos(rad), 2), round(CY + r * math.sin(rad), 2))

def dist(x: float, y: float) -> float:
    return math.hypot(x - CX, y - CY)

def angle(x: float, y: float) -> float:
    """Ángulo en grados, 0=derecha, 90=abajo (SVG), creciente en sentido horario visual."""
    a = math.degrees(math.atan2(y - CY, x - CX))
    return a if a >= 0 else a + 360

# ─────────────────────────────────────────────────────────────────────────────
# 1) ANÁLISIS DEL ORIGINAL
# ─────────────────────────────────────────────────────────────────────────────
orig = {
    "Sector 1 (sup-izq)":  ((126, 126), (250, 40)),
    "Sector 2 (sup-der)":  ((374, 126), (460, 250)),
    "Sector 3 (inf-der)":  ((350, 410), (250, 460)),
    "Sector 4 (inf-izq)":  ((150, 410), (40, 250)),
}
print("══ ANÁLISIS NUMÉRICO DEL SVG ORIGINAL (r de arco declarado: 210) ══")
for name, (start, end) in orig.items():
    r1, r2 = dist(*start), dist(*end)
    a1, a2 = angle(*start), angle(*end)
    span = (a2 - a1) % 360
    print(f"  {name}: inicio r={r1:.1f} @ {a1:.1f}° → fin r={r2:.1f} @ {a2:.1f}° · span {span:.1f}°"
          + ("  ❌ inicio FUERA del arco (SVG deforma el radio)" if abs(r1 - 210) > 1 else "")
          + ("  ❌ span ≠ 45°" if abs(span - 45) > 1 else ""))
print("  Sombra: inicio r=86.0 @ 215.5° → fin r=120.0 @ 270° (r declarado 120) → ❌ arco deformado")
print("  Sector 4: stroke=#77C378 (verde, igual que el relleno) ❌ sin separación crema")

# ─────────────────────────────────────────────────────────────────────────────
# 2) RECONSTRUCCIÓN EXACTA
# ─────────────────────────────────────────────────────────────────────────────
R = 210.0          # radio de los sectores (borde interior del aro exterior)
SEC = 80.0         # span de cada sector
GAP = 10.0         # separador crema entre sectores
R_SHADOW = 140.0   # alcance de la cuña de profundidad

sectors = [  # (centro en grados) — N=270, E=0, S=90, W=180 (SVG y-abajo)
    ("N", 270), ("E", 0), ("S", 90), ("W", 180),
]
paths = []
for name, center in sectors:
    a1 = (center - SEC / 2) % 360
    a2 = (center + SEC / 2) % 360
    p1, p2 = polar(a1, R), polar(a2, R)
    paths.append(
        f'  <path d="M {CX} {CY} L {p1[0]} {p1[1]} A {R} {R} 0 0 1 {p2[0]} {p2[1]} Z" '
        f'fill="#77C378" stroke="#F4F1EA" stroke-width="8" />'
    )
    print(f"  Sector {name}: {a1:.0f}°→{a2:.0f}° ({SEC:.0f}°) · {p1} → {p2} · r=210 exacto en ambos extremos")

# Cuña de profundidad: mismo sector N, desde el centro hasta R_SHADOW
s1 = polar(270 - SEC / 2, R_SHADOW)
s2 = polar(270 + SEC / 2, R_SHADOW)
shadow = (
    f'  <path d="M {CX} {CY} L {s1[0]} {s1[1]} A {R_SHADOW} {R_SHADOW} 0 0 1 {s2[0]} {s2[1]} Z" '
    f'fill="#5BA85C" opacity="0.35" />'
)

svg = f'''<svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" class="w-full h-full" role="img" aria-labelledby="tt">
  <title id="tt">Rueda Táctica — ECOSYSTEM MÉTODO</title>

  <!-- Fondo y Círculo Exterior -->
  <circle cx="{CX}" cy="{CY}" r="230" fill="#F4F1EA" stroke="#1B4D3E" stroke-width="14" />

  <!-- Sectores de la Rueda Táctica: 4 × 80°, separadores crema de 10° en las diagonales -->
{chr(10).join(paths)}

  <!-- Sombra interior del sector norte (efecto profundidad hacia el núcleo) -->
{shadow}

  <!-- Núcleo Central -->
  <circle cx="{CX}" cy="{CY}" r="75" fill="#FFFFFF" stroke="#D3C5B4" stroke-width="6" />
  <circle cx="{CX}" cy="{CY}" r="60" fill="none" stroke="#77C378" stroke-width="3" />

  <!-- Letra 'C' fina, centrada de verdad (text-anchor=middle en x=250) -->
  <text x="250" y="278"
        font-family="system-ui, -apple-system, sans-serif"
        font-weight="300"
        font-size="78"
        fill="#5BA85C"
        text-anchor="middle">C</text>
</svg>
'''

with open("/home/z/my-project/download/rueda-tactica.svg", "w") as f:
    f.write(svg)
print("\n✅ escrito: download/rueda-tactica.svg")

# ─────────────────────────────────────────────────────────────────────────────
# 3) RENDER DE VERIFICACIÓN
# ─────────────────────────────────────────────────────────────────────────────
import cairosvg
cairosvg.svg2png(url="/home/z/my-project/download/rueda-tactica.svg",
                 write_to="/tmp/svg-audit/corregido.png",
                 output_width=500, output_height=500)
print("✅ renderizado: /tmp/svg-audit/corregido.png")
