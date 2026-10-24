#!/usr/bin/env python3
"""MANO SURVIVOR — the chapter 5 clear package (MANO_EP01).

    python3 -I scripts/survivor-ep01-assets.py <MANO_EP01_ALL folder> [review folder]

Reads the package's pictures (the originals are not changed or copied) and
writes, under src/survivor/assets/s84/ep01/ (so the story pictures' loader
finds them):
  cutscenes/ep01_clear_0N.webp   the five cuts of chapter 5's first clear (16:9, whole)
  rewards/reward_*.webp          the three rewards of that clear (its box cut out)
  skills/skill_cat_*.webp        the five cat upgrade icons
  fx/fx_cat_slash*.webp          the scratch effects
  friend_cat.webp                the friend cat's atlas (idle, move, attack, recover)
and src/survivor/data/ep01-assets.json: the pictures (same form as
story-assets.json, merged into it by data.js) and the friend cat's frames.

The friend cat's sheets (cat_units/friend_*_sheet.png) are 4 poses across and
3 rows down, one row per way it faces (south-east, east, north-east; the
other three are these mirrored). The cells are not exact, so a frame is an
opaque shape (8-connected alpha) placed in the row and column its middle
falls in; each sheet must give exactly 12 shapes (anything else is reported
and stops the build). Pivot: across, the middle of the body's lower part
(its legs, so a paw reaching out never moves the cat); down, its feet. One
scale for every frame of every sheet (never a fit frame by frame).

friend_size_reference.png (three round bodies) and
collectors_design_reference.png (단추·호두·모루) are references only: 뚱냥이 draws
the same frames larger, and the three collectors keep their sprites.

The friend cats wear no scarf (the red scarf is 단추·호두·모루's): the red of
the scarf (and the gold bell hanging from it) is taken off every frame
before cutting. Where it lay across the body the fur is painted back in from
the fur around it (inpainting, colour from opaque fur only); where it stuck
out past the body (the knot's tails) it becomes see-through. The body's
outline there is found by closing the rest of the body (a 71 px disc).
Then every frame is redrawn as pixel art in the collector cats' style
(assets/cats/cats.png: flat cel colours, a thick near-black outline, dark
dot eyes), at their pixel size (CAT_H: an idle pose is as many pixels tall
as a collector cat drawn at cats.scale would be at friendCats.drawH):
  - shrunk by area to that size (one scale for every frame);
  - each pixel takes the nearest colour of a small cream palette (PALETTE,
    by Lab distance); pink only where the picture was light pink (ears,
    nose, paw pads);
  - the painting's dark lines stay as ink; the amber eyes (and the darkest
    parts of the upper half) become bold dark dots;
  - a 2 px ink outline: the silhouette's edge pixel and one pixel outside.
The game draws them as it draws the collector cats (render.js).
"""
import hashlib
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'survivor', 'assets', 's84', 'ep01')
MAP = os.path.join(ROOT, 'src', 'survivor', 'data', 'ep01-assets.json')

