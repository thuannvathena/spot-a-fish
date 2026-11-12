"""Makes the pictured words easier to read: the pastel fill gets a more vivid colour and a thin dark outline is added outside the white stroke.
Applies to public/ui/{nice,great,super,wow,level_complete}.png and public/ui/bf/nf_title.png (run on the originals, not on a result of this script).
Usage: python3 scripts/text-pics.py <folder holding the original nice.png great.png super.png wow.png level_complete.png nf_title.png>"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
src = sys.argv[1]; root = os.path.join(os.path.dirname(__file__), '..', 'public', 'ui')
COOL, WARM = (14, 34, 88), (74, 30, 10)
JOBS = {'nice': ('nice.png', COOL, 9, True), 'great': ('great.png', COOL, 9, True), 'super': ('super.png', WARM, 9, True), 'wow': ('wow.png', COOL, 9, True),
        'level_complete': ('level_complete.png', WARM, 11, True), 'nf_title': ('bf/nf_title.png', COOL, 11, False)}
def hsv(rgb):
    mx = rgb.max(-1); mn = rgb.min(-1); d = mx - mn + 1e-9; r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6.0
    return h, np.where(mx > 0, d / np.maximum(mx, 1e-6), 0), mx
def rgb_of(h, s, v):
    i = np.floor(h * 6).astype(int) % 6; f = h * 6 - np.floor(h * 6); p = v * (1 - s); q = v * (1 - f * s); t = v * (1 - (1 - f) * s); o = np.zeros(h.shape + (3,), np.float32)
    for k, (cr, cg, cb) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        m = i == k; o[..., 0] = np.where(m, cr, o[..., 0]); o[..., 1] = np.where(m, cg, o[..., 1]); o[..., 2] = np.where(m, cb, o[..., 2])
    return o
for key, (rel, col, rad, vivid) in JOBS.items():
    im = Image.open(os.path.join(src, os.path.basename(rel))).convert('RGBA'); a = np.asarray(im).astype(np.float32) / 255.
    if vivid:   # the coloured body (not the white stroke, not the small sparkles' white): more saturated, a little darker
        h, s, v = hsv(a[..., :3]); body = (s > .10) & (a[..., 3] > .5)
        s2 = np.where(body, np.clip(s * 1.75 + .16, 0, 1), s); v2 = np.where(body, np.clip(v * .9, 0, 1), v)
        a = np.dstack([rgb_of(h, s2, v2), a[..., 3]])
    pad = rad + 3; A = np.pad(a, ((pad, pad), (pad, pad), (0, 0)))
    solid = A[..., 3] > .30; yy, xx = np.ogrid[-rad:rad + 1, -rad:rad + 1]; disk = (xx * xx + yy * yy) <= rad * rad
    out = ndi.binary_dilation(solid, structure=disk)
    edge = ndi.gaussian_filter(out.astype(np.float32), 0.8)
    base = np.zeros_like(A); base[..., 0], base[..., 1], base[..., 2] = col[0] / 255., col[1] / 255., col[2] / 255.; base[..., 3] = edge
    res = base.copy(); al = A[..., 3:4]; res[..., :3] = A[..., :3] * al + base[..., :3] * (1 - al) * 1.0; res[..., 3] = np.clip(al[..., 0] + base[..., 3] * (1 - al[..., 0]), 0, 1)
    dst = os.path.join(root, rel); Image.fromarray((np.clip(res, 0, 1) * 255).astype(np.uint8), 'RGBA').save(dst, optimize=True); print(key, Image.open(dst).size)
