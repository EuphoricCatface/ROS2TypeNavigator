# Artwork

Edit [the icon SVG](../extension/icons/icon.svg), then regenerate the PNG icons and promotional tile:

```sh
python3 script/render-assets.py
```

Run this from the repository root. Rendering requires Python 3, `rsvg-convert` from librsvg, and DejaVu Sans for consistent lettering. Arial and sans-serif are font fallbacks. Rendered assets are checked in, so these tools are only needed when changing artwork.

| Asset | Format and dimensions |
| --- | --- |
| [Icon](../extension/icons/icon.svg) | SVG with a 128 × 128 viewBox |
| `extension/icons/icon-*.png` | Transparent PNGs at 32, 48, 64, 96, 128, and 256 pixels |
| [Promotional tile](promo-tile.svg) | Self-contained SVG, 440 × 280 pixels |
| [Promotional tile PNG](promo-tile.png) | 440 × 280 pixels |

The renderer reuses the icon in the promotional tile, with centered lettering and a light blue vertical gradient. Edit the tile layout in [render-assets.py](../script/render-assets.py); its SVG is generated output.

The graph uses ROS blue `#22314E` from the [ROS brand guide](https://www.ros.org/imgs/ROSBrandGuide.pdf). Keep the bold lettering, document outline, and arrows legible at the smallest exported size.

Copyright © 2026 Seongyong Park and contributors. [GPL-3.0-or-later](../LICENSE).
