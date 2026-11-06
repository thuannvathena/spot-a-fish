#!/usr/bin/env python3
"""Finds the eye of every converted Unity fish on its texture, for the blink effect.

The eyes of these fish are pictures on the texture (an eyeball island with a dark pupil and one white highlight dot), not bones.
For each fish this writes, into public/models/unity/eyes.json:
  u, v  centre of the eye on the texture (0..1, v from the top, like the glb's UVs)
  r     radius of the whole eyeball picture
  lid   the colour the eyeball turns into when the eye closes: the colour of the body picture next to the eyeball on the model
Usage: unity-fish-eyes.py <ExportedProject/Assets dir> <out dir with the fish_NN.glb files> [overlay.png]
"""
import json, os, re, struct, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

def read_glb(f):
    """positions and UVs of all the meshes of a glb, joined"""
    b = open(f, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n]); bin_ = b[20 + n + 8:]
    ac, bv = j['accessors'], j['bufferViews']; P, U = [], []
    def get(i, dt, k):
        a = ac[i]; v = bv[a['bufferView']]; o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        return np.frombuffer(bin_, dtype=dt, count=a['count'] * k, offset=o).reshape(-1, k)
    for m in j['meshes']:
        A = m['primitives'][0]['attributes']; P.append(get(A['POSITION'], np.float32, 3)); U.append(get(A['TEXCOORD_0'], np.float32, 2))
    return np.concatenate(P), np.concatenate(U)

def find_eye(img):
    """img: RGBA uint8 (square). Returns (u, v, R) in 0..1 or None."""
    s = 512; im = np.asarray(img.resize((s, s), Image.LANCZOS).convert('RGB')).astype(np.float32)
    lum = im @ np.array([.299, .587, .114]); mn = im.min(2)
    white = (lum > 244) & (mn > 232)
    lab, nl = ndimage.label(white); best = None
    for i in range(1, nl + 1):
        ys, xs = np.nonzero(lab == i); a = len(ys)
        if a < 12 or a > 1500: continue
        h = np.ptp(ys) + 1; w = np.ptp(xs) + 1
        if max(h, w) / max(1, min(h, w)) > 1.8 or a < 0.55 * h * w: continue   # a round dot
        cy, cx = ys.mean(), xs.mean(); r = max(h, w) / 2
        yy, xx = np.ogrid[:s, :s]; d = np.hypot(yy - cy, xx - cx)
        ring = (d > 1.6 * r) & (d < 3.2 * r); dark = lum[ring].mean()
        if dark > 105: continue                                     # a highlight sits in a dark pupil
        if best is None or dark < best[0]: best = (dark, cx, cy, r)
    if not best: return None
    _, cx, cy, r = best
    # the pupil: the dark blob around the highlight (its centre is the centre of the eye; the highlight sits off to one side)
    dark = lum < 115; lab2, _ = ndimage.label(dark | (np.hypot(*np.mgrid[:s, :s] - np.array([cy, cx])[:, None, None]) < r * 1.5))
    comp = lab2 == lab2[int(cy), int(cx)]; ys, xs = np.nonzero(comp)
    ok = np.hypot(ys - cy, xs - cx) < 60                       # (a dark stripe next to the pupil must not drag the centre away)
    if ok.sum() > 20: ys, xs = ys[ok], xs[ok]
    ccy, ccx = ys.mean(), xs.mean(); rp = max(r * 2.0, np.sqrt(len(ys) / np.pi))
    return ccx / s, ccy / s, min(0.15, rp * 3.0 / s)

# four textures where the highlight dot is not a clean round blob: eye centre and radius read off the texture by eye
MANUAL = {4: (.85, .16, .095), 10: (.17, .18, .095), 17: (.19, .15, .055), 20: (.83, .71, .10)}

def run(assets, out, overlay=None):
    keep = json.load(open(os.path.join(out, 'list.json'))); eyes = {}; tiles = []
    sys.path.insert(0, os.path.dirname(__file__))
    import importlib.util
    spec = importlib.util.spec_from_file_location('conv', os.path.join(os.path.dirname(__file__), 'unity-fish-to-glb.py')); conv = importlib.util.module_from_spec(spec); spec.loader.exec_module(conv)
    tex_g, mat_g = conv.guid_map(assets, 'Texture2D'), conv.guid_map(assets, 'Material')
    for fn in keep:
        k = int(re.search(r'\d+', fn).group()); pf = open(f'{assets}/GameObject/Fish_{k}.prefab').read()
        smr = [t for kk, (c, t) in conv.blocks(pf).items() if c == 137][0]
        mg = re.search(r'm_Materials:\n  - \{[^}]*guid: ([0-9a-f]{32})', smr).group(1); mt = open(mat_g[mg]).read()
        tg = re.search(r'_BaseMap:\n\s+m_Texture: \{[^}]*guid: ([0-9a-f]{32})', mt).group(1)
        img = Image.open(tex_g[tg]).convert('RGBA'); e = find_eye(img) or MANUAL.get(k)
        if not e: print('no eye found for', fn); continue
        u, v, R = e; pos, uv = read_glb(os.path.join(out, fn))
        d = np.hypot((uv[:, 0] - u), (uv[:, 1] - v)); eye_v = d < R * 1.15; body_v = d > R * 1.6
        # body next to the eyeball: the body vertices closest (in 3D) to the eyeball vertices
        lid = [200, 200, 200]
        if eye_v.any() and body_v.any():
            ep = pos[eye_v].mean(0); dd = np.linalg.norm(pos - ep, axis=1); dd[~body_v] = 1e9; near = np.argsort(dd)[:24]
            arr = np.asarray(img.convert('RGB')); h, w = arr.shape[:2]; cols = []
            for i in near:
                x = int(np.clip(uv[i, 0] * w, 0, w - 1)); y = int(np.clip(uv[i, 1] * h, 0, h - 1)); cols.append(arr[y, x])
            lid = np.median(np.array(cols), axis=0).astype(int).tolist()
        eyes[f'fish_{k:02d}'] = dict(u=round(u, 4), v=round(v, 4), r=round(R, 4), lid=[round(c / 255, 3) for c in lid])
        if overlay:
            t = img.resize((256, 256)).convert('RGB'); dr = ImageDraw.Draw(t); dr.ellipse([ (u - R) * 256, (v - R) * 256, (u + R) * 256, (v + R) * 256 ], outline=(255, 0, 255), width=2)
            dr.rectangle([0, 0, 40, 14], fill=tuple(lid)); dr.text((2, 1), str(k), fill=(0, 0, 0)); tiles.append(t)
    json.dump(eyes, open(os.path.join(out, 'eyes.json'), 'w'), indent=0)
    if overlay and tiles:
        cols = 6; rows = (len(tiles) + cols - 1) // cols; sheet = Image.new('RGB', (cols * 256, rows * 256))
        for i, t in enumerate(tiles): sheet.paste(t, ((i % cols) * 256, (i // cols) * 256))
        sheet.save(overlay)
    print(len(eyes), 'eyes found')

if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
