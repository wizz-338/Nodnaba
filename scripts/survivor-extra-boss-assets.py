#!/usr/bin/env python3
"""MANO SURVIVOR — the extra special bosses' frames (MANO_EXTRA_BOSSES).

    python3 -I scripts/survivor-extra-boss-assets.py <MANO_EXTRA_BOSSES folder> [review folder]

Reads boss_catalog.json and the 14 sheets it names (the originals are not
changed or copied) and writes:
  src/survivor/assets/motion/<id>.webp   one runtime atlas per boss
  src/survivor/data/extra-motion.json    its frames, pivots, animations

Each sheet is 4 poses across and 3 rows down (move, attack: ready / charge /
strike / recover, death), but not an even grid: the borders between poses
are found where the sheet is emptiest near the even grid's lines (the rows
first, then the columns of each row), and then, as for the motion package
(survivor-motion-assets.py, whose cutting this uses), each opaque shape goes
whole to the pose that holds most of it, so a neighbour's wing or spark is
never cut into a frame. A shape reaching well into two poses is split and
reported.

Pivots: across, the body's middle; down, walkers stand on their feet and
flyers keep their body's centre. One scale per boss (its first move pose's
long side), never a fit frame by frame.
"""
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'survivor', 'assets', 'motion')
MAP = os.path.join(ROOT, 'src', 'survivor', 'data', 'extra-motion.json')

spec = importlib.util.spec_from_file_location('motion_assets', os.path.join(ROOT, 'scripts', 'survivor-motion-assets.py'))
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)

# the catalog's ids → the game's
IDS = {
    'extra_01': 'x_snail', 'extra_02': 'x_moth', 'extra_03': 'x_toad', 'extra_04': 'x_spider', 'extra_05': 'x_bellkeeper',
    'extra_06': 'x_organ', 'extra_07': 'x_scarab', 'extra_08': 'x_sultan', 'extra_09': 'x_jelly', 'extra_10': 'x_peacock',
    'extra_11': 'x_ray', 'extra_12': 'x_clock', 'extra_13': 'x_queen', 'extra_14': 'x_eclipse',
}
FLYERS = {'x_jelly', 'x_ray', 'x_clock'}
ATLAS_LONG = 340  # its first move pose, long side, in atlas px
DURATIONS = [150] * 4 + [160] * 4 + [190] * 4
ANIMS = {'move': {'frames': [0, 1, 2, 3], 'loop': True}, 'attack': {'frames': [4, 5, 6, 7], 'loop': False}, 'death': {'frames': [8, 9, 10, 11], 'loop': False}}


