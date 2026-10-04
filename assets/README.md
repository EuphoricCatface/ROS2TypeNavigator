# Artwork

The editable icon source is [icon.svg](../extension/icons/icon.svg). It uses a folded document, black bold ROS lettering, and four nodes connected by arrows. The node color is `#22314E`, from the [official ROS brand guide](https://www.ros.org/imgs/ROSBrandGuide.pdf).

PNG icons are included at 32, 48, 64, 96, 128, and 256 pixels in `extension/icons/`. Their backgrounds are transparent. No 16-pixel export is included.

In the 128-pixel SVG coordinate system, the graph nodes are A `(31.2, 79)`, B `(60, 87)`, C `(89.6, 70)`, and D `(96.8, 103)`, with edges A → B, B → C, B → D, and C → D. Node x coordinates use `64 + 0.8 × (original_x − 64)`, y coordinates are shifted up by 5, and each node has radius 6. Arrow tips stop 1 pixel before the destination node’s edge. The folded corner sits above the lettering, and its diagonal outline is drawn last to keep the stroke width consistent.

The [promotional tile SVG](promo-tile.svg) and [PNG](promo-tile.png) are 440 × 280 pixels. The tile reuses the icon above centered lettering on a light blue vertical gradient.

To regenerate the PNG icons and both promotional tile files after editing the icon:

```sh
python3 scripts/render-assets.py
```

This optional development command needs Python 3 and `rsvg-convert` from librsvg. The SVGs use DejaVu Sans Bold, with Arial and sans-serif fallbacks; install DejaVu Sans to reproduce the current lettering. Loading the extension does not require these tools.

Copyright (C) 2026 Seongyong Park and contributors. SPDX-License-Identifier: GPL-3.0-or-later.
