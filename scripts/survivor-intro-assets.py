#!/usr/bin/env python3
"""MANO SURVIVOR — the opening cutscene's pictures, wide (16:9).

    python3 -I scripts/survivor-intro-assets.py

The game's first four cuts (작은 숲: the ball out of the window, setting out,
the forest's friends, the forest's big one) were tall pictures (2:3). The
opening is played as soon as the game is first opened, as a wide (16:9)
cutscene like the episodes' clears (asked for): each picture is kept whole
in the middle, a little larger than the full height (its sides whole, a
little of its top and bottom off), and the sides are the same picture made
large, blurred and dimmed behind it (never stretched).

Reads src/survivor/assets/s84/cutscenes/cs_00_1, cs_00_2, cs_01_1, cs_01_2
.webp (the game's own copies) and writes cutscenes/intro_1 … intro_4.webp
(1440 × 810, as the episodes' clear cuts) and their entries in
src/survivor/data/story-assets.json (survivor-story-assets.py keeps them).
"""
import json
import os

from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'src', 'survivor', 'assets', 's84', 'cutscenes')
MAP = os.path.join(ROOT, 'src', 'survivor', 'data', 'story-assets.json')
OUT = (1440, 810)
CUTS = [('intro_1', 'cs_00_1'), ('intro_2', 'cs_00_2'), ('intro_3', 'cs_01_1'), ('intro_4', 'cs_01_2')]
FEATHER = 28  # px: the picture's sides fade into the blur behind it
ZOOM = 1.1


def wide(im):
    W, H = OUT
    # behind: the picture covering the whole frame, blurred and dimmed
    k = max(W / im.width, H / im.height)
    bg = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x = (bg.width - W) // 2
    y = (bg.height - H) // 3  # (a little above the middle: faces are high)
    bg = bg.crop((x, y, x + W, y + H)).filter(ImageFilter.GaussianBlur(22))
    bg = ImageEnhance.Brightness(bg).enhance(0.55)
    bg = ImageEnhance.Color(bg).enhance(0.85)
    # in front: the picture at a little over the full height (ZOOM: a few
    # per cent cut off its top and more off its bottom, never off its sides),
    # its sides feathered
    k = H * ZOOM / im.height
    fg = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    top = (fg.height - H) // 3
    fg = fg.crop((0, top, fg.width, top + H))
    mask = Image.new('L', fg.size, 255)
    px = mask.load()
    for i in range(FEATHER):
        a = round(255 * (i + 1) / (FEATHER + 1))
        for yy in range(fg.height):
            px[i, yy] = a
            px[fg.width - 1 - i, yy] = a
    out = bg.copy()
    out.paste(fg, ((W - fg.width) // 2, 0), mask)
    return out


def main():
    data = json.load(open(MAP, encoding='utf-8'))
    src = {x['id']: x for x in data['images']}
    entries = []
    for ident, base in CUTS:
        im = Image.open(os.path.join(DIR, base + '.webp')).convert('RGB')
        out = wide(im)
        f = f'cutscenes/{ident}.webp'
        path = os.path.join(ROOT, 'src', 'survivor', 'assets', 's84', f)
        out.save(path, 'WEBP', quality=82, method=6)
        s = src[base]
        entries.append({'id': ident, 'kind': 'cutscene', 'region': s['region'], 'name': s['name'], 'from': base, 'source': s['source'], 'sha256': s['sha256'], 'file': f, 'out': list(OUT), 'bytes': os.path.getsize(path), 'width': OUT[0], 'height': OUT[1]})
        print(path, os.path.getsize(path))
    data['images'] = [x for x in data['images'] if not x['id'].startswith('intro_')] + entries
    json.dump(data, open(MAP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
