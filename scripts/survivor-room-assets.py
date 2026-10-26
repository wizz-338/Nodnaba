#!/usr/bin/env python3
"""MANO SURVIVOR — 마노의 방's pictures (room.js), from Astra's room package.

    python3 -I scripts/survivor-room-assets.py <rooms dir> <characters dir>

<rooms dir>: room_stage_01.png … room_stage_06.png (the six growth stages of
the room, 1672 × 940/941, backgrounds only). <characters dir>: mano.png,
danchu.png, hodu.png, moru.png (one still pose each, transparent). The
originals are not changed or copied. Writes src/survivor/assets/room/:
  stage_1.webp … stage_6.webp   the six rooms, all 1672 × 941
  mano_sit.webp                 Mano sitting with her ball (her skin made a
                                little lighter the way her sprite sheets are:
                                survivor-mano-skin.py)
  danchu_play.webp, hodu_belly.webp, moru_sleep.webp   the cats' poses
and their sizes and feet in src/survivor/data/room.json → art (the poses are
cut to what is drawn and kept at twice the size they show in the room, whose
own pixels are the room picture's: 1672 × 941).
"""
import hashlib
import importlib.util
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'survivor', 'assets', 'room')
DATA = os.path.join(ROOT, 'src', 'survivor', 'data', 'room.json')
SIZE = (1672, 941)
# each pose: its file, the picture's name, and how tall (or wide) it shows in
# the room (room pixels): Mano sits a little lower than she stands (about 180
# in the room); the cats about two thirds of her, as in the fight
POSES = [
    ('mano.png', 'mano_sit', ('h', 162)),
    ('danchu.png', 'danchu_play', ('h', 120)),
    ('hodu.png', 'hodu_belly', ('h', 110)),
    ('moru.png', 'moru_sleep', ('w', 158)),
]
KEEP = 2  # stored at twice its size in the room (sharp on a dense screen)


def skin():
    spec = importlib.util.spec_from_file_location('skin', os.path.join(ROOT, 'scripts', 'survivor-mano-skin.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def sha(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    rooms, chars = sys.argv[1], sys.argv[2]
    os.makedirs(OUT, exist_ok=True)
    art = {'size': list(SIZE), 'stages': [], 'poses': {}}
    for i in range(1, 7):
        src = os.path.join(rooms, f'room_stage_{i:02d}.png')
        im = Image.open(src).convert('RGB')
        if im.size != SIZE:
            im = im.resize(SIZE, Image.LANCZOS)  # (stage 1 is one row short)
        path = os.path.join(OUT, f'stage_{i}.webp')
        im.save(path, 'WEBP', quality=82, method=6)
        art['stages'].append({'file': f'room/stage_{i}.webp', 'source': os.path.basename(src), 'sha256': sha(src), 'bytes': os.path.getsize(path)})
        print(path, os.path.getsize(path))
    lighten = skin().lighten
    for fname, name, (side, n) in POSES:
        src = os.path.join(chars, fname)
        im = Image.open(src).convert('RGBA')
        if name == 'mano_sit':
            im, px = lighten(im)
            print(f'{fname}: {px} skin pixels lightened')
        im = im.crop(im.getbbox())
        k = n / (im.height if side == 'h' else im.width)
        w, h = round(im.width * k * KEEP), round(im.height * k * KEEP)
        im = im.resize((w, h), Image.LANCZOS)
        path = os.path.join(OUT, f'{name}.webp')
        im.save(path, 'WEBP', quality=90, method=6)
        # (its foot: the middle of its bottom, in the room's pixels)
        art['poses'][name] = {'file': f'room/{name}.webp', 'source': fname, 'sha256': sha(src), 'w': round(w / KEEP, 1), 'h': round(h / KEEP, 1), 'bytes': os.path.getsize(path)}
        print(path, (w, h), os.path.getsize(path))
    data = json.load(open(DATA, encoding='utf-8'))
    data['art'] = art
    with open(DATA, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


if __name__ == '__main__':
    main()
