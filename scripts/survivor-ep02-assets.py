#!/usr/bin/env python3
"""MANO SURVIVOR — the chapter 10 clear package (MANO_CH10_CUTSCENES).

    python3 -I scripts/survivor-ep02-assets.py <MANO_CH10_CUTSCENES folder>

Reads the five cutscene pictures of chapter 10's first clear (the originals
are not changed or copied) and writes, under src/survivor/assets/s84/ep02/
(so the story pictures' loader finds them):
  cutscenes/ep02_clear_0N.webp   the five cuts (16:9, whole, never enlarged)
and src/survivor/data/ep02-assets.json: the pictures, in the same form as
story-assets.json (merged into it by data.js). The cuts are made the same
way as chapter 5's (survivor-ep01-assets.py).
"""
import hashlib
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'survivor', 'assets', 's84')
MAP = os.path.join(ROOT, 'src', 'survivor', 'data', 'ep02-assets.json')

CUTS = [
    ('ep02_clear_01', 'ep02_clear_01_tizzzz_arrives.png', 'Tizzzz 등장'),
    ('ep02_clear_02', 'ep02_clear_02_headpat.png', '쓰다듬기'),
    ('ep02_clear_03', 'ep02_clear_03_rewrite.png', '선택지 수정'),
    ('ep02_clear_04', 'ep02_clear_04_ss_ball.png', 'SS급 탱탱볼'),
    ('ep02_clear_05', 'ep02_clear_05_departure.png', '다음 모험'),
]
CUT_OUT = (1440, 810)  # as chapter 5's: smaller than the 1672 × 941 originals


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main(src):
    images = []
    os.makedirs(os.path.join(OUT, 'ep02', 'cutscenes'), exist_ok=True)
    for gid, name, title in CUTS:
        path = os.path.join(src, name)
        im = Image.open(path).convert('RGB')
        if abs(im.width / im.height - 16 / 9) > 0.01:
            print(f'note: {name}: {im.width}×{im.height} is not 16:9')
        f = f'ep02/cutscenes/{gid}.webp'
        im.resize(CUT_OUT, Image.LANCZOS).save(os.path.join(OUT, f), 'WEBP', quality=80, method=6)
        images.append({'source': name, 'width': im.width, 'height': im.height, 'sha256': sha(path), 'id': gid, 'kind': 'cutscene', 'region': 'deepforest', 'name': title, 'file': f, 'out': list(CUT_OUT), 'bytes': os.path.getsize(os.path.join(OUT, f))})
    data = {
        'note': 'MANO SURVIVOR chapter 10 clear package (MANO_CH10_CUTSCENES, built by scripts/survivor-ep02-assets.py). images: the same form as story-assets.json (merged into it by data.js).',
        'package': 'MANO_CH10_CUTSCENES',
        'images': images,
    }
    json.dump(data, open(MAP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"{len(images)} cuts, {sum(x['bytes'] for x in images) / 1e6:.2f} MB")


if __name__ == '__main__':
    main(sys.argv[1])
