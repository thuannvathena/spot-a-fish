"""Plans the 60 levels as a smooth ramp and writes game/src/levels.plan.json (levels.json is NOT touched; run with --apply to write it).
Curve: fish in the tank at once S(L) climbs 4 -> 40 over the 60 levels (the cap of 40 is only reached at the end; the pipe adds more fish later in the level, so the total of a level can be above 40).
Level 1-2: only target fish. Level 3: the first wrong fish (and the Backup). Level 1-10: no colour noise. Colour noise from level 11. Bounty from level 25. New fish are introduced a few at a time.
Usage: python3 scripts/plan-levels.py [--apply]"""
import json, math, random, colorsys, sys, collections
from PIL import Image
random.seed(7)
CAPPED = '--cap' in sys.argv
keys = [i['key'] for i in json.load(open('public/models/fish/list.json'))]
BIG = ['shark', 'whale']; ODD = ['sea_horse']; NONFISH = set(BIG + ODD)
def fam(k):
    im = Image.open(f'public/models/fish/{k}/tex.jpg').convert('RGB').resize((64, 64)); x = y = 0
    for r, g, b in im.getdata():
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < .3 or v < .25: continue
        x += math.cos(h * 6.2832) * s * v; y += math.sin(h * 6.2832) * s * v
    if x == 0 and y == 0: return 'x'
    h = (math.atan2(y, x) * 180 / math.pi + 360) % 360
    return 'red' if h < 20 or h >= 340 else 'orange' if h < 45 else 'yellow' if h < 70 else 'green' if h < 165 else 'cyan' if h < 200 else 'blue' if h < 255 else 'pink'
F = {k: fam(k) for k in keys}
lv = json.load(open('game/src/levels.json'))[:60]
SPEC_CAP = 30; CAP = 40
HEAD_S = {1: 4, 2: 5, 3: 8, 4: 10, 5: 13}   # levels 1-5 by hand: 1-2 only targets; 3 has 3 wrong fish, 4 has 5, 5 has 7 (the Backup holds 7, so level 5 can be lost)
def S_of(L):
    if L in HEAD_S: return HEAD_S[L]
    s = round(13 + 27 * ((L - 5) / 55) ** .9)
    s += {0: 2, 4: 1}.get(L % 5, 0)
    return min(CAP, s)
def lerp(pts, L):
    for (a, x), (b, y) in zip(pts, pts[1:]):
        if a <= L <= b: return x + (y - x) * (L - a) / (b - a)
    return pts[-1][1]
SEEN_AT = [(1, 4), (3, 9), (5, 14), (10, 24), (20, 34), (30, 41), (40, 47), (45, 49), (60, 49)]   # new fish are met a few at a time, a little faster than first planned
T_HEAD = {1: 4, 2: 5, 3: 5, 4: 5, 5: 6, 6: 7, 7: 7, 8: 8, 9: 9, 10: 9, 11: 9, 12: 10}   # fish to catch in levels 1-12 (never goes down); the rest of the fish in the tank are wrong fish
def decoy_share(L): return .36 + (L - 13) / 47 * .11
PLAY_CAP = 24   # fish to catch in the longest level: at 5 s a fish that is 120 s, the longest a level may take
def T_of(L, diff):   # fish to catch: climbs slowly to the cap at the end; Easy levels are shorter and Medium a little shorter than the Hard ones, so long levels never come one after another
    trend = 10 + (PLAY_CAP - 10) * ((L - 12) / 48) ** .9
    return min(PLAY_CAP, max(10, round(trend * {'Easy': .85, 'Medium': .93}.get(diff, 1.0))))
def look_of(L): return 0 if L <= 10 else 1 if L <= 20 else 2 if L <= 30 else 3 if L <= 45 else 4
BOUNTY = {25: ['tiny'], 35: ['camo'], 45: ['fast'], 55: ['tiny', 'camo'], 60: ['fast', 'camo']}
def avgper(L): return 1 if L <= 6 else 1 + (L - 6) / 12 * .5 if L <= 12 else 1.5 + (L - 12) / 8 * .7 if L <= 20 else 2.2 + (L - 20) / 10 * .6 if L <= 30 else min(3, 2.8 + (L - 30) / 30 * .2)
def tanks_for(T, L, nb):
    n = max(math.ceil(T / 3), round(T / avgper(L))); n = min(n, T); per = [1] * n; i = 0
    while sum(per) < T:
        j = i % n
        if per[j] < 3: per[j] += 1
        i += 1
    per.sort()
    if nb:   # the bounty species need only one fish each
        for q in range(nb):
            if per[q] > 1 and sum(per) - (per[q] - 1) >= 0: per[q] = 1
    return per
