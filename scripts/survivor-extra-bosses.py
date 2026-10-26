#!/usr/bin/env python3
# MANO SURVIVOR — writes every extra special boss's attacks (balance.json →
# extraBosses.bosses[*].phases) as three HP phases (the last boss: four), from
# its own attack and the shared ones (volley, spiral, dash, rain, cross;
# bosses.js), harder with each episode. Run again after changing a number here:
#   python3 -I scripts/survivor-extra-bosses.py src/survivor/data/balance.json
import json, sys, copy
p = sys.argv[1]
raw = open(p, encoding='utf-8').read()
bal = json.loads(raw)
X = bal['extraBosses']
MINW = X['minWarn']
ORDER = ['x_snail', 'x_moth', 'x_toad', 'x_spider', 'x_bellkeeper', 'x_organ', 'x_scarab', 'x_sultan', 'x_jelly', 'x_peacock', 'x_ray', 'x_clock', 'x_queen']
# each boss: its own attack, two more from the start, a third from phase 2
PLAN = {
    'x_snail': ['volley', 'dash', 'rain'],
    'x_moth': ['spiral', 'rain', 'volley'],
    'x_toad': ['dash', 'volley', 'cross'],
    'x_spider': ['volley', 'spiral', 'dash'],
    'x_bellkeeper': ['cross', 'spiral', 'rain'],
    'x_organ': ['volley', 'ringwave', 'spiral'],
    'x_scarab': ['spiral', 'dash', 'rain'],
    'x_sultan': ['rain', 'volley', 'dash'],
    'x_jelly': ['spiral', 'rain', 'cross'],
    'x_peacock': ['volley', 'cross', 'spiral'],
    'x_ray': ['dash', 'volley', 'cross'],
    'x_clock': ['volley', 'spiral', 'cross'],
    'x_queen': ['volley', 'cross', 'spiral'],
}
SHOT = {'bell': 'spark', 'flower': 'seed', 'spore': 'seed', 'web': 'bone', 'ghost': 'void', 'organ': 'spark', 'sun': 'spark', 'sand': 'bone', 'snow': 'ice', 'ice': 'crystal', 'storm': 'spark', 'clock': 'crystal', 'chess': 'void', 'eclipse': 'void'}
W = lambda w: round(max(MINW, w), 3)

