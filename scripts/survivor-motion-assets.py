#!/usr/bin/env python3
"""MANO SURVIVOR — game frames from the motion package (MANO_ANIMATION).

    python3 -I scripts/survivor-motion-assets.py <MANO_ANIMATION folder> [review folder]

Reads animation_manifest.json and the sheets it names (never anything else;
the originals are not changed or copied), and writes:
  src/survivor/assets/motion/<id>.webp   one runtime atlas per character
  src/survivor/data/motion.json          its frames, pivots, animations

The manifest's rects are a first cut (the sheets are not an even grid, and
neighbouring poses come close). So a frame is not its rect cut out: the
sheet's opaque shapes (8-connected alpha) each go to the frame whose rect
holds most of them, and a frame is its own shapes only (a neighbour's wing or
foot inside its rect is masked away). A shape that reaches into two frames'
rects with a real share in each is a pose drawn touching its neighbour: it
is split along the rects and reported (the picture needs redrawing there).

Pivots: across, the middle of the frame's body (the median of its pixels);
down, walkers stand on their feet (the body's bottom) and flyers keep their
body's centre (the median of its pixels), so flapping wings never move it. One scale per
character for every frame (refLong: the long side of its first move pose):
frames are never fitted one by one.
"""
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'survivor', 'assets', 'motion')
MAP = os.path.join(ROOT, 'src', 'survivor', 'data', 'motion.json')

# the package's names → the game's monster ids (as in survivor-story-assets.py)
IDS = {
    '새싹요정': 'sprout', '잎사귀토끼': 'leafbunny', '빨간버섯': 'redcap', '이끼골렘': 'mossgolem', '꽃뿔수호자': 'flowerguard',
    '나무가면인형': 'maskdoll', '버섯멧돼지': 'mushboar', '버섯망령': 'mushwraith', '등불고목': 'lanterntree', '타락한고목군주': 'treelord',
    '해골병사': 'skeleton', '뼈슬라임': 'boneslime', '왕관해골사냥개': 'crownhound', '거대해골야수': 'skullbeast', '해골왕': 'skullking',
    '사막전갈': 'scorpion', '모래정령': 'sandspirit', '모래지렁이': 'sandworm', '수정바위수호자': 'crystalguard', '피닉스': 'phoenix',
    '얼음늑대': 'icewolf', '눈정령': 'snowspirit', '빙결곰': 'frostbear', '얼음골렘': 'icegolem', '설원수호자': 'snowguardian',
    '그리핀': 'griffin', '구름정령': 'cloudspirit', '구름용': 'clouddragon', '천공골렘': 'skygolem', '천둥정령': 'thunderspirit',
    '해골망령': 'skullwraith', '공허의눈': 'voideye', '그림자용': 'shadowdragon', '공허골렘': 'voidgolem', '마왕': 'demonking',
}
# who flies (pivot: the body's centre; drawn above its shadow)
FLYERS = {'mushwraith', 'phoenix', 'snowspirit', 'snowguardian', 'griffin', 'cloudspirit', 'clouddragon', 'thunderspirit', 'skullwraith', 'voideye', 'shadowdragon', 'sandspirit'}
ALPHA = 24          # opaque enough to be part of the picture
DEBRIS = 40         # shapes smaller than this (px) are dust and dropped
SHARE = 0.12        # a shape with this much of itself in a second rect touches that pose
ATLAS_LONG = {'enemy': 168, 'npc': 200, 'boss': 256}  # a character's first move pose, long side, in atlas px


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def inside(rect, x0, y0, x1, y1):
    """how much of the box [x0,x1)×[y0,y1) lies in rect (area)"""
    rx, ry, rw, rh = rect
    w = max(0, min(x1, rx + rw) - max(x0, rx))
    h = max(0, min(y1, ry + rh) - max(y0, ry))
    return w * h


