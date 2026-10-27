#!/usr/bin/env python3
"""MANO SURVIVOR — game copies of the 84-image story package.

    python3 -I scripts/survivor-story-assets.py <MANO_COMPLETE_84 folder>

Reads the original package (image_list.json and the PNGs it names, never
anything else), and writes:
  src/survivor/assets/s84/<kind>/<id>.webp   the copies the game loads
  src/survivor/data/story-assets.json        the resource map: every image's
                                             id, use, region, original path
                                             (in the package), game file,
                                             sizes and the original's sha256
The originals are not changed and not copied into the repository (181 MB);
the map's sha256 tells whether a package is the same one.

Monsters, rewards and companions: cut to their opaque body (alpha kept) and
made at most 320 px (monsters) / 256 px (props) on their long side.
Cutscenes: 720 × 1080. Backgrounds: 864 × 1296, plus a small soft copy for
the lobby. Tizzzz's lobby face: cut from her cutscene.
"""
import hashlib
import json
import os
import sys

from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'survivor', 'assets', 's84')
MAP = os.path.join(ROOT, 'src', 'survivor', 'data', 'story-assets.json')

REGIONS = ['forest', 'deepforest', 'skulltown', 'desert', 'snow', 'sky', 'castle']
# the package's monster file names (without the number) → the game's ids
MONSTER_IDS = {
    '새싹요정': 'sprout', '잎사귀토끼': 'leafbunny', '빨간버섯': 'redcap', '이끼골렘': 'mossgolem', '꽃뿔수호자': 'flowerguard',
    '나무가면인형': 'maskdoll', '버섯멧돼지': 'mushboar', '버섯망령': 'mushwraith', '등불고목': 'lanterntree', '타락한고목군주': 'treelord',
    '해골병사': 'skeleton', '뼈슬라임': 'boneslime', '왕관해골사냥개': 'crownhound', '거대해골야수': 'skullbeast', '해골왕': 'skullking',
    '사막전갈': 'scorpion', '모래정령': 'sandspirit', '모래지렁이': 'sandworm', '수정바위수호자': 'crystalguard', '피닉스': 'phoenix',
    '얼음늑대': 'icewolf', '눈정령': 'snowspirit', '빙결곰': 'frostbear', '얼음골렘': 'icegolem', '설원수호자': 'snowguardian',
    '그리핀': 'griffin', '구름정령': 'cloudspirit', '구름용': 'clouddragon', '천공골렘': 'skygolem', '천둥정령': 'thunderspirit',
    '해골망령': 'skullwraith', '공허의눈': 'voideye', '그림자용': 'shadowdragon', '공허골렘': 'voidgolem', '마왕': 'demonking',
}


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def body(im):
    """the opaque body's box (alpha over 16), so the empty canvas never counts"""
    return im.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()


def save(im, kind, ident, quality, lossless=False):
    d = os.path.join(OUT, kind)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, ident + '.webp')
    im.save(path, 'WEBP', quality=quality, method=6, lossless=lossless)
    return os.path.relpath(path, os.path.join(ROOT, 'src', 'survivor', 'assets', 's84')).replace(os.sep, '/'), os.path.getsize(path)


# the open ground of a portrait background (inside its decorated border)
INNER = (0.15, 0.12, 0.85, 0.88)


def widen(rgb):
    w, h = rgb.size
    box = (round(w * INNER[0]), round(h * INNER[1]), round(w * INNER[2]), round(h * INNER[3]))
    inner = rgb.crop(box)
    iw, ih = inner.size
    flip = inner.transpose(Image.FLIP_LEFT_RIGHT)
    strip = Image.new('RGB', (iw * 3, ih))
    strip.paste(flip, (0, 0))
    strip.paste(inner, (iw, 0))
    strip.paste(flip, (iw * 2, 0))
    cw = round(ih * 16 / 9)
    x = (strip.width - cw) // 2
    cut = strip.crop((x, 0, x + cw, ih))
    out = cut.resize((1920, 1080), Image.LANCZOS) if cut.width >= 1920 else cut
    return out, f'inner {box} mirrored to the sides, {cw}x{ih} → {out.width}x{out.height}'


