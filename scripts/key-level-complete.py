"""Makes public/ui/level_complete.png from a ChatGPT picture of LEVEL COMPLETE! on a flat magenta (#FF00FF) background.
The letters' own glossy fill is kept; the dark outline of the generated picture is dropped and redrawn like the cheer words (NICE! GREAT!...): a thin white ring, then one dark warm outline.
Usage: python3 scripts/key-level-complete.py <generated.png>"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
a = np.array(Image.open(sys.argv[1]).convert('RGB')).astype(float)
d = np.sqrt(((a - np.array([255, 0, 255], float)) ** 2).sum(-1)); alpha = np.clip((d - 70) / 110, 0, 1)
share = np.clip((a[..., 0] + a[..., 2]) / 2 - a[..., 1] - 25, 0, 255); spill = np.clip(1 - alpha, 0, 1)
rgb = a.copy(); rgb[..., 0] = np.clip(rgb[..., 0] - share * spill * .9, 0, 255); rgb[..., 2] = np.clip(rgb[..., 2] - share * spill * .9, 0, 255)
body = (alpha > .6) & (rgb.max(-1) > 150) & (rgb[..., 0] > 170)
body = ndi.binary_fill_holes(ndi.binary_closing(ndi.binary_opening(body, iterations=1), iterations=2))
lab, n = ndi.label(body); sizes = ndi.sum(body, lab, range(1, n + 1)); body = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 3000])   # specks out, the dot of "!" stays
ys, xs = np.where(body); pad = 40; x0, y0, x1, y1 = max(0, xs.min() - pad), max(0, ys.min() - pad), min(a.shape[1], xs.max() + pad), min(a.shape[0], ys.max() + pad)
rgb = rgb[y0:y1, x0:x1]; body = body[y0:y1, x0:x1]; sc = 1028 / (x1 - x0)
rI = Image.fromarray(rgb.astype(np.uint8)).resize((1028, int(body.shape[0] * sc)), Image.LANCZOS); rgb = np.array(rI).astype(float)
body = np.array(Image.fromarray((body * 255).astype(np.uint8)).resize(rI.size, Image.LANCZOS)) > 127; H, W = body.shape
def grow(m, r):
    yy, xx = np.ogrid[-r:r + 1, -r:r + 1]; return ndi.binary_dilation(m, structure=(xx * xx + yy * yy) <= r * r)
soft = lambda m: ndi.gaussian_filter(m.astype(np.float32), .9)
A_dark, A_white, A_body = soft(grow(body, 19)), soft(grow(body, 4)), soft(body)
col = np.zeros((H, W, 3), np.float32); col[:] = np.array([74, 30, 10]) / 255
col = col * (1 - A_white[..., None]) + np.array([1, .98, .92]) * A_white[..., None]
bc = rgb / 255
lum = bc[..., 1]; k = np.clip((lum - .42) / .5, 0, 1)[..., None]   # re-coloured by brightness: a deep red-orange in the shade, a golden yellow in the light, so the letters stand out from green, blue or pink backgrounds
lo = np.array([212, 62, 12]) / 255; mid = np.array([255, 128, 22]) / 255; hi = np.array([255, 214, 70]) / 255
bc = np.where(k < .6, lo + (mid - lo) * (k / .6), mid + (hi - mid) * ((k - .6) / .4))
col = col * (1 - A_body[..., None]) + bc * A_body[..., None]
Image.fromarray((np.clip(np.dstack([col, A_dark]), 0, 1) * 255).astype(np.uint8), 'RGBA').save('public/ui/level_complete.png', optimize=True)
