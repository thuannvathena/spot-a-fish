"""Cuts the Gemini-made LEVEL + 0-9 lettering sheets (one per tier: 0 normal sky-blue on magenta, 1 Hard purple on green, 2 Super Hard red on green) out of their key colour,
splits the word and the ten digits and packs them into public/ui/new/lv_tier{t}.png (word on top, digits below) + one public/ui/new/lv_font.json with the boxes.
Usage: python3 scripts/slice-level-font.py <folder holding t0.png t1.png t2.png>"""
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
src = sys.argv[1]; out = os.path.join(os.path.dirname(__file__), '..', 'public', 'ui', 'new')
KEY = {0: 'm', 1: 'g', 2: 'g'}; meta = {}
def keyed(path, k):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32); R, G, B = a[..., 0], a[..., 1], a[..., 2]
    d = (np.minimum(R, B) - G) if k == 'm' else (G - np.maximum(R, B)); lo, hi = (70, 150) if k == 'm' else (30, 100)
    al = 1 - np.clip((d - lo) / (hi - lo), 0, 1); sp = np.clip(d, 0, None) * (al < 1)
    if k == 'm': R = R - sp * .85; B = B - sp * .85
    else: G = G - sp * .85
    return np.dstack([np.clip(np.stack([R, G, B], -1), 0, 255), al * 255]).astype(np.uint8)

def tidy(piece, thick):
    """keeps only what belongs to this glyph: its coloured body (any piece that is not a tiny sliver of a neighbour) plus the white outline within `thick` px of it, then trims to the tight box"""
    a = np.asarray(piece).copy(); alpha = a[..., 3] > 30; body = alpha & (a[..., :3].min(-1) < 215)
    lab, n = ndi.label(body)
    if n:
        sizes = ndi.sum(body, lab, range(1, n + 1)); keep = np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v > 0.02 * sizes.max()])
        near = ndi.distance_transform_edt(~keep) <= thick; a[..., 3] = np.where(near, a[..., 3], 0)
    ys, xs = np.nonzero(a[..., 3] > 30); return Image.fromarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA')
def outline_px(arr, y0, y1):   # white outline thickness, measured on the word LEVEL (its letters are clean): how far the outline pixels lie from the coloured body
    band = arr[y0:y1]; al = band[..., 3] > 30; body = al & (band[..., :3].min(-1) < 215); d = ndi.distance_transform_edt(~body)
    return int(np.percentile(d[al & ~body], 99)) + 2
def runs(mask):   # [start, end) of the True runs
    r = []; s = None
    for i, v in enumerate(mask):
        if v and s is None: s = i
        if not v and s is not None: r.append((s, i)); s = None
    if s is not None: r.append((s, len(mask)))
    return r
for t in (0, 1, 2):
    arr = keyed(os.path.join(src, f't{t}.png'), KEY[t]); A = arr[..., 3] > 30
    rows = [r for r in runs(A.any(1)) if r[1] - r[0] > 40]; assert len(rows) == 2, (t, rows)
    pieces = []
    for (y0, y1) in rows:
        band = A[y0:y1]; cols = runs(band.any(0)); pieces.append((y0, y1, cols))
    wy0, wy1, wcols = pieces[0]; dy0, dy1, dcols = pieces[1]
    dcols = [c for c in dcols if c[1] - c[0] > 30]
    if len(dcols) != 10:   # touching digits (their white outlines merge): cut each seam where the columns hold the fewest coloured (non-white) pixels
        x0, x1 = dcols[0][0], dcols[-1][1]; w = (x1 - x0) / 10; band = arr[dy0:dy1]; inner = ((band[..., 3] > 30) & (band[..., :3].min(-1) < 225)).sum(0)
        cuts = [x0]
        for i in range(1, 10):
            c = int(x0 + i * w); lo, hi = max(cuts[-1] + 40, c - int(w * .3)), min(x1 - 40, c + int(w * .3)); cuts.append(lo + int(np.argmin(inner[lo:hi])))
        cuts.append(x1); dcols = [(cuts[i], cuts[i + 1]) for i in range(10)]
    wx0, wx1 = wcols[0][0], wcols[-1][1]
    thick = outline_px(arr, wy0, wy1); print('outline', thick)
    img = Image.fromarray(arr, 'RGBA'); sc = 0.5   # keep the sheet's resolution halved: letters stay ~ 300 px high at most
    word = tidy(img.crop((wx0, wy0, wx1, wy1)), thick); digs = [tidy(img.crop((a, dy0, b, dy1)), thick) for a, b in dcols]
    word = word.resize((round(word.width * sc), round(word.height * sc)), Image.LANCZOS); digs = [d.resize((round(d.width * sc), round(d.height * sc)), Image.LANCZOS) for d in digs]
    W = max(word.width, sum(d.width for d in digs) + 4 * 9); H = word.height + 6 + max(d.height for d in digs)
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0)); atlas.alpha_composite(word, (0, 0)); box = {'word': [0, 0, word.width, word.height], 'd': []}; x = 0
    for d in digs: atlas.alpha_composite(d, (x, word.height + 6)); box['d'].append([x, word.height + 6, d.width, d.height]); x += d.width + 4
    atlas.save(os.path.join(out, f'lv_tier{t}.png'), optimize=True); meta[t] = box; print(t, atlas.size, 'word', word.size, 'digit h', digs[0].height)
json.dump(meta, open(os.path.join(out, 'lv_font.json'), 'w'))
