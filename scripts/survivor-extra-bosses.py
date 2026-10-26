#!/usr/bin/env python3
# MANO SURVIVOR — writes every extra special boss's attacks (balance.json →
# extraBosses.bosses[*].phases) as four HP phases (the last boss: five), from
# its own attack and the shared ones (volley, spiral, dash, rain, cross, nova,
# homing, cage, stalk, beam; bosses.js), harder with each episode. Run again after changing a number here:
#   python3 -I scripts/survivor-extra-bosses.py src/survivor/data/balance.json
import json, sys, copy
p = sys.argv[1]
raw = open(p, encoding='utf-8').read()
bal = json.loads(raw)
X = bal['extraBosses']
# (a longer fight: more of its phases seen)
X['hpMul'] = 18.0
MINW = X['minWarn']
ORDER = ['x_snail', 'x_moth', 'x_toad', 'x_spider', 'x_bellkeeper', 'x_organ', 'x_scarab', 'x_sultan', 'x_jelly', 'x_peacock', 'x_ray', 'x_clock', 'x_queen']
# each boss: its own attack and five of the shared ones (in the order they
# come in: three from the start, a fourth from phase 2, a fifth from phase 3)
PLAN = {
    'x_snail': ['volley', 'stalk', 'dash', 'nova', 'rain'],
    'x_moth': ['spiral', 'homing', 'rain', 'beam', 'volley'],
    'x_toad': ['stalk', 'dash', 'volley', 'cage', 'cross'],
    'x_spider': ['volley', 'homing', 'spiral', 'cage', 'dash'],
    'x_bellkeeper': ['nova', 'cross', 'spiral', 'beam', 'rain'],
    'x_organ': ['volley', 'nova', 'ringwave', 'homing', 'spiral'],
    'x_scarab': ['spiral', 'stalk', 'dash', 'cage', 'rain'],
    'x_sultan': ['rain', 'beam', 'volley', 'dash', 'homing'],
    'x_jelly': ['spiral', 'homing', 'rain', 'nova', 'cross'],
    'x_peacock': ['volley', 'beam', 'cross', 'nova', 'spiral'],
    'x_ray': ['dash', 'stalk', 'volley', 'beam', 'cross'],
    'x_clock': ['volley', 'beam', 'spiral', 'cage', 'cross'],
    'x_queen': ['volley', 'cage', 'cross', 'homing', 'spiral'],
}
SHOT = {'bell': 'spark', 'flower': 'seed', 'spore': 'seed', 'web': 'bone', 'ghost': 'void', 'organ': 'spark', 'sun': 'spark', 'sand': 'bone', 'snow': 'ice', 'ice': 'crystal', 'storm': 'spark', 'clock': 'crystal', 'chess': 'void', 'eclipse': 'void'}
# each boss's own attack (the one it had alone before the phases)
SIG = {
    'x_snail': {"type": "ringwave", "warn": 0.975, "speed": 210, "width": 30, "gaps": 2, "gapDeg": 58, "damage": 24},
    'x_moth': {"type": "bloom", "warn": 0.845, "petals": 6, "petalDeg": 46, "skip": 2, "inner": 34, "step": 0.132, "damage": 24},
    'x_toad': {"type": "spores", "warn": 0.91, "count": 6, "r": 48, "step": 0.144, "damage": 22},
    'x_spider': {"type": "web", "warn": 0.91, "threads": 6, "fire": 3, "width": 30, "step": 0.18, "damage": 24},
    'x_bellkeeper': {"type": "sweep", "warn": 0.91, "width": 64, "speed": 322, "gaps": 1, "gap": 130, "damage": 24},
    'x_organ': {"type": "rows", "warn": 0.91, "rows": 6, "damage": 24},
    'x_scarab': {"type": "ringwave", "warn": 0.975, "speed": 238, "width": 36, "gaps": 1, "gapDeg": 84, "damage": 26},
    'x_sultan': {"type": "sweep", "warn": 0.91, "width": 84, "speed": 280, "gaps": 2, "gap": 110, "damage": 24},
    'x_jelly': {"type": "branches", "warn": 0.91, "count": 6, "branchDeg": 26, "damage": 24},
    'x_peacock': {"type": "pillars", "warn": 0.845, "rays": 5, "spreadDeg": 110, "perRay": 4, "r": 28, "step": 0.108, "damage": 24},
    'x_ray': {"type": "sweep", "warn": 0.91, "width": 80, "speed": 322, "gaps": 1, "gap": 140, "push": 55, "damage": 24},
    'x_clock': {"type": "clock", "warn": 0.845, "sectors": 12, "lit": 4, "inner": 40, "step": 0.18, "damage": 24},
    'x_queen': {"type": "chess", "warn": 0.975, "cols": 6, "rows": 5, "lines": 3, "damage": 26},
}
# the rings and bands (the attacks that show their safe gaps in green) fly
# this much faster than first written (asked for: twice)
WAVE = 2
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
    if kind == 'nova':
        # rings of shots all round it, each turned half a step from the last
        return {'type': 'nova', 'warn': W(0.9 - 0.02 * t), 'count': min(28, 14 + 2 * s), 'waves': min(5, 2 + s // 3), 'every': round(max(0.2, 0.32 - 0.012 * s), 3), 'speed': 150 + 8 * s, 'r': 7, 'damage': round(dmg * 0.45)}
    if kind == 'homing':
        # seeking orbs thrown out wide, turning toward her for a while
        return {'type': 'homing', 'warn': W(0.9 - 0.02 * t), 'count': min(8, 4 + s // 2), 'spreadDeg': 160, 'speed': 140 + 6 * s, 'turn': round(1.5 + 0.08 * s, 2), 'seek': 2.4, 'r': 7, 'ttl': 6, 'salvos': 1 + s // 3, 'every': 0.6, 'damage': round(dmg * 0.45)}
    if kind == 'cage':
        # a ring of blows round her with one way out, then its inside
        return {'type': 'cage', 'warn': W(0.95 - 0.02 * t), 'count': 14, 'gap': 2, 'ring': 120, 'r': 32, 'after': round(max(0.45, 0.62 - 0.02 * s), 3), 'damage': dmg}
    if kind == 'stalk':
        # circles that follow her, each where she is (and a little ahead)
        return {'type': 'stalk', 'warn': W(0.9 - 0.02 * t), 'count': 4 + s // 2, 'r': 46, 'step': round(max(0.24, 0.4 - 0.015 * s), 3), 'lead': 0.25, 'damage': dmg}
    if kind == 'beam':
        # a beam swinging round it through her (and back, later on)
        return {'type': 'beam', 'warn': W(0.95 - 0.02 * t), 'widthDeg': 12, 'sweepDeg': min(220, 120 + 10 * s), 'step': round(max(0.035, 0.06 - 0.003 * s), 3), 'back': 0.3 if s >= 4 else 0, 'damage': dmg}
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
    sig = SIG[bid]
    dmg = sig['damage']
    e1, e2, e3, e4, e5 = PLAN[bid]
    sh = lambda k, h: shared(k, t, dmg, h)
    walk = round(0.45 - 0.03 * t, 2)
    gap = lambda k: round(max(0.25, 0.55 - 0.03 * t - 0.08 * k), 2)
    b.pop('attacks', None)
    b['shot'] = SHOT[b['look']]
    # four phases by HP: more attacks each, combos from the second, only
    # three-part combos close together in the last
    b['phases'] = [
        {'above': 0.75, 'walk': walk, 'attacks': [harder(sig, 0), sh(e1, 0), sh(e2, 0), sh(e3, 0)]},
        {'above': 0.5, 'walk': round(walk * 0.7, 2), 'attacks': [harder(sig, 1), sh(e4, 1), combo([harder(sig, 1), sh(e1, 1)], gap(1)), sh(e2, 1), combo([sh(e3, 1), sh(e4, 1)], gap(1))]},
        {'above': 0.25, 'walk': round(walk * 0.5, 2), 'attacks': [combo([harder(sig, 2), sh(e5, 2)], gap(2)), combo([sh(e1, 2), sh(e4, 2)], gap(2)), harder(sig, 2), combo([sh(e2, 2), sh(e3, 2)], gap(2)), combo([sh(e5, 2), harder(sig, 2)], gap(2))]},
        {'above': 0, 'walk': round(walk * 0.35, 2), 'attacks': [combo([harder(sig, 3), sh(e1, 3), sh(e4, 3)], gap(3)), combo([sh(e5, 3), harder(sig, 3), sh(e2, 3)], gap(3)), combo([sh(e3, 3), sh(e4, 3), sh(e5, 3)], gap(3))]},
    ]

# the last boss: everything, four phases, triple combos at the end
E = X['bosses']['x_eclipse']
ring = {'type': 'ringwave', 'warn': 0.85, 'speed': 280, 'width': 36, 'gaps': 1, 'gapDeg': 70, 'damage': 32}
sweep = {'type': 'sweep', 'warn': 0.85, 'width': 84, 'speed': 380, 'gaps': 1, 'gap': 118, 'damage': 32}
T = 9
def sh(kind, hard): return shared(kind, T, 32, hard)
E['shot'] = 'void'
E['hpMul'] = 26.0 # (the others' ×1.44, as before)
E['phases'] = [
    {'above': 0.75, 'walk': 0.35, 'attacks': [ring, sh('volley', 0), sweep, sh('nova', 0), sh('spiral', 0), sh('dash', 0)]},
    {'above': 0.5, 'walk': 0.26, 'attacks': [combo([ring, sh('spiral', 1)], 0.45), sh('homing', 1), combo([sweep, sh('volley', 1)], 0.45), sh('stalk', 1), combo([sh('dash', 1), ring], 0.4), sh('beam', 1)]},
    {'above': 0.25, 'walk': 0.18, 'attacks': [combo([ring, sh('spiral', 2), sweep], 0.3), combo([sh('cage', 2), sh('nova', 2)], 0.3), combo([sh('cross', 2), sh('volley', 2), sh('dash', 2)], 0.3), combo([sh('beam', 2), sh('homing', 2)], 0.3), combo([sh('rain', 2), ring, sh('spiral', 2)], 0.3)]},
    {'above': 0.1, 'walk': 0.12, 'attacks': [combo([sweep, sh('stalk', 3), sh('nova', 3)], 0.26), combo([harder(ring, 1), sh('homing', 3), sh('beam', 3)], 0.26), combo([sh('cage', 3), sh('volley', 3), sh('cross', 3)], 0.26), combo([sh('dash', 3), sh('spiral', 3), sweep], 0.26)]},
    {'above': 0, 'walk': 0.08, 'core': True, 'attacks': [combo([harder(ring, 1), sh('spiral', 4), harder(sweep, 1)], 0.22), combo([sh('dash', 4), sh('nova', 4), sh('rain', 4)], 0.22), combo([sh('beam', 4), sh('cross', 4), harder(ring, 1)], 0.22), combo([sh('cage', 4), sh('homing', 4), sh('stalk', 4)], 0.22), combo([harder(sweep, 1), sh('volley', 4), sh('spiral', 4)], 0.22)]},
]
def fast(a):
    if a['type'] == 'combo':
        for q in a['parts']: fast(q)
    elif a['type'] in ('ringwave', 'sweep'):
        a['speed'] = round(a['speed'] * WAVE)
for b in X['bosses'].values():
    for ph in b['phases']:
        for a in ph['attacks']: fast(a)

json.dump(bal, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open(p, 'a').write('\n')
print('ok')
