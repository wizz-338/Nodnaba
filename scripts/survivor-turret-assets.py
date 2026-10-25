#!/usr/bin/env python3
"""MANO SURVIVOR — the turret's pictures (chapter 20's reward, turret.js).

    python3 -I scripts/survivor-turret-assets.py <turret sheet>

Reads the turret sheet (a 1536 × 1024 picture on a cream ground: two rows of
four turrets turned different ways, then parts; the original is not changed
or copied) and writes:
  src/survivor/assets/s84/ep04/turret/turret.webp   eight frames in a row,
      one for each way the cannon can point (S SW W NW N NE E SE); E and SE
      are W and SW mirrored (the sheet has none turned right)
and the picture's entry `turret` in src/survivor/data/ep04-assets.json, with
`frames`: { way: [x, y, w, h, footX, footY] } (footX/Y: the middle of the
base's bottom, in the frame) and `muzzle`: { way: [x, y] } (where its ball
leaves, from the foot, in the frame's pixels).

The cream ground is taken away by a flood from each cell's edges that stops
at the drawing's dark outline (the soft painted shadow goes with it: the game
draws its own); then only the largest piece is kept.
"""
import hashlib
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'src', 'survivor', 'assets', 's84', 'ep04', 'turret')
MAP = os.path.join(ROOT, 'src', 'survivor', 'data', 'ep04-assets.json')

CELL = (384, 350)  # the sheet's cells: four across, two rows
GROUND = np.array([254, 244, 231])  # the cream ground
TOL = 150  # how far from the ground a colour may be and still be ground
# which cell is which way (cells counted left to right, top row first):
# 1 front (S), 2 front-left (SW), 3 left (W), 4 back-right (NE),
# 5 back (N), 6 back-left (NW); 7 and 8 repeat W and SW
WAYS = [('S', 0, False), ('SW', 1, False), ('W', 2, False), ('NW', 5, False), ('N', 4, False), ('NE', 3, False), ('E', 2, True), ('SE', 1, True)]
SCALE = 0.36  # the frames' size against the sheet's (about 100 px tall)
# where the ball leaves: the mouth's middle, picked by hand on each cell (in
# the cell's pixels)
MOUTH = {0: (200, 210), 1: (95, 190), 2: (68, 180), 3: (265, 100), 4: (210, 70), 5: (88, 100)}


def ground(cell):
    """True where the cell's colour is ground reached from its edges."""
    d = np.abs(cell.astype(np.int32) - GROUND).sum(axis=2)
    h, w = d.shape
    seen = np.zeros((h, w), bool)
    q = deque([(y, x) for x in range(w) for y in (0, h - 1)] + [(y, x) for y in range(h) for x in (0, w - 1)])
    while q:
        y, x = q.popleft()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or d[y, x] > TOL:
            continue
        seen[y, x] = True
        q.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    return seen


def largest(mask):
    """Only the largest connected piece of mask."""
    h, w = mask.shape
    label = np.zeros((h, w), np.int32)
    best, best_n, n = 0, 0, 0
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0, x0] or label[y0, x0]:
                continue
            n += 1
            q = deque([(y0, x0)])
            label[y0, x0] = n
            size = 0
            while q:
                y, x = q.popleft()
                size += 1
                for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not label[yy, xx]:
                        label[yy, xx] = n
                        q.append((yy, xx))
            if size > best_n:
                best, best_n = n, size
    return label == best


def frame(sheet, i, flip):
    cx, cy = i % 4, i // 4
    x0, y0 = cx * CELL[0], cy * CELL[1]
    rgb = sheet[y0:y0 + CELL[1], x0:x0 + CELL[0]]
    keep = largest(~ground(rgb))
    alpha = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    im = Image.fromarray(rgb.astype(np.uint8)).convert('RGBA')
    im.putalpha(alpha)
    ys, xs = np.nonzero(keep)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    # the foot: the middle of the base's bottom rows
    low = xs[ys >= ys.max() - 25]
    foot = ((low.min() + low.max()) / 2, ys.max())
    mouth = MOUTH[i]
    im = im.crop(box)
    foot = (foot[0] - box[0], foot[1] - box[1])
    mouth = (mouth[0] - box[0], mouth[1] - box[1])
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        foot = (im.width - foot[0], foot[1])
        mouth = (im.width - mouth[0], mouth[1])
    w, h = round(im.width * SCALE), round(im.height * SCALE)
    im = im.resize((w, h), Image.LANCZOS)
    return im, (foot[0] * SCALE, foot[1] * SCALE), (mouth[0] * SCALE, mouth[1] * SCALE)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    img = Image.open(src)
    if img.size != (1536, 1024):
        sys.exit(f'{src}: expected 1536 × 1024, got {img.size}')
    sheet = np.asarray(img.convert('RGB'))
    frames = [(way, *frame(sheet, i, flip)) for way, i, flip in WAYS]
    W = sum(f[1].width for f in frames) + 2 * len(frames)
    H = max(f[1].height for f in frames)
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out_frames, out_mouth, x = {}, {}, 0
    for way, im, foot, mouth in frames:
        atlas.alpha_composite(im, (x, 0))
        out_frames[way] = [x, 0, im.width, im.height, round(float(foot[0]), 1), round(float(foot[1]), 1)]
        out_mouth[way] = [round(float(mouth[0] - foot[0]), 1), round(float(mouth[1] - foot[1]), 1)]
        x += im.width + 2
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, 'turret.webp')
    atlas.save(path, 'WEBP', quality=90, method=6)
    with open(src, 'rb') as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    with open(MAP, encoding='utf-8') as f:
        data = json.load(f)
    entry = {
        'source': os.path.basename(src),
        'width': img.size[0],
        'height': img.size[1],
        'sha256': digest,
        'id': 'turret',
        'kind': 'atlas',
        'region': 'desert',
        'name': '포탑',
        'file': 'ep04/turret/turret.webp',
        'out': [W, H],
        'bytes': os.path.getsize(path),
        'frames': out_frames,
        'muzzle': out_mouth,
    }
    data['images'] = [x for x in data['images'] if x['id'] != 'turret'] + [entry]
    data['note'] = data['note'].replace("(MANO_CH20_CUTSCENES, built by scripts/survivor-ep04-assets.py)", "(MANO_CH20_CUTSCENES, built by scripts/survivor-ep04-assets.py; the turret's frames by scripts/survivor-turret-assets.py)")
    with open(MAP, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f'{path}: {W} × {H}, {entry["bytes"]} bytes; frames {out_frames}')


if __name__ == '__main__':
    main()