def cut(sheet, frames):
    """each frame's own pixels: (crop box, mask) per frame, and what was found"""
    a = np.asarray(sheet)[:, :, 3]
    lab, n = ndimage.label(a > ALPHA, structure=np.ones((3, 3), bool))
    owner = np.zeros(n + 1, int) - 1  # component → frame
    notes = []
    splits = []
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
    for c in range(1, n + 1):
        sl = objs[c - 1]
        size = sizes[c - 1]
        if size < DEBRIS:
            continue
        ys, xs = np.nonzero(lab[sl] == c)
        ys = ys + sl[0].start
        xs = xs + sl[1].start
        # pixels of this shape in each frame's rect
        counts = []
        for f in frames:
            rx, ry, rw, rh = f['rect']
            counts.append(int(((xs >= rx) & (xs < rx + rw) & (ys >= ry) & (ys < ry + rh)).sum()))
        tot = len(xs)
        order = sorted(range(len(frames)), key=lambda i: -counts[i])
        best = order[0]
        if counts[best] == 0:
            # outside every rect: to the nearest rect's frame if close, else dropped
            cx, cy = xs.mean(), ys.mean()
            d = [((cx - (f['rect'][0] + f['rect'][2] / 2)) ** 2 + (cy - (f['rect'][1] + f['rect'][3] / 2)) ** 2) ** 0.5 for f in frames]
            best = int(np.argmin(d))
            if d[best] > max(frames[best]['rect'][2], frames[best]['rect'][3]) * 0.75:
                notes.append(f'dropped a stray shape of {tot}px at ({int(cx)},{int(cy)})')
                continue
        second = order[1] if len(order) > 1 else None
        if second is not None and counts[second] > SHARE * tot and counts[best] > SHARE * tot:
            splits.append((c, best, second, counts[best] / tot, counts[second] / tot))
        owner[c] = best
    masks = []
    for i, f in enumerate(frames):
        mine = np.isin(lab, np.nonzero(owner == i)[0])
        masks.append(mine)
    # a shape that touches two poses: split it along the two rects (each
    # pixel to the rect it lies in; the overlap of the rects to the nearer centre)
    for c, i, j, si, sj in splits:
        comp = lab == c
        ys, xs = np.nonzero(comp)
        ri, rj = frames[i]['rect'], frames[j]['rect']
        ci = (ri[0] + ri[2] / 2, ri[1] + ri[3] / 2)
        cj = (rj[0] + rj[2] / 2, rj[1] + rj[3] / 2)
        toj = ((xs - cj[0]) ** 2 + (ys - cj[1]) ** 2) < ((xs - ci[0]) ** 2 + (ys - ci[1]) ** 2)
        masks[i][ys[toj], xs[toj]] = False
        masks[j][ys[toj], xs[toj]] = True
        notes.append(f'frames {i} and {j} are drawn touching ({si:.0%} / {sj:.0%} of one shape): split along their rects')
    return masks, notes, [(i, j) for _, i, j, _, _ in splits]