def shared(kind, t, dmg, hard=0):
    # t: the episode (0..6); hard: 0, 1 (phase 2), 2 (phase 3)
    s = t + hard
    if kind == 'volley':
        # (shots: many small blows, half a blast each)
        return {'type': 'volley', 'warn': W(0.9 - 0.02 * t), 'bursts': 2 + (s + 1) // 2, 'shots': 3 + (s >= 3) + (s >= 6), 'spreadDeg': 34 + 3 * s, 'speed': 230 + 12 * s, 'r': 7, 'step': round(0.5 - 0.025 * s, 3), 'laneWarn': 0.34, 'damage': round(dmg * 0.5)}
    if kind == 'spiral':
        return {'type': 'spiral', 'warn': W(0.9 - 0.02 * t), 'arms': min(4, 2 + (s + 1) // 2), 'every': round(max(0.12, 0.16 - 0.006 * s), 3), 'seconds': round(min(2.4, 1.4 + 0.18 * s), 2), 'spin': round(1.5 + 0.12 * s, 2), 'speed': 140 + 8 * s, 'r': 6, 'twin': s >= 8, 'damage': round(dmg * 0.45)}
    if kind == 'dash':
        return {'type': 'dash', 'warn': W(0.88 - 0.02 * t), 'count': 2 + s // 3, 'width': 52, 'dur': 0.2, 'damage': dmg + 4}
    if kind == 'rain':
        return {'type': 'rain', 'warn': W(0.9 - 0.02 * t), 'count': 8 + 2 * s, 'r': 46, 'step': round(0.11 - 0.006 * s, 3), 'damage': dmg}
    if kind == 'cross':
        return {'type': 'cross', 'warn': W(0.9 - 0.02 * t), 'count': 2 + s // 3, 'width': 44, 'step': round(0.62 - 0.035 * s, 3), 'damage': dmg}
    if kind == 'ringwave':
        return {'type': 'ringwave', 'warn': W(0.95 - 0.02 * t), 'speed': 220 + 12 * s, 'width': 32, 'gaps': 2, 'gapDeg': 60, 'damage': dmg}
    raise ValueError(kind)

def harder(a, k):
    # the boss's own attack, k steps harder: a little faster, never warned less than minWarn
    a = copy.deepcopy(a)
    a['warn'] = W(a['warn'] * (1 - 0.06 * k))
    for f in ('speed',):
        if f in a: a[f] = round(a[f] * (1 + 0.1 * k))
    for f in ('step',):
        if f in a: a[f] = round(a[f] * (1 - 0.12 * k), 3)
    if a['type'] == 'bloom': a['petals'] += k
    if a['type'] == 'spores': a['count'] += 2 * k
    if a['type'] == 'web': a['fire'] = min(a['threads'] // 2, a['fire'] + k)
    if a['type'] == 'pillars': a['perRay'] += k
    if a['type'] == 'clock': a['lit'] += 2 * k
    if a['type'] == 'chess': a['lines'] += k
    if a['type'] == 'branches': a['count'] += 2 * k
    return a

def combo(parts, after):
    return {'type': 'combo', 'after': [after] * (len(parts) - 1), 'parts': parts}

for t2, bid in enumerate(ORDER):
    t = t2 // 2  # the episode
    b = X['bosses'][bid]
    sig = b['attacks'][0] if 'attacks' in b else b['phases'][0]['attacks'][0]
    dmg = sig['damage']
    e1, e2, e3 = PLAN[bid]
    walk = round(0.55 - 0.03 * t, 2)
    b.pop('attacks', None)
    b['shot'] = SHOT[b['look']]
    b['phases'] = [
        {'above': 0.6, 'walk': walk, 'attacks': [harder(sig, 0), shared(e1, t, dmg), shared(e2, t, dmg)]},
        {'above': 0.3, 'walk': round(walk * 0.75, 2), 'attacks': [harder(sig, 1), shared(e1, t, dmg, 1), shared(e3, t, dmg, 1), combo([harder(sig, 1), shared(e2, t, dmg, 1)], round(0.6 - 0.03 * t, 2)), shared(e2, t, dmg, 1)]},
        {'above': 0, 'walk': round(walk * 0.55, 2), 'attacks': [combo([harder(sig, 2), shared(e1, t, dmg, 2)], round(0.5 - 0.03 * t, 2)), combo([shared(e3, t, dmg, 2), harder(sig, 2)], round(0.5 - 0.03 * t, 2)), shared(e2, t, dmg, 2), combo([shared(e1, t, dmg, 2), shared(e3, t, dmg, 2)], round(0.5 - 0.03 * t, 2))]},
    ]

# the last boss: everything, four phases, triple combos at the end
E = X['bosses']['x_eclipse']
ring = {'type': 'ringwave', 'warn': 0.85, 'speed': 280, 'width': 36, 'gaps': 1, 'gapDeg': 70, 'damage': 32}
sweep = {'type': 'sweep', 'warn': 0.85, 'width': 84, 'speed': 380, 'gaps': 1, 'gap': 118, 'damage': 32}
T = 9
def sh(kind, hard): return shared(kind, T, 32, hard)
E['shot'] = 'void'
E['phases'] = [
    {'above': 0.7, 'walk': 0.4, 'attacks': [ring, sh('volley', 0), sweep, sh('spiral', 0), sh('dash', 0)]},
    {'above': 0.4, 'walk': 0.3, 'attacks': [combo([ring, sh('spiral', 1)], 0.5), sh('rain', 1), combo([sweep, sh('volley', 1)], 0.5), sh('cross', 1), combo([sh('dash', 1), ring], 0.45)]},
    {'above': 0.15, 'walk': 0.2, 'attacks': [combo([ring, sh('spiral', 2), sweep], 0.3), combo([sh('cross', 2), sh('volley', 2), sh('dash', 2)], 0.3), combo([sh('rain', 2), ring, sh('spiral', 2)], 0.3), combo([sweep, sh('volley', 2), sh('cross', 2)], 0.3)]},
    {'above': 0, 'walk': 0.12, 'core': True, 'attacks': [combo([harder(ring, 1), sh('spiral', 3), harder(sweep, 1)], 0.24), combo([sh('dash', 3), sh('volley', 3), sh('rain', 3)], 0.24), combo([sh('spiral', 3), sh('cross', 3), harder(ring, 1)], 0.24), combo([harder(sweep, 1), sh('volley', 3), sh('spiral', 3)], 0.24)]},
]
json.dump(bal, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open(p, 'a').write('\n')
print('ok')
