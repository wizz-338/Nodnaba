#!/usr/bin/env python3
"""MANO SURVIVOR — the ninja cats' pictures (닌자냥이, zyo_'s cat classes C and D).

    python3 -I scripts/survivor-ninja-assets.py <ninja cat sheet>

Reads the ninja cat sheet (1125 × 844, transparent: six rows of a black cat
in a red scarf with a sword, 9 + 8 + 8 + 6 + 6 + 8 poses; the original is not
changed or copied) and writes:
  src/survivor/assets/s84/ep03/ninja/ninja_cat.webp   the poses the game draws
and the picture's entry `ninja_cat` in src/survivor/data/ep03-assets.json,
with `frames`: { animation: [[x, y, w, h, footX, footY], …] } (footX/Y: where
the cat stands, in the frame) and `bodyH`: how tall the cat stands (its
first pose, front on), so the game draws it the size it wants.

The poses: each is one piece of the picture's opaque pixels (grown by GROW px
so a sword or a scarf tip a pixel off goes with its cat), told apart by
their row and order. The foot: under the cat's dark body (not its sword, its
scarf nor the red of its slashes), in the middle of it.

Kept (render-zyo.js draws them; all turned to the right, mirrored for the
left): dash (row 5, the first two: running low with red speed lines), slash
(row 4: the six blows, a red crescent with each), air (row 5, third and
fourth: the leap with the sword, the two swords) and land (row 5, fifth: the
landing in a burst of red).
"""
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'src', 'survivor', 'assets', 's84', 'ep03', 'ninja')
MAP = os.path.join(ROOT, 'src', 'survivor', 'data', 'ep03-assets.json')
SIZE = (1125, 844)
ROWS = [9, 8, 8, 6, 6, 8]  # poses in each row, top to bottom
GROW = 4
# the animations kept: (row, index in the row) of each frame, in order
KEEP = {
    'dash': [(4, 0), (4, 1)],
    'slash': [(3, i) for i in range(6)],
    'air': [(4, 2), (4, 3)],
    'land': [(4, 4)],
}
STAND = (0, 0)  # the pose whose height is the cat's (bodyH)
ATLAS_W = 1024  # the atlas's rows wrap at this width
PAD = 2


def poses(rgba):
    """The poses, row by row, left to right: [[(mask, box), …], …]."""
    m = rgba[..., 3] > 40
    lab, n = nd.label(nd.binary_dilation(m, iterations=GROW))
    found = []
    for i, s in enumerate(nd.find_objects(lab)):
        mask = m[s] & (lab[s] == i + 1)
        if mask.sum() < 300:
            continue
        found.append((mask, (s[1].start, s[0].start, s[1].stop, s[0].stop)))
    if len(found) != sum(ROWS):
        sys.exit(f'expected {sum(ROWS)} poses, found {len(found)}')
    # rows: by the bottoms, top to bottom, cut where they jump
    found.sort(key=lambda p: p[1][3])
    rows, at = [], 0
    for k in ROWS:
        rows.append(sorted(found[at:at + k], key=lambda p: p[1][0]))
        at += k
    return rows


def foot(rgb, mask):
    """Under the cat's dark body, in the middle of it (in the box's pixels)."""
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    dark = mask & (np.maximum(np.maximum(r, g), b) < 110) & (r - g < 40)
    ys, xs = np.nonzero(dark if dark.sum() > 200 else mask)
    return float(np.median(xs)), float(ys.max() + 1)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    img = Image.open(src).convert('RGBA')
    if img.size != SIZE:
        sys.exit(f'{src}: expected {SIZE[0]} × {SIZE[1]}, got {img.size}')
    rgba = np.asarray(img)
    rows = poses(rgba)
    cut = {}
    for name, where in KEEP.items():
        for r, i in where:
            mask, (x0, y0, x1, y1) = rows[r][i]
            px = rgba[y0:y1, x0:x1].copy()
            px[..., 3] = np.where(mask, px[..., 3], 0)
            cut.setdefault(name, []).append((Image.fromarray(px, 'RGBA'), foot(px[..., :3], mask)))
    sx0, sy0, sx1, sy1 = rows[STAND[0]][STAND[1]][1]
    # the atlas: the frames in rows of at most ATLAS_W
    places, x, y, row_h, W = [], 0, 0, 0, 0
    for name, fr in cut.items():
        for im, _ in fr:
            if x and x + im.width > ATLAS_W:
                x, y, row_h = 0, y + row_h + PAD, 0
            places.append((x, y))
            x += im.width + PAD
            row_h = max(row_h, im.height)
            W = max(W, x - PAD)
    H = y + row_h
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    frames, k = {}, 0
    for name, fr in cut.items():
        for im, (fx, fy) in fr:
            px, py = places[k]
            k += 1
            atlas.alpha_composite(im, (px, py))
            frames.setdefault(name, []).append([px, py, im.width, im.height, round(fx, 1), round(fy, 1)])
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, 'ninja_cat.webp')
    atlas.save(path, 'WEBP', quality=90, method=6)
    with open(src, 'rb') as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    with open(MAP, encoding='utf-8') as f:
        data = json.load(f)
    entry = {
        'source': os.path.basename(src),
        'width': SIZE[0],
        'height': SIZE[1],
        'sha256': digest,
        'id': 'ninja_cat',
        'kind': 'atlas',
        'region': 'skulltown',
        'name': '닌자냥이',
        'file': 'ep03/ninja/ninja_cat.webp',
        'out': [W, H],
        'bytes': os.path.getsize(path),
        'bodyH': sy1 - sy0,
        'frames': frames,
    }
    data['images'] = [x for x in data['images'] if x['id'] != 'ninja_cat'] + [entry]
    data['note'] = data['note'].replace("(MANO_CH15_CUTSCENES, built by scripts/survivor-ep03-assets.py)", "(MANO_CH15_CUTSCENES, built by scripts/survivor-ep03-assets.py; the ninja cats' frames by scripts/survivor-ninja-assets.py)")
    with open(MAP, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f'{path}: {W} × {H}, {entry["bytes"]} bytes, bodyH {entry["bodyH"]}; ' + ', '.join(f'{n} {len(v)}' for n, v in frames.items()))


if __name__ == '__main__':
    main()
