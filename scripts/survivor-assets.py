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


def thumbnail():
    """The game's picture for the site (menu, news, artist page), put together
    from the delivered art: Mano in the middle, the three monsters, balls."""
    from PIL import ImageDraw
    O = os.path.join(SRC, 'originals') + '/'
    W = H = 480
    g = Image.open(O + '07-ground.png').convert('RGBA').resize((W, H), Image.LANCZOS)
    canvas = Image.blend(Image.new('RGBA', (W, H), (216, 204, 184, 255)), g, 0.75)
    idle = Image.open(O + '02-mano-idle.png').convert('RGBA')
    en = Image.open(O + '05-enemies.png').convert('RGBA')
    ic = Image.open(O + '06-icons-effects.png').convert('RGBA')

    def cell(img, c, r):
        return img.crop((c * 128, r * 128, c * 128 + 128, r * 128 + 128))

    def shadow(cx, cy, rx, ry, a=60):
        s = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(s).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=(38, 49, 62, a))
        canvas.alpha_composite(s)

    def put(img, cx, foot, scale, anchor=(64, 115.5), flip=False):
        im = img.resize((round(128 * scale), round(128 * scale)), Image.LANCZOS)
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        ax = (128 - anchor[0] if flip else anchor[0]) * scale
        canvas.alpha_composite(im, (round(cx - ax), round(foot - anchor[1] * scale)))

    shadow(110, 190, 40, 13)
    put(cell(en, 0, 3), 110, 190, 1.05, (64, 119))  # hunter, facing Mano
    shadow(392, 250, 34, 12)
    put(cell(en, 0, 0), 392, 250, 0.95, (64, 119), True)  # jaw, facing Mano
    shadow(380, 420, 62, 20)
    put(cell(en, 0, 6), 380, 420, 1.55, (64, 119), True)  # armor
    shadow(240, 400, 44, 14)
    put(cell(idle, 0, 0), 240, 400, 2.6)  # Mano facing the viewer
    ball = cell(ic, 0, 0).crop((35, 39, 106, 111))
    for x, y, s in [(300, 250, 30), (175, 268, 24), (330, 320, 20)]:
        shadow(x, y + 26, s * 0.45, s * 0.15, 45)
        canvas.alpha_composite(ball.resize((s, s), Image.LANCZOS), (x - s // 2, y - s // 2))
    canvas.alpha_composite(ic.crop((128, 512, 256, 640)).resize((70, 70), Image.LANCZOS), (330, 215))
    out = os.path.join(ROOT, 'src/assets/games/mano-survivor.webp')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    canvas.convert('RGB').save(out, quality=82)
    print('   site picture', out)


if __name__ == '__main__':
    main()
    thumbnail()
