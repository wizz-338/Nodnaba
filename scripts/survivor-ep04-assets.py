#!/usr/bin/env python3
"""MANO SURVIVOR — the chapter 20 clear package (MANO_CH20_CUTSCENES).

    python3 -I scripts/survivor-ep04-assets.py <MANO_CH20_CUTSCENES folder>

Reads the five cutscene pictures of chapter 20's first clear (the originals
are not changed or copied) and writes, under src/survivor/assets/s84/ep04/
(so the story pictures' loader finds them):
  cutscenes/ep04_clear_0N.webp   the five cuts (16:9, whole, never enlarged)
  rewards/reward_turret.webp     the reward popup's picture of the turret,
                                 cut from the third cut
and src/survivor/data/ep04-assets.json: the pictures, in the same form as
story-assets.json (merged into it by data.js). The cuts are made the same
way as chapter 15's (survivor-ep03-assets.py).
"""
import hashlib
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'survivor', 'assets', 's84')
MAP = os.path.join(ROOT, 'src', 'survivor', 'data', 'ep04-assets.json')

CUTS = [
    ('ep04_clear_01', 'ep04_clear_01_cards.png', '카드 만지작'),
    ('ep04_clear_02', 'ep04_clear_02_combine.png', '카드 합치기'),
    ('ep04_clear_03', 'ep04_clear_03_turret.png', '포탑 등장'),
    ('ep04_clear_04', 'ep04_clear_04_fire.png', '포탑 발사'),
    ('ep04_clear_05', 'ep04_clear_05_departure.png', '다음 모험'),
]
# the reward picture: the turret on its stone (third cut, its own pixels)
REWARD = ('reward_turret', 'ep04_clear_03_turret.png', '포탑', (280, 250, 760, 730), (256, 256))
CUT_OUT = (1440, 810)  # as chapter 5's: smaller than the 1672 × 941 originals


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main(src):
    images = []
    os.makedirs(os.path.join(OUT, 'ep04', 'cutscenes'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'ep04', 'rewards'), exist_ok=True)
    for gid, name, title in CUTS:
        path = os.path.join(src, name)
        im = Image.open(path).convert('RGB')
        if abs(im.width / im.height - 16 / 9) > 0.01:
            print(f'note: {name}: {im.width}×{im.height} is not 16:9')
        f = f'ep04/cutscenes/{gid}.webp'
        im.resize(CUT_OUT, Image.LANCZOS).save(os.path.join(OUT, f), 'WEBP', quality=80, method=6)
        images.append({'source': name, 'width': im.width, 'height': im.height, 'sha256': sha(path), 'id': gid, 'kind': 'cutscene', 'region': 'desert', 'name': title, 'file': f, 'out': list(CUT_OUT), 'bytes': os.path.getsize(os.path.join(OUT, f))})
    rid, name, title, box, size = REWARD
    path = os.path.join(src, name)
    im = Image.open(path).convert('RGB').crop(box).resize(size, Image.LANCZOS)
    f = f'ep04/rewards/{rid}.webp'
    im.save(os.path.join(OUT, f), 'WEBP', quality=85, method=6)
    images.append({'source': name, 'width': box[2] - box[0], 'height': box[3] - box[1], 'sha256': sha(path), 'id': rid, 'kind': 'reward', 'region': None, 'body': list(box), 'name': title, 'file': f, 'out': list(size), 'bytes': os.path.getsize(os.path.join(OUT, f))})
    # (the turret's frames, made by survivor-turret-assets.py, stay)
    if os.path.exists(MAP):
        images += [x for x in json.load(open(MAP, encoding='utf-8'))['images'] if x['id'] == 'turret']
    data = {
        'note': 'MANO SURVIVOR chapter 20 clear package (MANO_CH20_CUTSCENES, built by scripts/survivor-ep04-assets.py; the turret\'s frames by scripts/survivor-turret-assets.py). images: the same form as story-assets.json (merged into it by data.js).',
        'package': 'MANO_CH20_CUTSCENES',
        'images': images,
    }
    json.dump(data, open(MAP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"{len(images)} pictures, {sum(x['bytes'] for x in images) / 1e6:.2f} MB")


if __name__ == '__main__':
    main(sys.argv[1])
