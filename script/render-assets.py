#!/usr/bin/env python3
# Copyright (C) 2026 Seongyong Park and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Render checked-in SVG artwork with librsvg; not needed to load the extension."""

from copy import deepcopy
from pathlib import Path
import shutil
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)
CONVERTER = shutil.which("rsvg-convert")
if not CONVERTER:
    raise SystemExit("Asset rendering requires rsvg-convert (librsvg).")

icon = ROOT / "extension/icons/icon.svg"
source = ET.parse(icon).getroot().find(f"{{{SVG}}}g")
if source is None:
    raise SystemExit("The icon SVG must contain its document-icon group.")

art = ROOT / "assets"
art.mkdir(exist_ok=True)
tile = ET.Element(f"{{{SVG}}}svg", {
    "width": "440", "height": "280", "viewBox": "0 0 440 280",
    "role": "img", "aria-labelledby": "title description",
})
ET.SubElement(tile, f"{{{SVG}}}title", {"id": "title"}).text = "ROS2 Type Navigator"
ET.SubElement(tile, f"{{{SVG}}}desc", {"id": "description"}).text = (
    "A centered ROS document and graph icon above Navigate ROS2 docs easily, on a light blue vertical gradient."
)
defs = ET.SubElement(tile, f"{{{SVG}}}defs")
gradient = ET.SubElement(defs, f"{{{SVG}}}linearGradient", {
    "id": "background", "x1": "0", "y1": "0", "x2": "0", "y2": "1",
})
ET.SubElement(gradient, f"{{{SVG}}}stop", {"offset": "0", "stop-color": "#f4fbff"})
ET.SubElement(gradient, f"{{{SVG}}}stop", {"offset": "1", "stop-color": "#cce6f5"})
ET.SubElement(tile, f"{{{SVG}}}rect", {"width": "440", "height": "280", "fill": "url(#background)"})
group = ET.SubElement(tile, f"{{{SVG}}}g", {"transform": "translate(124 8) scale(1.5)"})
group.append(deepcopy(source))
ET.SubElement(tile, f"{{{SVG}}}text", {
    "x": "220", "y": "242", "text-anchor": "middle",
    "font-family": "DejaVu Sans, Arial, sans-serif", "font-size": "22",
    "font-weight": "700", "fill": "#172e38",
}).text = "Navigate ROS2 docs easily"
ET.indent(tile, space="  ")
tile_svg = art / "promo-tile.svg"
tile_svg.write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<!-- Copyright (C) 2026 Seongyong Park and contributors\n'
    '     SPDX-License-Identifier: GPL-3.0-or-later -->\n'
    + ET.tostring(tile, encoding="unicode") + "\n"
)

for size in (32, 48, 64, 96, 128, 256):
    output = icon.with_name(f"icon-{size}.png")
    subprocess.run([CONVERTER, "-w", str(size), "-h", str(size), "-o", str(output), str(icon)], check=True)
    print(output.relative_to(ROOT))
subprocess.run([CONVERTER, "-o", str(art / "promo-tile.png"), str(tile_svg)], check=True)
print(tile_svg.relative_to(ROOT))
print((art / "promo-tile.png").relative_to(ROOT))
