"""Draws public/ui/bf/ic_vib_on.png in the same style as the other Settings icons: a white phone with a thick black outline and white zigzag waves. (Matches ic_vib_off.png, which has the slash.)"""
from PIL import Image, ImageDraw
import os
S = 4; W, H = 148, 151
def canvas(): return Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
def box(x0, y0, x1, y1): return [x0 * S, y0 * S, x1 * S, y1 * S]
black = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0)); white = canvas()
db, dw = ImageDraw.Draw(black), ImageDraw.Draw(white)
# phone: body + screen hole + home button
OUT = 5
db.rounded_rectangle(box(34 - OUT, 3 - OUT, 114 + OUT, 148 + OUT), radius=(18 + OUT) * S, fill=(8, 14, 30, 255))
dw.rounded_rectangle(box(34, 3, 114, 148), radius=18 * S, fill=(255, 255, 255, 255))
# waves (zigzags) at both sides
def zig(side, x0, x1, ys):
    pts = []
    for i, y in enumerate(ys): pts.append(((x0 if i % 2 == 0 else x1) * S, y * S))
    return pts
for pts in (zig('l', 8, 22, [30, 48, 66, 84, 102]), zig('r', 140, 126, [30, 48, 66, 84, 102])):
    db.line(pts, fill=(8, 14, 30, 255), width=int((9 + OUT * 2) * S), joint='curve')
for pts in (zig('l', 8, 22, [30, 48, 66, 84, 102]), zig('r', 140, 126, [30, 48, 66, 84, 102])):
    dw.line(pts, fill=(255, 255, 255, 255), width=int(9 * S), joint='curve')
    for p in (pts[0], pts[-1]):
        r = 4.5 * S; db.ellipse([p[0] - r - OUT * S, p[1] - r - OUT * S, p[0] + r + OUT * S, p[1] + r + OUT * S], fill=(8, 14, 30, 255)); dw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(255, 255, 255, 255))
img = canvas(); img.alpha_composite(black); img.alpha_composite(white)
d = ImageDraw.Draw(img)
# screen: a black frame with a clear (see-through) window, and the home button
d.rounded_rectangle(box(44, 24, 104, 106), radius=5 * S, fill=(8, 14, 30, 255))
d.rounded_rectangle(box(49, 29, 99, 101), radius=3 * S, fill=(0, 0, 0, 0))
d.rounded_rectangle(box(56, 116, 92, 130), radius=7 * S, fill=(8, 14, 30, 255))
img = img.resize((W, H), Image.LANCZOS)
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'ui', 'bf', 'ic_vib_on.png'); img.save(out, optimize=True); print('saved', out)
