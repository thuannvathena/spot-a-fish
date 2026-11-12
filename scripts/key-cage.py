"""Cuts the steel frame pieces for the Backup out of the ChatGPT sheet (solid magenta background) and writes them as transparent PNGs in public/ui/tanks."""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
src = sys.argv[1]
im = Image.open(src).convert('RGB'); a = np.array(im).astype(float)
# distance from pure magenta decides the alpha; the magenta fringe is pulled out of the colour
mag = np.array([255, 0, 255], float)
d = np.sqrt(((a - mag) ** 2).sum(-1))
alpha = np.clip((d - 60) / 110, 0, 1)
rgb = a.copy()
spill = np.clip(1 - alpha, 0, 1)
# remove magenta tint: where the colour is a mix, subtract the magenta share
share = np.clip((a[..., 0] + a[..., 2]) / 2 - a[..., 1] - 20, 0, 255)
rgb[..., 0] = np.clip(rgb[..., 0] - share * spill * .9, 0, 255); rgb[..., 2] = np.clip(rgb[..., 2] - share * spill * .9, 0, 255)
out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
full = Image.fromarray(out, 'RGBA')
boxes = {'cage_rail_h': (68, 110, 1185, 263), 'cage_rail_v': (113, 347, 267, 1146), 'cage_bar': (1019, 419, 1102, 1061), 'cage_corner': (439, 540, 845, 936)}
for n, (x0, y0, x1, y1) in boxes.items():
    c = full.crop((x0 - 4, y0 - 4, x1 + 5, y1 + 5)); c.save(f'public/ui/tanks/{n}.png'); print(n, c.size)
