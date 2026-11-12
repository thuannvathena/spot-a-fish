"""Gives every level its fish: `fishKeys` in game/src/levels.json (the first `goal` are the targets, the rest the decoy species), from the 49 fish of public/models/fish.
Rotation: a fish that was used long ago comes before one that was used just now, so every level feels new. Difficulty: the later and the harder the level, the more decoys share the colour family of a target.
Level 61 (the old Tripo test level) is removed. Usage: python3 scripts/assign-fish.py"""
import json, os, random, colorsys
from PIL import Image
random.seed(49)
lst = json.load(open('public/models/fish/list.json')); keys = [i['key'] for i in lst]
BIG = {'whale', 'shark'}; ODD = {'sea_horse'}   # the sea horse is never a target; it swims among the decoys now and then
def fam(k):
    im = Image.open(f'public/models/fish/{k}/tex.jpg').convert('RGB').resize((64, 64)); x = y = 0
    for r, g, b in im.getdata():
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < .3 or v < .25: continue
        import math; x += math.cos(h * 6.2832) * s * v; y += math.sin(h * 6.2832) * s * v
    import math
    if x == 0 and y == 0: return 'x'
    h = (math.atan2(y, x) * 180 / math.pi + 360) % 360
    return 'red' if h < 20 or h >= 340 else 'orange' if h < 45 else 'yellow' if h < 70 else 'green' if h < 165 else 'cyan' if h < 200 else 'blue' if h < 255 else 'pink'
F = {k: fam(k) for k in keys}
lv = json.load(open('game/src/levels.json')); lv = [x for x in lv if x['id'] != 'L61' and x.get('refLevel', 0) != 61][:60]
last = {k: -99 for k in keys}; used = {k: 0 for k in keys}; prev = set()
for i, L in enumerate(lv):
    n = i + 1; G = L['goal']; S = max(G + 1, min(L['species'], 49)); decoyN = S - G
    d = min(1, .15 + n / 60 * .75 + (.12 if L.get('bounty') else 0))   # 0..1
    def score(k): return (n - last[k]) + random.random() * 3 - used[k] * .4 - (6 if k in prev else 0)
    cand = [k for k in keys if k not in BIG and k not in ODD]
    tg = []
    for _ in range(G):
        pool = sorted([k for k in cand if k not in tg], key=lambda k: -score(k))[:10]
        fams = {F[t] for t in tg}; pool.sort(key=lambda k: (F[k] in fams) * (1 - d * .6) * 4 - score(k) * 0.1)   # easy: targets of different colours
        tg.append(pool[0])
    tf = {F[t] for t in tg}; dec = []
    similar = round(d * .7 * decoyN)
    if n >= 8 and n % 3 != 0: dec.append('whale' if n % 2 else 'shark')
    if n % 3 == 2: dec.append('sea_horse')   # one level in three has the sea horse among the decoys
    
    while len(dec) < decoyN:
        want_sim = len([x for x in dec if F[x] in tf and x not in BIG]) < similar
        pool = [k for k in keys if k not in tg and k not in dec and k not in ODD and k not in BIG and ((F[k] in tf) == want_sim)] or [k for k in keys if k not in tg and k not in dec and k not in BIG and k not in ODD]
        pool.sort(key=lambda k: -score(k)); dec.append(pool[0])
    allk = tg + dec
    for k in allk: last[k] = n; used[k] += 1
    prev = set(tg)
    L['fishKeys'] = ['fish_' + k for k in allk]; L['species'] = len(allk)
json.dump(lv, open('game/src/levels.json', 'w'), indent=1, ensure_ascii=False)
print(len(lv), 'levels'); print('uses per fish: min', min(used.values()), 'max', max(used.values()))
for n in (1, 10, 30, 60): print(n, [k.replace('fish_', '') for k in lv[n - 1]['fishKeys']][:lv[n - 1]['goal']], '| similar decoys:', sum(1 for k in lv[n - 1]['fishKeys'][lv[n - 1]['goal']:] if F[k.replace('fish_', '')] in {F[t.replace('fish_', '')] for t in lv[n - 1]['fishKeys'][:lv[n - 1]['goal']]}))