# introduction order: round-robin over the colour families so neighbours differ
byf = collections.defaultdict(list); pool_all = [k for k in keys if k not in NONFISH]; random.shuffle(pool_all)
for k in pool_all: byf[F[k]].append(k)
order = []; fams = list(byf)
while any(byf.values()):
    for f in fams:
        if byf[f]: order.append(byf[f].pop())
FIX = {6: 'sea_horse', 12: 'shark', 18: 'whale'}   # non-fish decoys are introduced at these levels
prevD = 0; seen = []; last = {k: -99 for k in keys}; used = collections.Counter(); plan = []; prev_set = set()
for i, base in enumerate(lv):
    L = i + 1; S = S_of(L); pump = L >= 16
    if CAPPED:   # --cap: the fish to catch climb to PLAY_CAP (a level of at most 2 minutes)
        extra = round(6 + 12 * (L - 16) / 44) if pump else 0
        total = S + extra
        T0 = T_HEAD[L] if L in T_HEAD else T_of(L, base['difficulty'])
        D = max(2 if L >= 3 else 0, total - T0)
    else:   # default: long levels (the longest about 3 minutes by the 5 s a fish estimate) with short ones between them
        extra = round(8 + 32 * (L - 16) / 44) if pump else 0
        m = {'Easy': .65, 'Medium': .82}.get(base['difficulty'], 1.0) if pump else 1.0   # Easy levels are the short ones, Medium a little shorter, Hard / Very Hard the longest
        total = S + extra
        if pump and m < 1: total = max(S + 3, round(total * m)); extra = total - S
        D = S - T_HEAD[L] if L in T_HEAD else max(prevD * (1 if m == 1 else .6), round(decoy_share(L) * total)); D = round(D)
        T0 = total - D
        prevD = D if m == 1 else prevD
    T = T0
    bn = len(BOUNTY.get(L, []))
    tanks = tanks_for(T + (bn if CAPPED else 0), L, bn);   # a bounty tank needs only one fish, so one more fish is asked of the other tanks, keeping the length of the level near the cap
    n = len(tanks); T = sum(tanks); total = T + D
    S = min(S, total); extra = total - S if pump else 0
    if not pump: S = total
    look = min(look_of(L), max(1, n))
    m = 0 if D == 0 else max(1, min(round(D / 1.8), SPEC_CAP - n - look))
    # introduce new fish
    Kt = round(lerp(SEEN_AT, L)); newc = []
    while len([k for k in seen]) < max(Kt, 0):
        nxt = FIX.get(L) if FIX.get(L) and FIX[L] not in seen else None
        if nxt is None and any(v == L for v in []): pass
        cand = [k for k in order if k not in seen]
        pick = nxt or (cand[0] if cand else None)
        if pick is None: break
        seen.append(pick); newc.append(pick)
    for need in (n + m,):   # a level can never ask for more species than have been met
        while len(seen) < need:
            cand = [k for k in order if k not in seen]; seen.append(cand[0]); newc.append(cand[0])
    for nn in ('sea_horse', 'shark', 'whale'):
        if FIX.get(L) == nn and nn not in seen: seen.append(nn); newc.append(nn)
    realnew = [k for k in newc if k not in NONFISH]
    def score(k): return (L - last[k]) + random.random() * 2.2 - used[k] * .35
    tpool = [k for k in seen if k not in NONFISH]
    early = L <= 10   # levels 1-10: the targets come from a few colour families and the wrong fish from the others, so there is no colour noise
    if early:
        cnt = collections.Counter(F[k] for k in tpool); allowed = {f for f, _ in cnt.most_common(4)}
    tg = [k for k in realnew if (not early or F[k] in allowed)][:n]
    while len(tg) < n:
        tf = {F[t] for t in tg}
        cand = sorted([k for k in tpool if k not in tg and (not early or F[k] in allowed)] or [k for k in tpool if k not in tg], key=lambda k: -(score(k) - (0 if early else (2.5 if F[k] in tf else 0))))
        tg.append(cand[0])
    tf = {F[t] for t in tg}; dec = []
    nonf = [k for k in seen if k in NONFISH]
    if m and nonf and L >= 6:
        k = nonf[(L // 2) % len(nonf)] if (L % 2 == 0 or L % 3 == 2) else None
        if k: dec.append(k)
    sim_share = 0 if L <= 10 else min(.6, (L - 10) / 50 * .75)
    while len(dec) < m:
        nsim = len([x for x in dec if F[x] in tf and x not in NONFISH])
        want = nsim < round(sim_share * m)
        cand = sorted([k for k in tpool if k not in tg and k not in dec and ((F[k] in tf) == want)], key=lambda k: -score(k))
        if not cand: cand = sorted([k for k in tpool if k not in tg and k not in dec], key=lambda k: -score(k))
        if not cand: break
        dec.append(cand[0])
    allk = tg + dec
    for k in allk: last[k] = L; used[k] += 1
    nsimf = len([x for x in dec if F[x] in tf and x not in NONFISH])
    ov = len(set(allk) & prev_set) / max(1, len(set(allk) | prev_set)); prev_set = set(allk)
    # waves
    tube = dict(base.get('tube', {}))
    if pump:
        w = max(1, min(5, round(extra / 10))); hold = 1 if n < 10 else 2
        hard = L % 5 == 0   # Hard / Very Hard levels: the last wave comes when only one tank is left and holds back the last two target fish, so the end of the level is a choke point (one big wave in one go was tried: the bot found it easier)
        at = [max(1, round(n * (j + 1) / (w + 1))) for j in range(w)]
        if hard: at[-1] = n - 1; hold = max(hold, 2) if n >= 6 else hold
        else: at = [min(a_, n - 2) for a_ in at]
        for j in range(1, w): at[j] = max(at[j], at[j - 1])
        tube = {'enabled': True, 'extraFish': extra, 'waves': [{'afterTanks': at[j], 'holdLast': True, 'holdFish': hold} for j in range(w)], 'autoPumpWhenStuck': True, 'stuckDelaySec': 2.5}
    else: tube = {'enabled': False, 'extraFish': 0, 'waves': [], 'autoPumpWhenStuck': True, 'stuckDelaySec': 2.5}
    row = dict(base); row.update({'name': {2: 'Level 2', 3: 'Backup Slot'}.get(L, base['name']), 'tanks': tanks, 'goal': n, 'per': max(tanks), 'species': len(allk), 'decoyFish': D, 'look': look, 'startFish': S, 'maxFish': total, 'fishKeys': ['fish_' + k for k in allk], 'tube': tube, 'bounty': BOUNTY.get(L, []), 'backup': L >= 3, 'category': 'Bounty' if L in BOUNTY else ('Normal' if base.get('category') == 'Bounty' else base.get('category'))})
    plan.append(row)
    plan[-1]['_dbg'] = {'new': newc, 'seen': len(seen), 'T': T, 'sim': nsimf, 'overlap': round(ov, 2), 'pumped': extra}
if '--apply' in sys.argv:
    out = [{k: v for k, v in r.items() if k != '_dbg'} for r in plan]; json.dump(out, open('game/src/levels.json', 'w'), indent=1, ensure_ascii=False); print('levels.json written')
else:
    json.dump(plan, open('game/src/levels.plan.json', 'w'), indent=1, ensure_ascii=False)
print("L   inTank total catch tanks(per)         decoyF species(+look) seen new                          sameColourDecoys overlap")
for i, r in enumerate(plan, 1):
    d = r['_dbg']; t = r['tanks']; c = collections.Counter(t)
    print(f"{i:<3} {r['startFish']:<6} {r['maxFish']:<5} {d['T']:<5} {len(t)}t 1x{c[1]}/2x{c[2]}/3x{c[3]:<3}   {r['decoyFish']:<7} {r['species']}+{r['look']:<8} {d['seen']:<4} {','.join(x.replace('_',' ') for x in d['new'])[:34]:<35} {d['sim']:<4} {d['overlap']}")
sp = [len(r['fishKeys']) + r['look'] for r in plan]; print('max species+look', max(sp), '| never target:', [k for k in keys if not any(('fish_' + k) in r['fishKeys'][:r['goal']] for r in plan)], '| uses/fish min', min(used[k] for k in keys), 'max', max(used[k] for k in keys), '| avg overlap', round(sum(r['_dbg']['overlap'] for r in plan) / 60, 2))
