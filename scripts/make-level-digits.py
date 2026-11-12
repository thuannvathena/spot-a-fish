"""Rebuilds the ten digits of the level lettering (public/ui/new/lv_tier{0,1,2}.png + lv_font.json) from three Gemini sheets in which the digits are spaced far apart (so nothing overlaps when they are cut out): one row 0-9 per tier, on a key colour (tier 0 blue on magenta, 1 Hard purple on green, 2 Super Hard red on green).
The word LEVEL is kept from the existing atlas. Usage: python3 scripts/make-level-digits.py <t0.png> <t1.png> <t2.png> [<folder with the original lv_tier*.png + lv_font.json>]"""
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'ui', 'new'); srcs = sys.argv[1:4]; orig = sys.argv[4] if len(sys.argv) > 4 else out
KEY = {0: 'm', 1: 'g', 2: 'g'}; TARGET_H = 130; meta = json.load(open(os.path.join(orig, 'lv_font.json')))
def keyed(path, k):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32); R, G, B = a[..., 0], a[..., 1], a[..., 2]
    d = (np.minimum(R, B) - G) if k == 'm' else (G - np.maximum(R, B)); lo, hi = (70, 150) if k == 'm' else (30, 100)
    pure = d > 180; rowf = pure.mean(1); cut = a.shape[0]   # below the real picture some downloads hold a smeared copy of it: stop at the first row that is entirely key colour below the digits (a looser test cut the round bottoms of the digits off flat)
    ys = [y for y in range(a.shape[0] // 3, a.shape[0]) if rowf[y] > .9995 and rowf[y - 1] <= .9995]
    if ys: cut = ys[0]
    R, G, B, d = R[:cut], G[:cut], B[:cut], d[:cut]; a = a[:cut]
    al = 1 - np.clip((d - lo) / (hi - lo), 0, 1); sp = np.clip(d, 0, None) * (al < 1)
    if k == 'm': R = R - sp * .85; B = B - sp * .85
    else: G = G - sp * .85
    blk = a.max(-1) < 45; lb, nb = ndi.label(blk); edge = set(np.unique(np.concatenate([lb[0], lb[-1], lb[:, 0], lb[:, -1]]))) - {0}   # the black bars / rounded corners of the download are not part of the picture
    if edge: al = np.where(np.isin(lb, list(edge)), 0, al)
    return np.dstack([np.clip(np.stack([R, G, B], -1), 0, 255), al * 255]).astype(np.uint8)
for t in (0, 1, 2):
    arr = np.pad(keyed(srcs[t], KEY[t]), ((12, 12), (12, 12), (0, 0))); A = arr[..., 3] > 40;   # padded: the closing below erodes whatever touches the border of the array, which cut the round bottoms off flat
    lab, n = ndi.label(ndi.binary_closing(A, iterations=3))
    objs = ndi.find_objects(lab); area = ndi.sum(A, lab, range(1, n + 1))
    big = [(i, objs[i]) for i in range(n) if area[i] > .25 * area.max()]; big.sort(key=lambda p: p[1][1].start)
    assert len(big) == 10, (t, len(big), sorted(area)[-12:])
    gaps = [big[i + 1][1][1].start - big[i][1][1].stop for i in range(9)]; print('tier', t, 'min gap px', min(gaps))
    glyphs = []
    for i, sl in big:
        m = (lab[sl] == i + 1); m = ndi.binary_dilation(m, iterations=2)   # keeps the soft edge of the glyph, nothing of its neighbours (they are far away)
        g = arr[sl].copy(); g[..., 3] = np.where(m, g[..., 3], 0); ys, xs = np.nonzero(g[..., 3] > 8); g = g[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        al = g[..., 3].astype(np.float32); solid = al >= 250   # edge pixels carry some of the key colour: take the colour of the nearest solid pixel (the white outline) instead, and pull the alpha in a little so no halo is left
        idx = ndi.distance_transform_edt(~solid, return_indices=True)[1]; g[..., :3] = g[..., :3][idx[0], idx[1]]; g[..., 3] = np.clip((al - 70) / (255 - 70), 0, 1) * 255
        glyphs.append(Image.fromarray(g, 'RGBA'))
    hs = [g.height for g in glyphs]; sc = TARGET_H / float(np.median(hs))   # one scale for all ten, so their relative sizes stay as drawn
    glyphs = [g.convert('RGBa').resize((max(1, round(g.width * sc)), max(1, round(g.height * sc))), Image.LANCZOS).convert('RGBA') for g in glyphs]   # resized with premultiplied colour, so the edge keeps its own colour
    old = Image.open(os.path.join(orig, f'lv_tier{t}.png')).convert('RGBA'); wx, wy, ww, wh = meta[str(t)]['word']; word = old.crop((wx, wy, wx + ww, wy + wh))
    W = max(ww, sum(g.width for g in glyphs) + 4 * 9); H = wh + 6 + max(g.height for g in glyphs)
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0)); atlas.alpha_composite(word, (0, 0)); boxes = []; x = 0
    for g in glyphs: atlas.alpha_composite(g, (x, wh + 6)); boxes.append([x, wh + 6, g.width, g.height]); x += g.width + 4
    atlas.save(os.path.join(out, f'lv_tier{t}.png'), optimize=True); meta[str(t)] = {'word': [0, 0, ww, wh], 'd': boxes}; print(t, atlas.size, [b[2] for b in boxes])
json.dump(meta, open(os.path.join(out, 'lv_font.json'), 'w'))
