"""Gives the Backup and target tank pictures a more solid, 3D look (public/ui/tanks): the light rays and sparkles of the Backup water are taken out, the water gets a soft depth shadow
towards the glass, and the glass pictures get a thicker, more solid edge (an inner shadow, a bright rim, a thick bottom slab).
Usage: python3 scripts/tank-art.py <folder holding the original backup_back.png backup_front.png target_front.png>"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
src = sys.argv[1]; out = os.path.join(os.path.dirname(__file__), '..', 'public', 'ui', 'tanks')
def load(n): return np.asarray(Image.open(os.path.join(src, n + '.png')).convert('RGBA')).astype(np.float32)
def save(n, a): Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(out, n + '.png'), optimize=True); print(n, a.shape[1], a.shape[0])
def inside_dist(alpha):   # distance (px) from each pixel to the outside of the shape
    return ndi.distance_transform_edt(alpha > 128)

# ---- backup water: no rays, no sparkles, a depth shadow to the sides ----
a = load('backup_back'); H, W = a.shape[:2]; al = a[..., 3]
lum = a[..., :3] @ np.array([.299, .587, .114], np.float32)
water = (al > 200); sandline = int(H * .74)
div = np.zeros(W, bool)
wide = np.zeros(W, bool)
for cx in (198, 358, 519, 679, 839, 999): div[cx - 6:cx + 7] = True; wide[cx - 28:cx + 12] = True   # the glass bars between the slots stay as they are (only their bright core)
rows = np.arange(H)
for y in range(int(H * .06), sandline):
    cols = water[y] & ~div
    if cols.sum() < 50: continue
    base = np.median(a[y][cols][:, :3], axis=0); bl = base @ np.array([.299, .587, .114], np.float32)
    bright = cols & (lum[y] > bl + 1.5)
    a[y, bright, :3] = base
    zone = water[y] & wide & (lum[y] < 170)   # next to a glass bar: the bar's own bright core is kept, its dark shadows and old rays go
    a[y, zone, :3] = base
# gentle smoothing of what is left of the shimmer along the top, so no streaks come back
sm = ndi.gaussian_filter(a[..., :3], sigma=(2.5, 14, 0)); band = np.zeros((H, W), bool); band[int(H * .06):sandline] = True; band &= water & ~ndi.binary_dilation(div, np.ones(13, bool))[None, :].repeat(H, 0)
a[band, :3] = sm[band]
# depth: darker and a touch bluer towards the glass, lighter in the middle
d = inside_dist(al); k = np.clip(d / 70., 0, 1) ** .8
shade = (.70 + .30 * k)[..., None]; tint = np.array([.86, .93, 1.04], np.float32)
a[..., :3] = a[..., :3] * (shade * (1 - (1 - k)[..., None] * (1 - tint)))
save('backup_back', a)

# ---- glass pictures: a thicker, more solid edge ----
def thicken(name, rim=7, slab=22):
    a = load(name); H, W = a.shape[:2]; al = a[..., 3]
    shape = ndi.binary_fill_holes(al > 20); d = ndi.distance_transform_edt(shape)
    out = a.copy()
    # inner shadow: a dark blue veil along the inside of the rim
    inner = np.clip(1 - (d - 6) / 26., 0, 1) ** 1.6 * (d > 6)
    veil = np.zeros_like(a); veil[..., 0], veil[..., 1], veil[..., 2] = 10, 60, 120; veil[..., 3] = inner * 90
    out = over(out, veil)
    # a bright, thick rim line just inside the edge
    ring = np.exp(-((d - 7) ** 2) / (2 * 2.2 ** 2)); line = np.zeros_like(a); line[..., :3] = (225, 248, 255); line[..., 3] = ring * 235 * (d > 2)
    out = over(out, line)
    # the bottom slab of glass: a thick, brighter band with a dark base line
    ys = np.arange(H)[:, None].repeat(W, 1).astype(np.float32); bottom = np.array([np.where(shape[:, x])[0].max() if shape[:, x].any() else 0 for x in range(W)])[None, :]
    t = np.clip((bottom - ys) / slab, 0, 1.2); slabm = shape & (t < 1) & (ys <= bottom)
    sl = np.zeros_like(a); g = 1 - t; sl[..., 0] = 150 + 90 * g; sl[..., 1] = 215 + 35 * g; sl[..., 2] = 255; sl[..., 3] = np.where(slabm, 110 + 90 * g, 0)
    out = over(out, sl)
    base = np.zeros_like(a); base[..., 0], base[..., 1], base[..., 2] = 12, 70, 130; base[..., 3] = np.where(shape & (np.abs(ys - (bottom - slab)) < 1.3), 120, 0)
    out = over(out, base)
    save(name, out)
def over(dst, srcc):   # srcc over dst, straight alpha
    sa = srcc[..., 3:4] / 255.; da = dst[..., 3:4] / 255.; oa = sa + da * (1 - sa); rgb = (srcc[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    return np.concatenate([rgb, oa * 255.], -1)
thicken('backup_front', rim=8, slab=26); thicken('target_front', rim=7, slab=22)
