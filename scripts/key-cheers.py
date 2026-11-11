"""Cuts the Gemini-made combo cheers (NICE! GREAT! SUPER! WOW!) and the LEVEL COMPLETE! title out of their flat key-colour background and saves public/ui/{nice,great,super,wow}.png.
Usage: python3 scripts/key-cheers.py <folder holding nice.png great.png super.png wow.png>  (magenta background for nice/great, green for super/wow)"""
import sys, os
import numpy as np
from PIL import Image
src = sys.argv[1]; out = os.path.join(os.path.dirname(__file__), '..', 'public', 'ui')
KEY = {'nice': 'm', 'great': 'm', 'super': 'g', 'wow': 'g', 'level_complete': 'm'}
for name, k in KEY.items():
    im = Image.open(os.path.join(src, name + '.png')).convert('RGB'); a = np.asarray(im).astype(np.float32)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    d = (np.minimum(R, B) - G) if k == 'm' else (G - np.maximum(R, B))   # how much like the key colour a pixel is
    lo, hi = (70, 150) if k == "m" else (4, 55)
    alpha = 1 - np.clip((d - lo) / (hi - lo), 0, 1)
    sp = np.clip(d, 0, None) * (alpha < 1)   # despill the fringe: pull the key colour out of the half-transparent edge
    if k == 'm': R = R - sp * .85; B = B - sp * .85
    else: G = G - sp * .85
    rgb = np.clip(np.stack([R, G, B], -1), 0, 255)
    res = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')
    bb = res.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox(); res = res.crop(bb)
    w = 1000 if name == 'level_complete' else 720; res = res.resize((w, round(res.height * w / res.width)), Image.LANCZOS)
    res.save(os.path.join(out, name + '.png'), optimize=True); print(name, res.size)