def main(src, review=None):
    man = json.load(open(os.path.join(src, 'animation_manifest.json'), encoding='utf-8'))
    os.makedirs(OUT, exist_ok=True)
    out = {}
    report = []
    for a in man['assets']:
        gid = IDS[a['name']]
        path = os.path.join(src, a['file'])
        sheet = Image.open(path).convert('RGBA')
        frames = a['frames']
        masks, notes, touching = cut(sheet, frames)
        arr = np.asarray(sheet)
        fly = gid in FLYERS
        info = []
        for i, m in enumerate(masks):
            ys, xs = np.nonzero(m)
            if not len(xs):
                info.append(None)
                notes.append(f'frame {i} is empty after cutting')
                continue
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            # its body: the largest shape of the frame (not dust, not an effect)
            lab, n = ndimage.label(m, structure=np.ones((3, 3), bool))
            sizes = ndimage.sum(m, lab, index=np.arange(1, n + 1))
            body = lab == (int(np.argmax(sizes)) + 1)
            by, bx = np.nonzero(body)
            # across: the body's middle (the median of its pixels: a foot
            # stepping forward or a raised fist does not move it much)
            px = float(np.median(bx))
            py = float(np.median(by)) if fly else float(by.max() + 1)
            info.append({'box': [int(x0), int(y0), int(x1 - x0), int(y1 - y0)], 'pivot': [px, py], 'bodyH': int(by.max() - by.min() + 1), 'bodyW': int(bx.max() - bx.min() + 1)})
        move0 = info[a['animations']['move']['frames'][0]]
        ref_long = max(move0['bodyW'], move0['bodyH'])
        k = ATLAS_LONG[a['role']] / ref_long  # one scale for every frame of this character
        # pack: one row per animation
        cells = []
        for i, f in enumerate(info):
            x, y, w, h = f['box']
            img = np.zeros((h, w, 4), np.uint8)
            sub = arr[y:y + h, x:x + w]
            mm = masks[i][y:y + h, x:x + w]
            img[mm] = sub[mm]
            im = Image.fromarray(img, 'RGBA')
            W, H = max(1, round(w * k)), max(1, round(h * k))
            im = im.resize((W, H), Image.LANCZOS)
            cells.append((im, (f['pivot'][0] - x) * k, (f['pivot'][1] - y) * k))
        rows = []
        for name, an in a['animations'].items():
            rows.append(an['frames'])
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
        atlas.save(os.path.join(OUT, fname), 'WEBP', quality=88, method=6)
        out[gid] = {
            'name': a['name'],
            'role': a['role'],
            'bossChapter': a['bossChapter'],
            'fly': fly,
            'file': 'motion/' + fname,
            'refLong': round(ref_long * k, 2),
            'frames': fr,
            'durations': [f['durationMs'] for f in frames],
            'animations': {k2: {'frames': v['frames'], 'loop': v['loop']} for k2, v in a['animations'].items()},
            'source': a['file'],
            'sha256': sha(path),
        }
        if notes:
            report.append({'id': gid, 'name': a['name'], 'file': a['file'], 'notes': notes, 'touching': touching})
        if review:
            # the frames side by side at the game's one scale, feet (or body
            # centre) on one line: a jump or a size change shows at once
            S = 0.6
            cw = int(max(c[0].width for c in cells) * S) + 20
            ch = int(max(c[0].height for c in cells) * S) + 40
            base = int(max(c[2] for c in cells) * S) + 20
            sheet2 = Image.new('RGBA', (cw * len(cells), ch + 30), (62, 64, 74, 255))
            for i, (im, px, py) in enumerate(cells):
                im2 = im.resize((max(1, int(im.width * S)), max(1, int(im.height * S))))
                sheet2.alpha_composite(im2, (int(i * cw + cw / 2 - px * S), int(base - py * S)))
            from PIL import ImageDraw
            d = ImageDraw.Draw(sheet2)
            d.line([(0, base), (sheet2.width, base)], fill=(80, 255, 80, 255), width=1)
            for i in range(len(cells)):
                d.text((i * cw + 4, ch + 8), str(i), fill=(255, 255, 0, 255))
            sheet2.convert('RGB').save(os.path.join(review, gid + '.png'))
    data = {
        'note': 'MANO SURVIVOR motion (MANO_ANIMATION, built by scripts/survivor-motion-assets.py). Per character: file (assets/motion), frames [x, y, w, h, pivotX, pivotY] in atlas px, refLong (its first move pose, long side, atlas px: the one scale for all its frames), durations (ms per frame), animations (move / attack / death), fly (pivot is the body centre).',
        'package': 'MANO_ANIMATION',
        'characters': out,
    }
    json.dump(data, open(MAP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if review:
        json.dump(report, open(os.path.join(review, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    total = sum(os.path.getsize(os.path.join(OUT, c['file'].split('/')[1])) for c in out.values())
    print(f"{len(out)} characters, {sum(len(c['frames']) for c in out.values())} frames, atlases {total / 1e6:.2f} MB")
    for r in report:
        print(r['id'], r['name'], '|', '; '.join(r['notes']))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
