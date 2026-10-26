#!/usr/bin/env python3
"""MANO SURVIVOR — Mano's skin a little lighter, in her own pictures.

    python3 -I scripts/survivor-mano-skin.py

Lightens the skin (face and hands) of Mano's sprite sheets in place:
src/survivor/assets/v3/01_mano_run.png, 02_mano_states.png, 08_profile.png.
Only her skin changes: no filter over the screen, and nothing else of the
sheets (her hood, hair, eyes, the cream of the costume, the cats are other
sheets) is touched. The room's own picture of her (survivor-room-assets.py)
goes through the same `lighten`, so she is one colour everywhere.

How: a pixel is skin when its hue is 15–34°, saturation 0.27–0.58 and value
at least 0.88 (her skin, never the costume's paler cream nor her hair), and
the skin's own shading next to it (within 2 px: hue 5–40°, value from 0.55,
saturation up to 0.7) goes with it so its light and shade keep their step.
Those pixels get LIFT more lightness (CIE L*, of 100) and keep their colour
(a* b* × CHROMA, a hair less), so the skin is lighter and softer, never
white or washed out.

The sheets' checksums before and after are kept in
src/survivor/data/mano-skin.json; a sheet already lightened is left alone,
so running this twice changes nothing.
"""
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEETS = ['01_mano_run.png', '02_mano_states.png', '08_profile.png']
SHEET_DIR = os.path.join(ROOT, 'src', 'survivor', 'assets', 'v3')
RECORD = os.path.join(ROOT, 'src', 'survivor', 'data', 'mano-skin.json')
LIFT = 9.0
CHROMA = 0.88


def _hsv(rgb):
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    d = np.maximum(mx - mn, 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def skin_mask(rgba):
    """How much of each pixel is her skin (0 or 1)."""
    a = rgba[..., 3]
    h, s, v = _hsv(rgba[..., :3])
    core = (a > 0.05) & (h >= 15) & (h <= 34) & (s >= 0.27) & (s <= 0.58) & (v >= 0.88)
    near = np.asarray(Image.fromarray((core * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    shade = near & (a > 0.05) & (h >= 5) & (h <= 40) & (v >= 0.55) & (s <= 0.7) & (s >= 0.15)
    return core | shade


# sRGB <-> CIE Lab (D65)
_M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
_W = np.array([0.95047, 1.0, 1.08883])


def _lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _gam(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)


def _f(t):
    return np.where(t > (6 / 29) ** 3, np.cbrt(t), t / (3 * (6 / 29) ** 2) + 4 / 29)


def _finv(t):
    return np.where(t > 6 / 29, t ** 3, 3 * (6 / 29) ** 2 * (t - 4 / 29))


def to_lab(rgb):
    xyz = _lin(rgb) @ _M.T / _W
    fx, fy, fz = _f(xyz[..., 0]), _f(xyz[..., 1]), _f(xyz[..., 2])
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], axis=-1)


def to_rgb(lab):
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    xyz = np.stack([_finv(fx), _finv(fy), _finv(fz)], axis=-1) * _W
    return np.clip(_gam(xyz @ np.linalg.inv(_M).T), 0, 1)


def lighten(img):
    """A copy of the RGBA picture with her skin lighter (nothing else changed)."""
    rgba = np.asarray(img.convert('RGBA')).astype(np.float64) / 255
    m = skin_mask(rgba)
    lab = to_lab(rgba[..., :3])
    lab[..., 0] = np.where(m, np.minimum(100, lab[..., 0] + LIFT), lab[..., 0])
    lab[..., 1] = np.where(m, lab[..., 1] * CHROMA, lab[..., 1])
    lab[..., 2] = np.where(m, lab[..., 2] * CHROMA, lab[..., 2])
    out = rgba.copy()
    out[..., :3] = np.where(m[..., None], to_rgb(lab), rgba[..., :3])
    return Image.fromarray(np.round(out * 255).astype(np.uint8), 'RGBA'), int(m.sum())


def sha(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def main():
    rec = json.load(open(RECORD, encoding='utf-8')) if os.path.exists(RECORD) else {}
    files = rec.get('files', {})
    for name in SHEETS:
        path = os.path.join(SHEET_DIR, name)
        now = sha(path)
        if name in files and files[name]['after'] == now:
            print(f'{name}: already lightened, left alone')
            continue
        out, n = lighten(Image.open(path))
        out.save(path, optimize=True)
        files[name] = {'before': now, 'after': sha(path), 'pixels': n}
        print(f'{name}: {n} skin pixels lightened')
    rec = {
        'note': "Mano's skin, a little lighter (scripts/survivor-mano-skin.py): her face and hands in these sheets got L* +%g (of 100) and a* b* ×%g; nothing else of them changed. before/after: the sheets' sha256, so it is never done twice. The room's picture of her (survivor-room-assets.py) is lightened the same way." % (LIFT, CHROMA),
        'lift': LIFT,
        'chroma': CHROMA,
        'files': files,
    }
    with open(RECORD, 'w', encoding='utf-8') as f:
        json.dump(rec, f, ensure_ascii=False, indent=2)
        f.write('\n')


if __name__ == '__main__':
    if len(sys.argv) != 1:
        sys.exit(__doc__)
    main()
