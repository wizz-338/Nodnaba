"""Build MANO COLONY game assets from the delivered sheets.

    python3 scripts/colony-assets.py

Reads assets-src/colony/manifest-v2.json and the untouched originals in
assets-src/colony/originals-v2/, writes atlases (PNG + JSON) to
src/colony/assets/. The outputs are committed, so the site build never needs
Python. Needs Pillow, numpy and scipy.

Each frame in the JSON has its atlas rectangle, an anchor (the point that
stands on the ground) and `k`: atlas pixels per world pixel, so the game can
draw it at its intended size whatever resolution it was stored at.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from colony_assets_lib import body, cells, clean_soft, cut, head_width, head_x, pack, resize, segment, split_pair  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets-src/colony')
OUT = os.path.join(ROOT, 'src/colony/assets')

MANO_WORLD_H = 52      # Mano's standing height in world px
STORE = 2              # store at 2x world size (sharp on phones), never above the original
TILE_W, TILE_H = 64, 32
BLEED = 2              # px of colour bled past a floor tile's edge, so tiles meet without seams


def boxed(a, box):
    """Mask of the drawing inside an explicit source box (for touching drawings)."""
    x0, y0, x1, y1 = box
    m = np.zeros(a.shape[:2], bool)
    m[y0:y1, x0:x1] = a[y0:y1, x0:x1, 3] > 0
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= 30
        m = keep[lab]
    return m


def tile(a, mask):
    """A floor diamond resized to exactly 2:1, masked, with a little colour bleed."""
    img, _ = cut(a, mask)
    w, h = TILE_W * STORE, TILE_H * STORE
    small = np.array(Image.fromarray(img, 'RGBA').convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA'))
    out = np.zeros((h + 2 * BLEED, w + 2 * BLEED, 4), np.uint8)
    out[BLEED:BLEED + h, BLEED:BLEED + w] = small
    # exact diamond, then grow its colour outward by BLEED px (fully opaque)
    dm = Image.new('L', (w + 2 * BLEED, h + 2 * BLEED), 0)
    ImageDraw.Draw(dm).polygon([(BLEED + w / 2, BLEED - 0.5), (BLEED + w + 0.5, BLEED + h / 2),
                                (BLEED + w / 2, BLEED + h + 0.5), (BLEED - 0.5, BLEED + h / 2)], fill=255)
    inside = np.array(dm) > 0
    # colour is taken from 2px inside the diamond, so a dark outline drawn
    # around the tile on the sheet never shows up as dots where tiles meet
    solid = ndimage.binary_erosion(inside, iterations=2) & (out[..., 3] > 0)
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    grow = ndimage.binary_dilation(inside, iterations=BLEED)
    res = np.zeros_like(out)
    res[grow, :3] = out[iy[grow], ix[grow], :3]
    res[grow, 3] = 255
    return res, ((w + 2 * BLEED) / 2, (h + 2 * BLEED) / 2), STORE


def mano_head_world(man):
    """Hood width of the walking / standing Mano in game px (the size to match)."""
    sh = man['sheets']['mano-carry-rest']
    a = clean_soft(os.path.join(SRC, 'originals-v2', sh['file']))
    found = cells(a, 4, 4, dilate=2, min_px=300)
    stand, _ = cut(a, found[(3, 0)])
    return head_width(stand) / (stand.shape[0] / MANO_WORLD_H)


def play_sheets(atlases, head_world):
    """Play / rest actions: one row per action, frames found where they are drawn.

    Every sheet gets one scale (its hood width matched to the walking Mano), so
    frames of one action never change size. Each frame is anchored where the
    character meets the ground: the lowest body pixel (or one ground line for a
    whole row when the action leaves the ground), horizontally at the hood or
    body centre, so poses do not slide around between frames."""
    man = json.load(open(os.path.join(SRC, 'manifest-play.json')))
    for name, sh in man['sheets'].items():
        a = clean_soft(os.path.join(SRC, 'originals-play', sh['file']))
        frames = segment(a, sh['rows'], 4)
        heads = []
        for key in sh['scale']:
            img, _ = cut(a, frames[tuple(map(int, key.split(',')))][0])
            if sh.get('pair'):
                left, right, _ = split_pair(img)
                heads += [head_width(left), head_width(right)]
            else:
                heads.append(head_width(img))
        k = float(np.median(heads)) / head_world
        s = min(1.0, STORE / k)
        print(f'· {name}  scale {k:.2f} source px per game px')
        for r, (act, anchor, base) in enumerate(sh['acts']):
            row_ground = max(int(np.where(body(frames[(r, c)][0]))[0].max()) for c in range(4))
            for c in range(4):
                mask, _ = frames[(r, c)]
                img, src = cut(a, mask)
                core = body(mask)[src[1]:src[3], src[0]:src[2]]
                ys, xs = np.where(core)
                if anchor == 'head':
                    shown = img.copy()
                    shown[~core] = 0
                    ax = head_x(shown)
                else:  # body / pair: centre of the drawn body (or both bodies)
                    ax = (xs.min() + xs.max() + 1) / 2
                ay = (row_ground - src[1] + 1) if base == 'row' else ys.max() + 1
                small = resize(img, s) if s < 1 else img
                atlases.setdefault(sh['atlas'], {})[f'{act}_{c}'] = (small, (ax * s, ay * s), k * s, src, name)


def main():
    man = json.load(open(os.path.join(SRC, 'manifest-v2.json')))
    atlases = {}
    # Mano: one scale for every sheet, from the median walking height
    mano_k = None
    for name, sh in man['sheets'].items():
        if sh.get('skip'):
            continue
        path = os.path.join(SRC, 'originals-v2', sh['file'])
        rows, cols = sh['grid']
        kind = sh['kind']
        a = clean_soft(path, min_core=sh.get('minCore', 60))
        found = cells(a, cols, rows, dilate=2, min_px=300)
        print('·', name)
        for key, spec in sh['cells'].items():
            spec = {'name': spec} if isinstance(spec, str) else spec
            r, c = map(int, key.split(','))
            mask = boxed(a, spec['box']) if 'box' in spec else found.get((r, c))
            if mask is None or not mask.any():
                raise SystemExit(f'{name}: nothing in cell {key}')
            img, src = cut(a, mask)
            fname = spec['name']

            if kind == 'icon':
                n = sh['size']
                small = resize(img, n / max(img.shape[:2]))
                canvas = np.zeros((n, n, 4), np.uint8)
                y0, x0 = (n - small.shape[0]) // 2, (n - small.shape[1]) // 2
                canvas[y0:y0 + small.shape[0], x0:x0 + small.shape[1]] = small
                os.makedirs(os.path.join(OUT, 'ui'), exist_ok=True)
                Image.fromarray(canvas, 'RGBA').save(os.path.join(OUT, 'ui', fname + '.png'), optimize=True)
                continue

            if kind == 'tile':
                out, anchor, k = tile(a, mask)
                atlases.setdefault(sh['atlas'], {})[fname] = (out, anchor, k, src, name)
                continue

            if kind == 'character':
                # each sheet was drawn at its own size: scale it so Mano's
                # upright frames on it stand MANO_WORLD_H tall
                if mano_k is None or mano_k[0] != name:
                    hs = [cut(a, found[tuple(map(int, c.split(',')))])[0].shape[0] for c in sh['normalize']]
                    mano_k = (name, float(np.median(hs)) / MANO_WORLD_H)
                k = mano_k[1]
            else:
                k = spec.get('k', sh.get('k', 3))
            s = min(1.0, STORE / k)  # stored px per source px
            small = resize(img, s) if s < 1 else img
            if kind == 'character':
                anchor = (head_x(small), small.shape[0])
            elif 'anchor' in spec:
                anchor = ((spec['anchor'][0] - src[0]) * s, (spec['anchor'][1] - src[1]) * s)
            else:
                anchor = (small.shape[1] / 2, small.shape[0])
            atlases.setdefault(sh['atlas'], {})[fname] = (small, anchor, k * s, src, name)

    play_sheets(atlases, mano_head_world(man))

    for atlas, items in atlases.items():
        img, pos = pack({n: v[0] for n, v in items.items()}, width=2048)
        q = Image.fromarray(img, 'RGBA').quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
        os.makedirs(os.path.join(OUT, 'atlas'), exist_ok=True)
        q.save(os.path.join(OUT, 'atlas', atlas + '.png'), optimize=True)
        frames = {}
        for n in sorted(items):
            x, y, w, h = pos[n]
            _, (ax, ay), k, src, sheet = items[n]
            frames[n] = {'x': x, 'y': y, 'w': w, 'h': h, 'ax': round(ax, 1), 'ay': round(ay, 1), 'k': round(k, 4),
                         'from': sheet, 'src': [int(v) for v in src]}
        json.dump({'_about': 'generated by scripts/colony-assets.py, do not edit by hand', 'frames': frames},
                  open(os.path.join(OUT, 'atlas', atlas + '.json'), 'w'), indent=1)
        print(f'  {atlas}.png {img.shape[1]}x{img.shape[0]}  {len(items)} frames  '
              f'{os.path.getsize(os.path.join(OUT, "atlas", atlas + ".png")) // 1024} KB')


if __name__ == '__main__':
    main()
