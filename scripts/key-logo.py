"""Cuts the logo out of its flat magenta background and saves public/ui/load/logo.png.
Usage: python3 scripts/key-logo.py "<path to the generated logo picture>"   (a solid magenta background, e.g. from ChatGPT)"""
import sys, os
import numpy as np
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); a = np.asarray(im).astype(np.float32)
R, G, B = a[..., 0], a[..., 1], a[..., 2]
d = np.minimum(R, B) - G   # how much like magenta a pixel is
alpha = 1 - np.clip((d - 70) / (150 - 70), 0, 1)
sp = np.clip(d, 0, None) * (alpha < 1)   # despill the fringe
R = R - sp * .85; B = B - sp * .85
rgb = np.clip(np.stack([R, G, B], -1), 0, 255)
res = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')
bb = res.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox(); res = res.crop(bb)
w = 900; res = res.resize((w, round(res.height * w / res.width)), Image.LANCZOS)
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'ui', 'load', 'logo.png'); res.save(out, optimize=True); print(res.size, os.path.getsize(out))
