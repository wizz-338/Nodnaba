"""Menu badge for MANO COLONY (DEMO): the hammer-holding Mano from the banner.

    python3 scripts/menu-mano.py

The original (assets-src/colony/originals/title-banner.png) is kept as is.
From it only Mano, her hammer and the little repair sparks are taken; the
"(DEMO)" lettering that sits beside her legs is painted over with the band's
own background colour (the menu writes "(DEMO)" in the site font instead).
Mano is not redrawn or recoloured: the dark band stays behind her and only its
outer margin fades out, so she sits on the dark menu without a box.
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets-src/colony/originals/title-banner.png')
OUT = os.path.join(ROOT, 'src/assets/menu/mano-hammer.png')
HEIGHT = 160            # px; shown at most ~70 CSS px tall
BOX = (1474, 209, 1794, 485)    # Mano + hammer + sparks (source px)
DEMO = (1440, 386, 1603, 440)   # the "(DEMO)" letters next to her legs
MARGIN = 10             # dark margin that fades out around her

a = np.array(Image.open(SRC).convert('RGB')).astype(float)
bg = np.median(a[215:240, 20:200].reshape(-1, 3), 0)   # the band's colour
a[DEMO[1]:DEMO[3], DEMO[0]:DEMO[2]] = bg
x0, y0, x1, y1 = BOX
crop = a[y0:y1, x0:x1]
h, w = crop.shape[:2]
yy, xx = np.mgrid[0:h, 0:w]
edge = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy))
alpha = np.clip(edge / MARGIN, 0, 1)
rgba = np.dstack([crop, alpha * 255]).round().astype(np.uint8)
im = Image.fromarray(rgba, 'RGBA').convert('RGBa')
size = (round(w * HEIGHT / h), HEIGHT)
im = im.resize(size, Image.LANCZOS, reducing_gap=3.0).convert('RGBA')
im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(OUT, optimize=True)
print(f'{size[0]}x{size[1]}, {os.path.getsize(OUT)} bytes')
