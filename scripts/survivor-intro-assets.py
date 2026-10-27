#!/usr/bin/env python3
"""MANO SURVIVOR — the opening cutscene's pictures (16:9).

    python3 -I scripts/survivor-intro-assets.py <cut 1> <cut 2> <cut 3> <cut 4>

The opening, played as soon as the game is first opened (story.json → intro),
is four wide cuts, in the story's order: the ball flying out of the window
(indoors), setting out (outside the house, the bag on), the forest's little
ones, the forest's big one. The user's own wide (16:9) paintings of them
(asked for: the pictures themselves remade wide, not a tall one padded out);
the originals are not changed or copied.

Writes src/survivor/assets/s84/cutscenes/intro_1 … intro_4.webp (1440 × 810,
as the episodes' clear cuts: each picture made to cover it, never stretched,
the little left over cut evenly) and their entries in
src/survivor/data/story-assets.json (survivor-story-assets.py keeps them).
"""
import hashlib
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'src', 'survivor', 'assets', 's84')
MAP = os.path.join(ROOT, 'src', 'survivor', 'data', 'story-assets.json')
OUT = (1440, 810)
NAMES = ['창밖으로날아간공', '모험출발', '숲속친구들', '숲의괴물등장']
REGIONS = ['prologue', 'prologue', 'forest', 'forest']


def cover(im):
    W, H = OUT
    k = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x = (im.width - W) // 2
    y = (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))


def main():
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    data = json.load(open(MAP, encoding='utf-8'))
    entries = []
    for i, src in enumerate(sys.argv[1:], 1):
        im = Image.open(src).convert('RGB')
        if abs(im.width / im.height - 16 / 9) > 0.03:
            sys.exit(f'{src}: {im.width} × {im.height} is not 16:9')
        f = f'cutscenes/intro_{i}.webp'
        path = os.path.join(OUT_DIR, f)
        cover(im).save(path, 'WEBP', quality=82, method=6)
        with open(src, 'rb') as fh:
            digest = hashlib.sha256(fh.read()).hexdigest()
        entries.append({'id': f'intro_{i}', 'kind': 'cutscene', 'region': REGIONS[i - 1], 'name': NAMES[i - 1], 'source': os.path.basename(src), 'sha256': digest, 'file': f, 'out': list(OUT), 'bytes': os.path.getsize(path), 'width': im.width, 'height': im.height})
        print(path, os.path.getsize(path))
    data['images'] = [x for x in data['images'] if not x['id'].startswith('intro_')] + entries
    json.dump(data, open(MAP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
