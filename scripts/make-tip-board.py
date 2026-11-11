#!/usr/bin/env python3
"""Draws public/ui/new/board_hole.png: the cream tutorial board of the booster first-time pop-up.
A long rounded bar with a round holder bulging above its right end; the hole in the holder is where the real (lit) booster button shows through.
Geometry (picture pixels, 1024 x 300): hole centre (904, 142), hole diameter 176, bar from y 90 to 292; the holder ring is thin so the whole board ends 4 px inside the picture (the booster buttons sit ~10 px from the screen edge). Used by paintSpotBF in src/ui/bf.ts (nine-slice insets 70 / 240)."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
S = 3; W, H = 1024, 300
w, h = W * S, H * S
def mask(draw):
    im = Image.new('L', (w, h), 0); d = ImageDraw.Draw(im); draw(d); return np.asarray(im) > 127
bar = mask(lambda d: d.rounded_rectangle([6 * S, 90 * S, (W - 4) * S, 292 * S], radius=72 * S, fill=255))
lobe = mask(lambda d: d.ellipse([(904 - 116) * S, (142 - 116) * S, (904 + 116) * S, (142 + 116) * S], fill=255))
hole = mask(lambda d: d.ellipse([(904 - 88) * S, (142 - 88) * S, (904 + 88) * S, (142 + 88) * S], fill=255))
body = (bar | lobe) & ~hole                                   # the board silhouette with the hole
dist_in = ndimage.distance_transform_edt(body) / S           # px from the edge, inside
inside = body
NAVY, BLUE, BLUE_L = np.array([9, 38, 108]), np.array([27, 98, 222]), np.array([95, 160, 255])
# the border grows inwards: navy line, then the glossy blue band, then the cream face
img = np.zeros((h, w, 4), np.float32)
yy = np.linspace(0, 1, h)[:, None]
cream_top, cream_bot = np.array([255, 252, 240]), np.array([238, 216, 178])
cream = cream_top[None, None, :] * (1 - yy[..., None]) + cream_bot[None, None, :] * yy[..., None]
cream = np.broadcast_to(cream, (h, w, 3)).copy()
d = dist_in
col = cream.copy()
band_blue = (d < 11) & (d >= 4)
blue = BLUE[None, None, :] * (1 - yy[..., None] * 0.35) + BLUE_L[None, None, :] * (yy[..., None] * 0) # slightly lighter at the top
blue = np.broadcast_to(BLUE[None, None, :] * (0.78 + 0.22 * (1 - yy[..., None])) + BLUE_L[None, None, :] * 0.0, (h, w, 3))
col[band_blue] = blue[band_blue]
# a soft light line along the upper part of the blue band
hl = (d >= 5) & (d < 8) & (yy < 0.45)
col[hl] = col[hl] * 0.55 + BLUE_L * 0.45
col[(d < 4)] = NAVY                                          # outer navy line
col[(d >= 11) & (d < 13)] = col[(d >= 11) & (d < 13)] * 0.8 + np.array([20, 70, 170]) * 0.2   # thin darker edge between blue and cream
# soft shade at the bottom of the face and a white shine along its top
face = d >= 11
shade = face & (yy > 0.78); col[shade] = col[shade] * 0.92
shine = face & (d < 34) & (yy < 0.5) & ~lobe; col[shine] = col[shine] * 0.85 + np.array([255, 255, 255]) * 0.15
alpha = ndimage.gaussian_filter(inside.astype(np.float32), 0.8 * S)
rgba = np.dstack([np.clip(col, 0, 255), alpha * 255]).astype(np.uint8)
out = Image.fromarray(rgba, 'RGBA').resize((W, H), Image.LANCZOS)
out.save('public/ui/new/board_hole.png'); print('saved', out.size)
