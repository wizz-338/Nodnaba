"""Build MANO SURVIVOR game images from the delivered sheets.

    python3 scripts/survivor-assets.py

Reads the untouched uploads in assets-src/survivor/originals/ and the crop
table assets-src/survivor/crops.json (copied from the delivery note), writes
src/survivor/assets/. Crops are [left, top, right, bottom] in source pixels,
right/bottom excluded; nothing is resized, trimmed or re-coloured, so cells,
margins, transparency and foot anchors stay exactly as delivered.

The one exception is the ground: the opaque 1254 x 1254 PNG (1.5 MB) is also
written as a JPEG for the page (it has no transparency to keep); the PNG copy
stays in originals/ unchanged.
"""
import json
import os

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets-src/survivor')
OUT = os.path.join(ROOT, 'src/survivor')
UPLOADS = {
    '01-mano-walk.png': '01-mano-walk.png',
    '02-mano-idle.png': '02-mano-idle.png',
    '03-mano-hit.png': '03-mano-hit.png',
    '04-mano-down.png': '04-mano-down.png',
    '05-enemies.png': '05-enemies.png',
    '06-icons-effects.png': '06-icons-effects.png',
    '07-ground.png': '07-ground.png',
}


def main():
    crops = json.load(open(os.path.join(SRC, 'crops.json'), encoding='utf-8'))
    for c in crops:
        src = Image.open(os.path.join(SRC, 'originals', UPLOADS[c['upload']]))
        out = os.path.join(OUT, c['output'])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if 'crop' in c:
            img = src.crop(tuple(c['crop']))
        else:
            img = src.copy()
        if c['output'].endswith('ground.png'):
            img.convert('RGB').save(out[:-4] + '.jpg', quality=86, optimize=True, progressive=True)
            print('  ', c['output'][:-4] + '.jpg', img.size)
            continue
        img.save(out, optimize=True)
        print('  ', c['output'], img.size)


if __name__ == '__main__':
    main()