CUTS = [
    ('ep01_clear_01', 'episode_01_cutscenes/ep01_clear_01_reunion.png', '마노와 세 고양이의 재회'),
    ('ep01_clear_02', 'episode_01_cutscenes/ep01_clear_02_followed.png', '숲속에서 만난 마노와 세 고양이'),
    ('ep01_clear_03', 'episode_01_cutscenes/ep01_clear_03_ball.png', '모루가 건넨 빨간 공'),
    ('ep01_clear_04', 'episode_01_cutscenes/ep01_clear_04_received.png', '마노와 세 고양이의 빨간 공 축제'),
    ('ep01_clear_05', 'episode_01_cutscenes/ep01_clear_05_departure.png', '마노와 세 고양이의 숲길 모험'),
]
CUT_OUT = (1440, 810)
PICS = [
    ('reward_cats', 'rewards/reward_cats.png', 'reward', '행복한 고양이 삼총사', 256),
    ('reward_s_ball', 'rewards/reward_s_ball.png', 'reward', '금빛 월계관의 붉은 바운싱 볼', 256),
    ('reward_reroll', 'rewards/reward_reroll.png', 'reward', '청록 리롤 화살표와 세 장의 카드', 256),
    ('skill_cat_summon', 'cat_skills/skill_cat_summon.png', 'icon', '세 마리 고양이 소환', 128),
    ('skill_cat_size', 'cat_skills/skill_cat_size.png', 'icon', '통통 고양이 몸집 키우기', 128),
    ('skill_cat_speed', 'cat_skills/skill_cat_speed.png', 'icon', '질주하는 크림빛 아기 고양이', 128),
    ('skill_cat_attack_rate', 'cat_skills/skill_cat_attack_rate.png', 'icon', '고양이 발톱 두 번 할퀴기', 128),
    ('skill_cat_damage', 'cat_skills/skill_cat_damage.png', 'icon', '크림 고양이 발톱 강타', 128),
    ('fx_cat_slash', 'effects/fx_cat_slash.png', 'fx', '할퀴기', 192),
    ('fx_cat_slash_power', 'effects/fx_cat_slash_power.png', 'fx', '강한 할퀴기', 192),
]
SHEETS = ['idle', 'move', 'attack', 'recover']
FACES = ['se', 'e', 'ne']
ALPHA = 24
DEBRIS = 400
CAT_H = 67  # an idle pose's height in pixels (24 field px ÷ the collectors' 0.36)
PAD = 2  # atlas px between frames
INK = np.array([19, 2, 13])  # the collector cats' outline
# cream fur: highlight, base, shade, tan, tan shade; pink, light pink
PALETTE = np.array([[252, 241, 228], [248, 229, 210], [233, 203, 182], [238, 196, 150], [216, 160, 112], [246, 128, 125], [250, 182, 176]], np.float32)
DURATIONS = {'idle': 170, 'move': 75, 'attack': 70, 'recover': 80}


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def body(im):
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.nonzero(a > ALPHA)
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def hsv(a):
    a = a.astype(np.float32)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    mx = np.maximum(np.maximum(R, G), B)
    mn = np.minimum(np.minimum(R, G), B)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == R, ((G - B) / d) % 6, np.where(mx == G, (B - R) / d + 2, (R - G) / d + 4)) * 60
    return h, (mx - mn) / np.maximum(mx, 1), mx / 255


def without_scarf(arr):
    """the sheet with the red scarf and its bell taken off (see the top)"""
    A = arr[..., 3]
    h, s, v = hsv(arr)
    # the scarf: strong pure red in large pieces (not the pink ears, the
    # mouths or the amber eyes)
    red = (A > ALPHA) & (arr[..., 0] >= arr[..., 1]) & (arr[..., 0] >= arr[..., 2]) & ((h < 14) | (h > 340)) & (s > 0.55) & (v > 0.31)
    lab, n = ndimage.label(red, structure=np.ones((3, 3), bool))
    sizes = ndimage.sum(red, lab, range(1, n + 1))
    scarf = np.isin(lab, [i + 1 for i, z in enumerate(sizes) if z >= 150])
    # the bell: gold touching the scarf, or yellow gold a little further (under a paw)
    bell = np.zeros_like(scarf)
    for reach, (h0, h1, s0, v0) in ((18, (25, 62, 0.45, 0.35)), (45, (38, 62, 0.5, 0.45))):
        near = ndimage.binary_dilation(scarf, iterations=reach)
        gold = (A > ALPHA) & (h > h0) & (h < h1) & (s > s0) & (v > v0)
        gl, _ = ndimage.label(gold, structure=np.ones((3, 3), bool))
        t = np.unique(gl[near & gold])
        bell |= np.isin(gl, t[t > 0])
    bell = ndimage.binary_dilation(ndimage.binary_fill_holes(ndimage.binary_closing(bell, iterations=4)), iterations=3)
    wide = ndimage.binary_dilation(scarf, iterations=25)
    mask = ndimage.binary_dilation(scarf | bell | (red & wide), iterations=4)
    body = ((A > ALPHA) & ~mask).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (71, 71))
    big = cv2.copyMakeBorder(body, 40, 40, 40, 40, cv2.BORDER_CONSTANT, value=0)
    filled = cv2.morphologyEx(big, cv2.MORPH_CLOSE, k)[40:-40, 40:-40].astype(bool) | ndimage.binary_fill_holes(body)
    hole = mask | ((A <= ALPHA) & ndimage.binary_dilation(mask, iterations=24))
    rgb = cv2.inpaint(np.ascontiguousarray(arr[..., :3]), (hole * 255).astype(np.uint8), 9, cv2.INPAINT_TELEA)
    out = arr.copy()
    out[..., :3] = np.where(mask[..., None], rgb, arr[..., :3])
    out[..., 3] = np.where(mask, np.where(filled, 255, 0), A)
    return out, int(scarf.sum()), int(bell.sum())


