#!/usr/bin/env python3
"""MANO SURVIVOR — the chapter 15 clear package (MANO_CH15_CUTSCENES).

    python3 -I scripts/survivor-ep03-assets.py <MANO_CH15_CUTSCENES folder>

Reads the five cutscene pictures of chapter 15's first clear (the originals
are not changed or copied) and writes, under src/survivor/assets/s84/ep03/
(so the story pictures' loader finds them):
  cutscenes/ep03_clear_0N.webp   the five cuts (16:9, whole, never enlarged)
  rewards/reward_zyo.webp        the reward popup's picture of zyo_'s class
                                 change: the two cards she joins, cut from
                                 the third cut
  rewards/zyo_face.webp          zyo_'s face for the lobby (first cut)
and src/survivor/data/ep03-assets.json: the pictures, in the same form as
story-assets.json (merged into it by data.js). The cuts are made the same
way as chapter 10's (survivor-ep02-assets.py).
"""
import hashlib
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'survivor', 'assets', 's84')
MAP = os.path.join(ROOT, 'src', 'survivor', 'data', 'ep03-assets.json')

CUTS = [
    ('ep03_clear_01', 'ep03_clear_01_zyo_arrives.png', 'zyo_ 등장'),
    ('ep03_clear_02', 'ep03_clear_02_examine_ball.png', '탱탱볼 살펴보기'),
    ('ep03_clear_03', 'ep03_clear_03_fusion.png', '강화 합성'),
    ('ep03_clear_04', 'ep03_clear_04_big_ball.png', '거대 탱탱볼'),
    ('ep03_clear_05', 'ep03_clear_05_departure.png', '다음 모험'),
]
# the reward picture: the two cards in zyo_'s hands (third cut, its own pixels)
REWARD = ('reward_zyo', 'ep03_clear_03_fusion.png', 'zyo_ 전직', (800, 400, 1180, 780), (256, 256))
FACE = ('zyo_face', 'ep03_clear_01_zyo_arrives.png', 'zyo_', (1100, 100, 1420, 420), (160, 160))
CUT_OUT = (1440, 810)  # as chapter 5's: smaller than the 1672 × 941 originals


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main(src):
    images = []
    os.makedirs(os.path.join(OUT, 'ep03', 'cutscenes'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'ep03', 'rewards'), exist_ok=True)
    for gid, name, title in CUTS:
        path = os.path.join(src, name)
        im = Image.open(path).convert('RGB')
        if abs(im.width / im.height - 16 / 9) > 0.01:
            print(f'note: {name}: {im.width}×{im.height} is not 16:9')
        f = f'ep03/cutscenes/{gid}.webp'
        im.resize(CUT_OUT, Image.LANCZOS).save(os.path.join(OUT, f), 'WEBP', quality=80, method=6)
        images.append({'source': name, 'width': im.width, 'height': im.height, 'sha256': sha(path), 'id': gid, 'kind': 'cutscene', 'region': 'skulltown', 'name': title, 'file': f, 'out': list(CUT_OUT), 'bytes': os.path.getsize(os.path.join(OUT, f))})
    rid, name, title, box, size = REWARD
    path = os.path.join(src, name)
    im = Image.open(path).convert('RGB').crop(box).resize(size, Image.LANCZOS)
    f = f'ep03/rewards/{rid}.webp'
    im.save(os.path.join(OUT, f), 'WEBP', quality=85, method=6)
    images.append({'source': name, 'width': box[2] - box[0], 'height': box[3] - box[1], 'sha256': sha(path), 'id': rid, 'kind': 'reward', 'region': None, 'body': list(box), 'name': title, 'file': f, 'out': list(size), 'bytes': os.path.getsize(os.path.join(OUT, f))})
    rid, name, title, box, size = FACE
    path = os.path.join(src, name)
    f = f'ep03/rewards/{rid}.webp'
    Image.open(path).convert('RGB').crop(box).resize(size, Image.LANCZOS).save(os.path.join(OUT, f), 'WEBP', quality=85, method=6)
    images.append({'id': rid, 'kind': 'portrait', 'region': 'skulltown', 'source': name, 'crop': list(box), 'name': title, 'file': f, 'out': list(size), 'bytes': os.path.getsize(os.path.join(OUT, f)), 'width': 1672, 'height': 941})
    data = {
        'note': 'MANO SURVIVOR chapter 15 clear package (MANO_CH15_CUTSCENES, built by scripts/survivor-ep03-assets.py). images: the same form as story-assets.json (merged into it by data.js).',
        'package': 'MANO_CH15_CUTSCENES',
        'images': images,
    }
    json.dump(data, open(MAP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"{len(images)} pictures, {sum(x['bytes'] for x in images) / 1e6:.2f} MB")


if __name__ == '__main__':
    main(sys.argv[1])