def emptiest(profile, at, span):
    """the index near `at` (within span) where the profile is lowest"""
    lo, hi = max(1, int(at - span)), min(len(profile) - 1, int(at + span))
    seg = profile[lo:hi]
    # several equal minima (an empty gap): the middle of the gap
    m = seg.min()
    idx = np.nonzero(seg <= m + max(1, m * 0.02))[0]
    runs = np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1)
    best = max(runs, key=len)
    return lo + int(best[len(best) // 2])


def rects(alpha):
    """4 × 3 rects whose borders lie in the emptiest places near the even grid"""
    H, W = alpha.shape
    solid = alpha > M.ALPHA
    rows = solid.sum(1)
    ys = [0] + [emptiest(rows, H * k / 3, H / 9) for k in (1, 2)] + [H]
    out = []
    for r in range(3):
        band = solid[ys[r]:ys[r + 1]]
        cols = band.sum(0)
        xs = [0] + [emptiest(cols, W * k / 4, W / 12) for k in (1, 2, 3)] + [W]
        for c in range(4):
            out.append({'rect': [xs[c], ys[r], xs[c + 1] - xs[c], ys[r + 1] - ys[r]]})
    return out


def main(src, review=None):
    cat = json.load(open(os.path.join(src, 'boss_catalog.json'), encoding='utf-8'))
    os.makedirs(OUT, exist_ok=True)
    out = {}
    report = []
    for b in cat:
        gid = IDS[b['id']]
        path = os.path.join(src, b['file'])
        sheet = Image.open(path).convert('RGBA')
        arr = np.asarray(sheet)
        frames = rects(arr[:, :, 3])
        masks, notes, touching = M.cut(sheet, frames)
        fly = gid in FLYERS
        info = []
        for i, m in enumerate(masks):
            ys, xs = np.nonzero(m)
            if not len(xs):
                info.append(None)
                notes.append(f'frame {i} is empty after cutting')
                continue
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            lab, n = ndimage.label(m, structure=np.ones((3, 3), bool))
            sizes = ndimage.sum(m, lab, index=np.arange(1, n + 1))
            body = lab == (int(np.argmax(sizes)) + 1)
            by, bx = np.nonzero(body)
            px = float(np.median(bx))
            py = float(np.median(by)) if fly else float(by.max() + 1)
            info.append({'box': [int(x0), int(y0), int(x1 - x0), int(y1 - y0)], 'pivot': [px, py], 'bodyH': int(by.max() - by.min() + 1), 'bodyW': int(bx.max() - bx.min() + 1)})
        move0 = info[0]
        ref_long = max(move0['bodyW'], move0['bodyH'])
        k = ATLAS_LONG / ref_long
        cells = []
        for i, f in enumerate(info):
            x, y, w, h = f['box']
            img = np.zeros((h, w, 4), np.uint8)
            sub = arr[y:y + h, x:x + w]
            mm = masks[i][y:y + h, x:x + w]
            img[mm] = sub[mm]
            im = Image.fromarray(img, 'RGBA').resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
            cells.append((im, (f['pivot'][0] - x) * k, (f['pivot'][1] - y) * k))
        # a body that grows or shrinks a lot from pose to pose (the art's own
        # scale, not ours: we never fit) is worth a look
        for i, f in enumerate(info):
            r = max(f['bodyW'], f['bodyH']) / ref_long
            if i < 8 and (r > 1.25 or r < 0.75):
                notes.append(f'frame {i}: body {r:.2f}× its first move pose')
        rows = [ANIMS['move']['frames'], ANIMS['attack']['frames'], ANIMS['death']['frames']]
        pad = 2
        aw = max(sum(cells[i][0].width + pad for i in row) for row in rows) + pad
        ah = sum(max(cells[i][0].height for i in row) + pad for row in rows) + pad
        atlas = Image.new('RGBA', (aw, ah), (0, 0, 0, 0))
        fr = [None] * len(cells)
        yy = pad
        for row in rows:
            xx = pad
            for i in row:
                im, px, py = cells[i]
                atlas.paste(im, (xx, yy))
                fr[i] = [xx, yy, im.width, im.height, round(px, 2), round(py, 2)]
                xx += im.width + pad
            yy += max(cells[i][0].height for i in row) + pad
        fname = gid + '.webp'
        atlas.save(os.path.join(OUT, fname), 'WEBP', quality=86, method=6)
        out[gid] = {
            'name': b['name'],
            'role': 'extra',
            'stage': b['stage'],
            'fly': fly,
            'file': 'motion/' + fname,
            'refLong': round(ref_long * k, 2),
            'frames': fr,
            'durations': DURATIONS,
            'animations': ANIMS,
            'source': b['file'],
            'sha256': M.sha(path),
            'cut': [f['rect'] for f in frames],
        }
        if notes:
            report.append({'id': gid, 'name': b['name'], 'file': b['file'], 'notes': notes, 'touching': touching})
        if review:
            S = 0.5
            cw = int(max(c[0].width for c in cells) * S) + 20
            ch = int(max(c[0].height for c in cells) * S) + 40
            base = int(max(c[2] for c in cells) * S) + 20
            sh = Image.new('RGBA', (cw * 4, (ch + 20) * 3), (62, 64, 74, 255))
            from PIL import ImageDraw
            d = ImageDraw.Draw(sh)
            for i, (im, px, py) in enumerate(cells):
                r, c = divmod(i, 4)
                im2 = im.resize((max(1, int(im.width * S)), max(1, int(im.height * S))))
                oy = r * (ch + 20)
                sh.alpha_composite(im2, (int(c * cw + cw / 2 - px * S), int(oy + base - py * S)))
                d.line([(c * cw, oy + base), ((c + 1) * cw, oy + base)], fill=(80, 255, 80, 255))
                d.text((c * cw + 4, oy + 4), str(i), fill=(255, 255, 0, 255))
            sh.convert('RGB').save(os.path.join(review, gid + '.png'))
    data = {
        'note': 'MANO SURVIVOR extra special bosses (MANO_EXTRA_BOSSES, built by scripts/survivor-extra-boss-assets.py): the same form as motion.json — frames [x, y, w, h, pivotX, pivotY] in atlas px, refLong the one scale, animations move 4 / attack 4 (ready, charge, strike, recover) / death 4. cut: the sheet rects the poses were found in.',
        'package': 'MANO_EXTRA_BOSSES',
        'characters': out,
    }
    json.dump(data, open(MAP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if review:
        json.dump(report, open(os.path.join(review, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    total = sum(os.path.getsize(os.path.join(OUT, c['file'].split('/')[1])) for c in out.values())
    print(f"{len(out)} bosses, {sum(len(c['frames']) for c in out.values())} frames, atlases {total / 1e6:.2f} MB")
    for r in report:
        print(r['id'], r['name'], '|', '; '.join(r['notes']))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
