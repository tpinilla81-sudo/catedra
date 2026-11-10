#!/usr/bin/env python3
# ============================================================================
# LOGO CATEDRA by Método — gajo de limón con "C" partida (fiel al adjunto)
# • Corteza: anillo verde profundo #17552C
# • Albura (segundo anillo): crema #F1EDDA
# • 6 gajos verde claro #A8D878 separados por radios crema
# • Centro blanco con UNA "C" normal, verde y estrecha (arco elíptico fino)
# Genera: public/logo.svg (1024) y src/app/icon.svg (favicon, mismo dibujo)
# ============================================================================
import math

DEEP = "#17552C"      # corteza / verde marca
DEEP_DARK = "#123A20" # texto sobre crema
LIME = "#A8D878"      # gajos
LIME_LIGHT = "#C2E39B"
CREAM = "#F1EDDA"     # albura / separadores
PAPER = "#FFFFFF"

CX = CY = 512
R = 500               # radio total

def polar(cx, cy, r, deg):
    a = math.radians(deg)
    return (cx + r * math.cos(a), cy + r * math.sin(a))

def wedge(cx, cy, r_in, r_out, a0, a1):
    """Sector anular de a0 a a1 (grados, 0=derecha, sentido horario SVG)."""
    x0o, y0o = polar(cx, cy, r_out, a0)
    x1o, y1o = polar(cx, cy, r_out, a1)
    x1i, y1i = polar(cx, cy, r_in, a1)
    x0i, y0i = polar(cx, cy, r_in, a0)
    large = 1 if (a1 - a0) > 180 else 0
    return (
        f'<path d="M {x0o:.2f} {y0o:.2f} '
        f'A {r_out} {r_out} 0 {large} 1 {x1o:.2f} {y1o:.2f} '
        f'L {x1i:.2f} {y1i:.2f} '
        f'A {r_in} {r_in} 0 {large} 0 {x0i:.2f} {y0i:.2f} Z"/>'
    )

parts = []
parts.append(f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="{DEEP}"/>')          # corteza
parts.append(f'<circle cx="{CX}" cy="{CY}" r="{R-44}" fill="{CREAM}"/>')      # albura

# 6 gajos con separación radial (gap de 7.5° por lado) + muescas centrales
N = 6
GAP = 7.5
R_OUT = R - 74
R_IN = 176
for i in range(N):
    a0 = i * (360 / N) + GAP
    a1 = (i + 1) * (360 / N) - GAP
    parts.append(f'<g fill="{LIME}">{wedge(CX, CY, R_IN, R_OUT, a0, a1)}</g>')
# brillo sutil: gajo alterno un pelín más claro (efecto pulpa)
for i in range(0, N, 2):
    a0 = i * (360 / N) + GAP
    a1 = (i + 1) * (360 / N) - GAP
    parts.append(f'<g fill="{LIME_LIGHT}" opacity="0.55">{wedge(CX, CY, R_IN, R_OUT, a0, a1)}</g>')

# Centro blanco con UNA "C" normal, verde y estrecha (a petición del míster):
# sin efecto espejado — letra C clásica de trazo fino, algo condensada
# (elipse rx<ry), color verde corteza #17552C sobre blanco.
parts.append(f'<circle cx="{CX}" cy="{CY}" r="150" fill="{PAPER}"/>')

# C como arco elíptico de trazo estrecho. Terminales cortados en radial
# (cap "butt": la cara del corte es perpendicular al trazo = corte de letra clásica).
# Apertura de ±40° a la derecha; el arco va de 320° a 40° pasando por arriba.
C_RX = 96    # semieje horizontal (menor que el vertical → C estrecha)
C_RY = 106   # semieje vertical
C_W = 32     # grosor del trazo (estrecho; el anterior era ~58)
def c_point(deg, rx, ry):
    a = math.radians(deg)
    return (CX + rx * math.cos(a), CY + ry * math.sin(a))

x0, y0 = c_point(320, C_RX + C_W / 2, C_RY + C_W / 2)
x1, y1 = c_point(40, C_RX + C_W / 2, C_RY + C_W / 2)
parts.append(
    f'<path d="M {x0:.2f} {y0:.2f} A {C_RX + C_W / 2:.0f} {C_RY + C_W / 2:.0f} 0 1 0 {x1:.2f} {y1:.2f}" '
    f'fill="none" stroke="{DEEP}" stroke-width="{C_W}"/>'
)

svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
    + "".join(parts)
    + "</svg>"
)

for path in ("/home/z/my-project/public/logo.svg",
             "/home/z/my-project/src/app/icon.svg"):
    with open(path, "w") as f:
        f.write(svg)
    print("written:", path, len(svg), "bytes")
