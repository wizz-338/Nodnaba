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


# ── v2 sheets: keep soft edges, drop only the background noise ──────────────

def clean_soft(path, core=200, min_core=60, band=3, floor=24):
    """Separate the drawing from the noisy background without hardening it.

    core      pixels this opaque are the inside of a drawing
    min_core  solid specks smaller than this are noise, not drawing
    band      px around the solid inside where soft edges / thin lines live
    floor     inside the band, fainter pixels than this are noise

    Inside stays as drawn (near-opaque interior → fully opaque); the soft
    edge keeps its own alpha but takes the colour of the nearest solid pixel,
    which removes the coloured fringe without eroding thin outlines.
    """
    a = np.array(Image.open(path).convert('RGBA'))
    al = a[..., 3].astype(int)
    solid = al >= core
    lab, n = ndimage.label(solid, structure=np.ones((3, 3)))
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= min_core
    solid = keep[lab]
    near = ndimage.binary_dilation(solid, iterations=band)
    edge = near & ~solid & (al >= floor)
    # colour of the nearest solid pixel for every edge pixel
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    out = np.zeros_like(a)
    out[solid] = a[solid]
    out[solid, 3] = np.where(al[solid] >= 235, 255, al[solid])
    out[edge, :3] = a[iy[edge], ix[edge], :3]
    out[edge, 3] = al[edge]
    return out


# ── play sheets: frames placed by eye, not on an exact grid ─────────────────

def _bands(line, min_len=40, merge=12):
    runs, s = [], None
    for i, v in enumerate(line):
        if v and s is None:
            s = i
        if not v and s is not None:
            runs.append([s, i])
            s = None
    if s is not None:
        runs.append([s, len(line)])
    out = []
    for b in runs:
        if out and b[0] - out[-1][1] < merge:
            out[-1][1] = b[1]
        else:
            out.append(b)
    return [b for b in out if b[1] - b[0] >= min_len]


def _cut_near(profile, n, lo_edge, hi_edge, reach):
    """n-1 cut lines between lo_edge and hi_edge, each at the emptiest line
    within `reach` of where an even split would put it."""
    cuts = [lo_edge]
    for i in range(1, n):
        c = lo_edge + (hi_edge - lo_edge) * i / n
        lo, hi = int(c - reach), int(c + reach)
        win = profile[lo:hi]
        idx = np.where(win == win.min())[0]
        cuts.append(int(idx[np.argmin(np.abs(idx + lo - c))] + lo))
    cuts.append(hi_edge)
    return cuts


def segment(a, rows, cols):
    """Frames of a sheet whose drawings were not placed on an exact grid.

    Rows are the bands of drawn lines (a band can start well below the top);
    if two rows touch, the cut goes through the emptiest line near the even
    split. Columns inside each row are cut the same way, so a frame that
    leans into its neighbour keeps its own pixels. Returns
    {(row, col): (mask, (x0, y0, x1, y1) of the cell)}."""
    occ = a[..., 3] > 100
    H, W = occ.shape
    prof = occ.sum(1)
    rb = _bands(prof > 2)
    if len(rb) != rows:
        drawn = np.where(prof > 2)[0]
        e = _cut_near(prof, rows, int(drawn[0]), int(drawn[-1]) + 1, 70)
        rb = [[e[i], e[i + 1]] for i in range(rows)]
    out = {}
    for r, (y0, y1) in enumerate(rb):
        cuts = _cut_near(occ[y0:y1].sum(0), cols, 0, W, 95)
        for c in range(cols):
            x0, x1 = cuts[c], cuts[c + 1]
            m = np.zeros_like(occ)
            m[y0:y1, x0:x1] = a[y0:y1, x0:x1, 3] > 0
            lab, n = ndimage.label(m, structure=np.ones((3, 3)))
            sizes = ndimage.sum(m, lab, range(1, n + 1))
            keep = np.zeros(n + 1, bool)
            keep[1:] = sizes >= 40  # single stray pixels, not petals or sparkles
            out[(r, c)] = (keep[lab], (x0, y0, x1, y1))
    return out


def head_width(img):
    """Widest line of the hood: the head is drawn the same size in every pose."""
    al = img[..., 3] > 128
    ys = np.where(al.any(1))[0]
    top = ys[0] + int((ys[-1] - ys[0]) * 0.4)
    return max(int(np.ptp(np.where(r)[0])) + 1 for r in al[ys[0]:top + 1] if r.any())


def split_pair(img):
    """The two Manos of a pair frame, split at the emptiest column near the middle."""
    prof = (img[..., 3] > 128).sum(0)
    W = img.shape[1]
    lo, hi = int(W * 0.35), int(W * 0.65)
    c = lo + int(np.argmin(prof[lo:hi]))
    return img[:, :c], img[:, c:], c


def body(mask, share=0.15):
    """The character's own pixels: parts at least `share` of the largest one
    (drops sparkles, petals, motion marks for measuring, not for drawing)."""
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    big = sizes.max()
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= big * share
    return keep[lab]