def main(pkg):
    listing = json.load(open(os.path.join(pkg, 'image_list.json'), encoding='utf-8'))
    out = []
    for e in listing:
        rel = e['file']
        src = os.path.join(pkg, rel)
        parts = rel.split('/')
        kind_dir = parts[0]
        im = Image.open(src)
        im.load()
        entry = {'source': rel, 'width': im.width, 'height': im.height, 'sha256': sha(src)}
        if kind_dir == '01_monsters':
            region = REGIONS[int(parts[1][:2]) - 1]
            name = os.path.splitext(parts[2])[0][3:]
            ident = MONSTER_IDS[name]
            im = im.convert('RGBA')
            box = body(im)
            im = im.crop(box)
            im.thumbnail((320, 320), Image.LANCZOS)
            f, size = save(im, 'monsters', ident, 86)
            entry.update(id=ident, kind='monster', region=region, name=name, body=list(box), file=f, out=[im.width, im.height], bytes=size)
        elif kind_dir == '02_cutscenes':
            group = parts[1][:2]
            n = int(parts[2][:2])
            ident = f'cs_{group}_{n}'
            region = 'prologue' if group == '00' else REGIONS[int(group) - 1]
            im = im.convert('RGB').resize((720, 1080), Image.LANCZOS)
            f, size = save(im, 'cutscenes', ident, 80)
            entry.update(id=ident, kind='cutscene', region=region, name=os.path.splitext(parts[2])[0][3:], file=f, out=[720, 1080], bytes=size)
            if ident == 'cs_03_3':
                # Tizzzz's face for the lobby, from her own cutscene
                face = Image.open(src).convert('RGB').crop((430, 100, 790, 460)).resize((160, 160), Image.LANCZOS)
                ff, fsize = save(face, 'rewards', 'tizzzz_face', 86)
                out.append({'id': 'tizzzz_face', 'kind': 'portrait', 'region': region, 'source': rel, 'crop': [430, 100, 790, 460], 'file': ff, 'out': [160, 160], 'bytes': fsize, 'width': e['width'], 'height': e['height'], 'sha256': entry['sha256']})
        elif kind_dir == '03_backgrounds':
            n = int(parts[1][:2])
            ident = f'bg_{REGIONS[n - 1]}'
            rgb = im.convert('RGB')
            big = rgb.resize((864, 1296), Image.LANCZOS)
            f, size = save(big, 'backgrounds', ident, 78)
            entry.update(id=ident, kind='background', region=REGIONS[n - 1], name=os.path.splitext(parts[1])[0][3:], file=f, out=[864, 1296], bytes=size)
            # the lobby's backdrop: the same ground, soft and dim (baked: no CSS blur)
            soft = rgb.resize((216, 324), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3))
            soft = ImageEnhance.Brightness(soft).enhance(0.55)
            sf, ssize = save(soft, 'backgrounds', ident + '_soft', 62)
            out.append({'id': ident + '_soft', 'kind': 'backdrop', 'region': REGIONS[n - 1], 'source': rel, 'file': sf, 'out': [216, 324], 'bytes': ssize, 'width': e['width'], 'height': e['height'], 'sha256': entry['sha256']})
            # the PC game's landscape field, a stand-in until 16:9 art exists:
            # the open ground inside the picture's border, mirrored out to the
            # sides (seamless at the seams), cut to 16:9 and made smaller,
            # never larger — no stretching, no blowing up
            wide, how = widen(rgb)
            wf, wsize = save(wide, 'backgrounds', ident + '_wide', 74)
            out.append({'id': ident + '_wide', 'kind': 'background-wide', 'region': REGIONS[n - 1], 'source': rel, 'method': how, 'file': wf, 'out': list(wide.size), 'bytes': wsize, 'width': e['width'], 'height': e['height'], 'sha256': entry['sha256']})
            wsoft = wide.resize((480, 270), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3))
            wsoft = ImageEnhance.Brightness(wsoft).enhance(0.55)
            wsf, wssize = save(wsoft, 'backgrounds', ident + '_wide_soft', 62)
            out.append({'id': ident + '_wide_soft', 'kind': 'backdrop-wide', 'region': REGIONS[n - 1], 'source': rel, 'file': wsf, 'out': [480, 270], 'bytes': wssize, 'width': e['width'], 'height': e['height'], 'sha256': entry['sha256']})
        else:
            ident = os.path.splitext(parts[1])[0]
            im = im.convert('RGBA')
            box = body(im)
            im = im.crop(box)
            im.thumbnail((256, 256), Image.LANCZOS)
            kind = 'companion' if kind_dir == '05_companions' else 'reward'
            f, size = save(im, 'rewards', ident, 88)
            entry.update(id=ident, kind=kind, region=None, body=list(box), file=f, out=[im.width, im.height], bytes=size)
        out.append(entry)
    # (the opening's wide pictures, made by survivor-intro-assets.py, stay)
    if os.path.exists(MAP):
        out += [x for x in json.load(open(MAP, encoding='utf-8'))['images'] if x['id'].startswith('intro_')]
    ids = [x['id'] for x in out]
    assert len(ids) == len(set(ids)), 'ids must be unique'
    note = ('The 84-image story package (MANO_COMPLETE_84, built from its image_list.json by '
            'scripts/survivor-story-assets.py). source: the original in the package; file: the game copy under '
            'src/survivor/assets/s84; body: the opaque box cut out of the original; sha256: the original file.')
    json.dump({'note': note, 'package': 'MANO_COMPLETE_84', 'images': out}, open(MAP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    total = sum(x['bytes'] for x in out)
    print(f'{len(listing)} originals → {len(out)} game files, {total / 1e6:.1f} MB')


if __name__ == '__main__':
    main(sys.argv[1])
