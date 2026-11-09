#!/usr/bin/env python3
# ============================================================================
# LOGO CATEDRA by Método — gajo de limón con "C" partida (fiel al adjunto)
# • Corteza: anillo verde profundo #17552C
# • Albura (segundo anillo): crema #F1EDDA
# • 6 gajos verde claro #A8D878 separados por radios crema
# • Centro blanco con "C" espejada: mitad superior verde→C blanca,
#   mitad inferior blanco→C verde
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

# Centro blanco (todo clipeado al círculo central para no pisar los gajos)
parts.append(f'<clipPath id="cc"><circle cx="{CX}" cy="{CY}" r="150"/></clipPath>')
parts.append('<g clip-path="url(#cc)">')
parts.append(f'<circle cx="{CX}" cy="{CY}" r="150" fill="{PAPER}"/>')
# Mitad superior del centro en verde (para la C blanca)
parts.append(f'<path d="M {CX-150} {CY} A 150 150 0 0 1 {CX+150} {CY} Z" fill="{DEEP}"/>')

# Letra C (Geist-like: trazo grueso geométrico). La dibujamos como path único
# centrado, luego dos copias clipadas a cada mitad con colores intercambiados.
C_PATH = (
    "M 601.5 415.5 "
    "C 578 375.5 540.5 352 494 352 "
    "C 420 352 368 408 368 512 "
    "C 368 616 420 672 494 672 "
    "C 540.5 672 578 648.5 601.5 608.5 "
    "L 663 641 "
    "C 630 700.5 570 738 494 738 "
    "C 379 738 296 650 296 512 "
    "C 296 374 379 286 494 286 "
    "C 570 286 630 323.5 663 383 "
    "Z"
)
parts.append(f'<clipPath id="topHalf"><rect x="{CX-160}" y="{CY-160}" width="320" height="160"/></clipPath>')
parts.append(f'<clipPath id="bottomHalf"><rect x="{CX-160}" y="{CY}" width="320" height="160"/></clipPath>')
# El path de la C está centrado en (479.5, 512): lo re-centramos al (512,512)
# y escalamos 0.8 para que quepa en el círculo blanco (r=150).
C_TRANSFORM = f'transform="translate({CX} {CY}) scale(0.8) translate(-479.5 -{CY})"'
# Mitad superior: fondo verde → C blanca
parts.append(f'<g clip-path="url(#topHalf)"><path d="{C_PATH}" fill="{PAPER}" {C_TRANSFORM}/></g>')
# Mitad inferior: fondo blanco → C verde
parts.append(f'<g clip-path="url(#bottomHalf)"><path d="{C_PATH}" fill="{DEEP}" {C_TRANSFORM}/></g>')
parts.append('</g>')

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
