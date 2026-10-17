"""Shared helpers for building Mano Colony game assets from the original sheets."""
import numpy as np
from PIL import Image
from scipy import ndimage

ALPHA_CUT = 128   # source sprites are ~250 alpha inside and full of 1–60 alpha noise
MIN_PX = 150      # specks smaller than this (in source px) are dropped


def clean(path, min_px=MIN_PX):
    """Load a sheet; snap alpha to 0/255 and drop faint noise and specks."""
    a = np.array(Image.open(path).convert('RGBA'))
    solid = a[..., 3] >= ALPHA_CUT
    lab, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= min_px
    solid = keep[lab]
    a[..., 3] = np.where(solid, 255, 0)
    a[~solid, :3] = 0
    return a


def cells(a, cols, rows, dilate=3, min_px=1500, bounds=None):
    """Group connected parts by the grid cell their centre falls in.
    Returns {(row, col): mask} in sheet coordinates."""
    solid = a[..., 3] > 0
    lab, n = ndimage.label(ndimage.binary_dilation(solid, iterations=dilate))
    H, W = solid.shape
    xs = bounds['x'] if bounds else [W * i / cols for i in range(cols + 1)]
    ys = bounds['y'] if bounds else [H * i / rows for i in range(rows + 1)]
    out = {}
    for i, sl in enumerate(ndimage.find_objects(lab)):
        m = (lab[sl] == i + 1) & solid[sl]
        if m.sum() < 30:
            continue
        cy, cx = ndimage.center_of_mass(m)
        cy += sl[0].start
        cx += sl[1].start
        c = next(j for j in range(cols) if xs[j] <= cx < xs[j + 1])
        r = next(j for j in range(rows) if ys[j] <= cy < ys[j + 1])
        full = out.setdefault((r, c), np.zeros_like(solid))
        full[sl] |= m
    # drop cells whose content is only stray specks
    return {k: v for k, v in out.items() if v.sum() >= min_px}


def cut(a, mask):
    """Crop the masked object to its bounding box (outside the mask → clear)."""
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    img = a[y0:y1, x0:x1].copy()
    img[~mask[y0:y1, x0:x1]] = 0
    return img, (int(x0), int(y0), int(x1), int(y1))


def resize(img, scale):
    """Premultiplied, high quality downscale (no colour fringes on edges)."""
    im = Image.fromarray(img, 'RGBA').convert('RGBa')
    w = max(1, round(im.width * scale))
    h = max(1, round(im.height * scale))
    return np.array(im.resize((w, h), Image.LANCZOS, reducing_gap=3.0).convert('RGBA'))


def head_x(img):
    """x of the head centre: mean of opaque pixels in the top 40% of the figure."""
    al = img[..., 3] > 0
    ys = np.where(al.any(1))[0]
    top = ys[0] + int((ys[-1] - ys[0]) * 0.4)
    yy, xx = np.where(al[: top + 1])
    return float(xx.mean())


def pack(items, pad=2, width=1024):
    """Shelf-pack {name: img}; returns atlas array and {name: (x, y, w, h)}."""
    order = sorted(items, key=lambda k: -items[k].shape[0])
    x = y = shelf = 0
    pos = {}
    for k in order:
        h, w = items[k].shape[:2]
        if x + w + pad > width:
            x, y, shelf = 0, y + shelf + pad, 0
        pos[k] = (x + pad, y + pad, w, h)
        x += w + pad
        shelf = max(shelf, h)
    H = y + shelf + pad * 2
    atlas = np.zeros((H, width, 4), np.uint8)
    for k, (x0, y0, w, h) in pos.items():
        atlas[y0:y0 + h, x0:x0 + w] = items[k]
    used_w = max(x0 + w for (x0, _, w, _) in pos.values()) + pad
    return atlas[:, :used_w], pos