def frames_of(path):
    """the sheet's 12 shapes (scarf off), [row][col] → (box, mask)"""
    sheet = Image.open(path).convert('RGBA')
    arr, scarf_px, bell_px = without_scarf(np.asarray(sheet))
    print(f'{os.path.basename(path)}: scarf {scarf_px} px, bell {bell_px} px taken off')
    a = arr[:, :, 3]
    H, W = a.shape
    lab, n = ndimage.label(a > ALPHA, structure=np.ones((3, 3), bool))
    sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
    objs = ndimage.find_objects(lab)
    cells = {}
    dust = 0
    for i in range(n):
        if sizes[i] < DEBRIS:
            dust += 1
            continue
        ys, xs = objs[i]
        cy = (ys.start + ys.stop) / 2
        cx = (xs.start + xs.stop) / 2
        key = (int(cy * 3 // H), int(cx * 4 // W))
        if key in cells:
            raise SystemExit(f'{path}: two shapes in row {key[0]} column {key[1]}')
        cells[key] = i + 1
    if len(cells) != 12:
        raise SystemExit(f'{path}: {len(cells)} shapes, not 12')
    out = []
    for r in range(3):
        row = []
        for c in range(4):
            k = cells[(r, c)]
            ys, xs = objs[k - 1]
            mask = lab[ys, xs] == k
            img = np.zeros((ys.stop - ys.start, xs.stop - xs.start, 4), np.uint8)
            img[mask] = arr[ys, xs][mask]
            row.append(img)
        out.append(row)
    return out, dust


def lab(c):
    return cv2.cvtColor(np.clip(c, 0, 255).astype(np.uint8).reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)


PALETTE_LAB = lab(PALETTE)
CROSS = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], np.uint8)


def pixel_art(img, k):
    """one painted frame as pixel art in the collector cats' style (see the top)"""
    h, w = img.shape[:2]
    a = img[..., 3].astype(np.float32) / 255
    hh, ss, vv = hsv(img)
    op = img[..., 3] > ALPHA
    upper = (np.arange(h) < h * 0.55)[:, None]
    eye = op & upper & ((((hh > 12) & (hh < 45)) & (ss > 0.6) & (vv < 0.82)) | (vv < 0.3))
    ink = op & (vv < 0.55) & (ss > 0.3)
    pink = op & ((hh > 330) | (hh < 14)) & (ss > 0.18) & (ss < 0.62) & (vv > 0.72)
    W, H = max(1, round(w * k)), max(1, round(h * k))

    def down(x):
        return cv2.resize(x.astype(np.float32), (W, H), interpolation=cv2.INTER_AREA)

    A = down(a)
    rgb = down(img[..., :3].astype(np.float32) * a[..., None]) / np.maximum(A[..., None], 1e-4)
    m = A > 0.5
    d = ((lab(rgb.reshape(-1, 3))[:, None, :] - PALETTE_LAB[None]) ** 2).sum(-1)
    d[down(pink).reshape(-1) < 0.3, 5:7] = 1e9
    col = PALETTE[d.argmin(1)].reshape(H, W, 3)
    col[down(ink) > 0.34] = INK
    dots = cv2.dilate((down(eye) > 0.3).astype(np.uint8), CROSS).astype(bool) & m
    col[dots] = INK
    # the outline, 2 px: the edge of the shape and a pixel round it
    p = 2
    M = np.zeros((H + 2 * p, W + 2 * p), bool)
    M[p:-p, p:-p] = m
    ring = cv2.dilate(M.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & ~M
    edge = M & ~cv2.erode(M.astype(np.uint8), CROSS).astype(bool)
    out = np.zeros((H + 2 * p, W + 2 * p, 4), np.uint8)
    out[p:-p, p:-p, :3] = col.astype(np.uint8)
    out[ring | edge, :3] = INK
    out[M | ring, 3] = 255
    return out


def pivot(img):
    """across: the middle of the lower 35% (the legs); down: the feet"""
    a = img[:, :, 3] > ALPHA
    ys, xs = np.nonzero(a)
    y1 = ys.max() + 1
    low = ys >= y1 - (y1 - ys.min()) * 0.35
    return float(np.median(xs[low])), float(y1)


def main(src, review=None):
    os.makedirs(OUT, exist_ok=True)
    images = []
    notes = []
    for gid, rel, name in CUTS:
        path = os.path.join(src, rel)
        im = Image.open(path).convert('RGB')
        if abs(im.width / im.height - 16 / 9) > 0.01:
            notes.append(f'{rel}: {im.width}×{im.height} is not 16:9')
        out = im.resize(CUT_OUT, Image.LANCZOS)
        f = f'ep01/cutscenes/{gid}.webp'
        os.makedirs(os.path.dirname(os.path.join(OUT, '..', f)), exist_ok=True)
        out.save(os.path.join(OUT, '..', f), 'WEBP', quality=80, method=6)
        images.append({'source': rel, 'width': im.width, 'height': im.height, 'sha256': sha(path), 'id': gid, 'kind': 'cutscene', 'region': 'forest', 'name': name, 'file': f, 'out': list(CUT_OUT), 'bytes': os.path.getsize(os.path.join(OUT, '..', f))})
    for gid, rel, kind, name, size in PICS:
        path = os.path.join(src, rel)
        im = Image.open(path).convert('RGBA')
        if np.asarray(im)[:, :, 3].min() > 0:
            notes.append(f'{rel}: no transparent background')
        b = body(im)
        crop = im.crop(b)
        k = size / max(crop.size)
        out = crop.resize((max(1, round(crop.width * k)), max(1, round(crop.height * k))), Image.LANCZOS)
        sub = {'reward': 'rewards', 'icon': 'skills', 'fx': 'fx'}[kind]
        f = f'ep01/{sub}/{gid}.webp'
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)
        out.save(os.path.join(OUT, '..', f), 'WEBP', quality=88, method=6)
        images.append({'source': rel, 'width': im.width, 'height': im.height, 'sha256': sha(path), 'id': gid, 'kind': kind, 'region': None, 'name': name, 'body': b, 'file': f, 'out': list(out.size), 'bytes': os.path.getsize(os.path.join(OUT, '..', f))})

    # the friend cat: every sheet's shapes, one scale (from the idle poses)
    shapes = {}
    for s in SHEETS:
        path = os.path.join(src, 'cat_units', f'friend_{s}_sheet.png')
        shapes[s], dust = frames_of(path)
        if dust:
            notes.append(f'friend_{s}_sheet.png: {dust} specks of dust left out')
    idle_h = np.median([img.shape[0] for row in shapes['idle'] for img in row])
    k = CAT_H / idle_h
    cells = {}
    for s in SHEETS:
        for r, face in enumerate(FACES):
            for c, img in enumerate(shapes[s][r]):
                px, py = pivot(img)
                pa = pixel_art(img, k)
                # (the pixel frame has 2 px of outline round the shape)
                cells[(s, face, c)] = (Image.fromarray(pa, 'RGBA'), px * k + 2, py * k + 2)
    # the atlas: one strip per (sheet, face)
    pad = PAD
    rows = [(s, f) for s in SHEETS for f in FACES]
    aw = max(sum(cells[(s, f, c)][0].width + pad for c in range(4)) for s, f in rows) + pad
    ah = sum(max(cells[(s, f, c)][0].height for c in range(4)) + pad for s, f in rows) + pad
    atlas = Image.new('RGBA', (aw, ah), (0, 0, 0, 0))
    anims = {}
    yy = pad
    for s, f in rows:
        xx = pad
        lst = []
        for c in range(4):
            im, px, py = cells[(s, f, c)]
            atlas.paste(im, (xx, yy))
            lst.append([xx, yy, im.width, im.height, round(px, 2), round(py, 2)])
            xx += im.width + pad
        anims.setdefault(s, {})[f] = lst
        yy += max(cells[(s, f, c)][0].height for c in range(4)) + pad
    atlas_file = 'ep01/friend_cat.webp'
    atlas.save(os.path.join(OUT, '..', atlas_file), 'WEBP', lossless=True, method=6)
    images.append({'source': 'cat_units/friend_*_sheet.png', 'id': 'friend_cat', 'kind': 'atlas', 'region': None, 'name': '친구냥이', 'file': atlas_file, 'out': [aw, ah], 'bytes': os.path.getsize(os.path.join(OUT, '..', atlas_file))})

    data = {
        'note': 'MANO SURVIVOR chapter 5 clear package (MANO_EP01, built by scripts/survivor-ep01-assets.py). images: the same form as story-assets.json (merged into it by data.js). friendCat: the friend cat atlas (file; pixel art in the collector cats\' style, no scarf, see the script), frames [x, y, w, h, pivotX, pivotY] in atlas px per animation and facing (se, e, ne; the west-facing ones are these mirrored), idleH: an idle pose\'s height in atlas px (the one scale; drawn at friendCats.drawH), ms: each frame\'s time.',
        'package': 'MANO_EP01',
        'images': images,
        'friendCat': {'file': atlas_file, 'idleH': CAT_H, 'pixel': True, 'ms': DURATIONS, 'faces': FACES, 'animations': anims},
    }
    json.dump(data, open(MAP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    total = sum(x['bytes'] for x in images)
    print(f'{len(images)} pictures, {total / 1e6:.2f} MB; friend cat atlas {aw}×{ah}')
    for n in notes:
        print('note:', n)
    if review:
        os.makedirs(review, exist_ok=True)
        # every pose on one baseline (green), the pivot marked, 1:1
        cw, ch = 100, 100
        sh = Image.new('RGBA', (cw * 4 * len(SHEETS), ch * 3), (62, 64, 74, 255))
        from PIL import ImageDraw
        d = ImageDraw.Draw(sh)
        for si, s in enumerate(SHEETS):
            for r, f in enumerate(FACES):
                for c in range(4):
                    im, px, py = cells[(s, f, c)]
                    ox = (si * 4 + c) * cw
                    oy = r * ch
                    sh.alpha_composite(im, (int(ox + cw / 2 - px), int(oy + ch - 12 - py)))
                    d.line([(ox, oy + ch - 12), (ox + cw, oy + ch - 12)], fill=(80, 255, 80, 255))
                    d.line([(ox + cw / 2, oy + ch - 20), (ox + cw / 2, oy + ch - 4)], fill=(255, 80, 80, 255))
                    d.text((ox + 4, oy + 4), f'{s} {f} {c}', fill=(255, 255, 0, 255))
        sh.convert('RGB').save(os.path.join(review, 'friend_cat.png'))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
