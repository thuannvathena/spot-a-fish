#!/usr/bin/env python3
"""Converts a rigged fish from a Unity project export (prefab + mesh asset + texture) into one skinned .glb.

Usage: unity-fish-to-glb.py <ExportedProject/Assets dir> <Fish_N prefab name> <out.glb> [--tex-size 512]

What it reads:
  - the prefab (YAML): the bone hierarchy (names, local transforms) and the SkinnedMeshRenderer (bone order, mesh, material)
  - the mesh asset (YAML): vertices, normals, UVs, bone weights/indices, index buffer, bind poses
  - the material and its base texture (png)
Unity is left-handed, glTF is right-handed: z is mirrored (positions, normals, rotations, matrices) and triangle winding is reversed.
"""
import base64, heapq, json, os, re, struct, sys
import numpy as np
from PIL import Image
import io

def blocks(text):
    """Unity YAML -> {fileID: (classID, text)}"""
    out = {}
    for m in re.finditer(r'--- !u!(\d+) &(-?\d+)[^\n]*\n(.*?)(?=\n--- !u!|\Z)', text, re.S):
        out[m.group(2)] = (int(m.group(1)), m.group(3))
    return out

def fid(s):
    m = re.search(r'fileID: (-?\d+)', s); return m.group(1) if m else '0'

def vec(block, key, n=3):
    m = re.search(key + r': \{' + ', '.join(f'{c}: ([^,}}]+)' for c in 'xyzw'[:n]) + r'\}', block)
    return [float(x) for x in m.groups()]

def guid_map(root, sub):
    g = {}
    d = os.path.join(root, sub)
    for f in os.listdir(d):
        if f.endswith('.meta'):
            t = open(os.path.join(d, f), errors='ignore').read()
            m = re.search(r'guid: ([0-9a-f]{32})', t)
            if m: g[m.group(1)] = os.path.join(d, f[:-5])
    return g


def simplify(pos, nor, uv, jnt, w, idx, target):
    """Quadric edge-collapse that keeps the texture and the skin intact.
    Only a vertex that is NOT on a texture seam and NOT on an open border may be merged into a neighbour (the neighbour keeps its UV and weights),
    so UV islands never tear. The cost is the quadric error plus a penalty for stretching the UV."""
    nv = len(pos); T = [list(map(int, t)) for t in idx]; alive = [True] * len(T); live = len(T)
    P = pos.astype(np.float64)
    q = np.round(P, 5); uniq, pid = np.unique(q, axis=0, return_inverse=True); pid = pid.ravel(); cnt = np.bincount(pid)
    seam = cnt[pid] > 1
    ec = {}
    for t in T:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            k = (min(pid[a], pid[b]), max(pid[a], pid[b])); ec[k] = ec.get(k, 0) + 1
    border = np.zeros(nv, bool)
    for t in T:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            if ec[(min(pid[a], pid[b]), max(pid[a], pid[b]))] == 1: border[a] = border[b] = True
    movable = ~(seam | border)
    def plane(t):
        a, b, c = P[t[0]], P[t[1]], P[t[2]]; n = np.cross(b - a, c - a); ar = np.linalg.norm(n)
        if ar < 1e-12: return None, 0.0
        n = n / ar; return np.append(n, -n @ a), ar / 2
    Q = [np.zeros((4, 4)) for _ in range(nv)]; vf = [set() for _ in range(nv)]
    for fi, t in enumerate(T):
        pl, ar = plane(t)
        for v in t: vf[v].add(fi)
        if pl is not None:
            M = np.outer(pl, pl) * ar
            for v in t: Q[v] += M
    scale = float(np.ptp(P, axis=0).max()); uvw = (scale * 0.02) ** 2 * 40
    def cost(a, b):   # a merges into b
        pb = np.append(P[b], 1.0); Qs = Q[a] + Q[b]; return float(pb @ Qs @ pb) + uvw * float(np.sum((uv[a] - uv[b]) ** 2)) / max(scale * scale, 1e-9) * 0 + float(np.sum((uv[a] - uv[b]) ** 2)) * scale * scale * 3
    ver = [0] * nv; heap = []
    def nbrs(v):
        out = set()
        for fi in vf[v]:
            for u in T[fi]:
                if u != v: out.add(u)
        return out
    def push(a, b):
        if movable[a]: heapq.heappush(heap, (cost(a, b), ver[a], ver[b], a, b))
    for v in range(nv):
        for u in nbrs(v): push(v, u)
    def valid(a, b):
        for fi in vf[a]:
            t = T[fi]
            if b in t: continue
            n0, _ = plane(t); t2 = [b if x == a else x for x in t]
            old = P.copy()
            n1, _ = (None, 0)
            pa, pb2, pc = [P[b] if x == a else P[x] for x in t]
            nn = np.cross(pb2 - pa, pc - pa); l = np.linalg.norm(nn)
            if l < 1e-12: return False
            if n0 is not None and (nn / l) @ n0[:3] < 0.25: return False
        return True
    while live > target and heap:
        c, va, vb, a, b = heapq.heappop(heap)
        if va != ver[a] or vb != ver[b] or not movable[a]: continue
        if not any(b in T[fi] for fi in vf[a]): continue
        if not valid(a, b): continue
        for fi in list(vf[a]):
            t = T[fi]
            if b in t:
                alive[fi] = False; live -= 1
                for v in t: vf[v].discard(fi)
            else:
                T[fi] = [b if x == a else x for x in t]; vf[a].discard(fi); vf[b].add(fi)
        Q[b] = Q[b] + Q[a]; ver[b] += 1; ver[a] += 1; movable[a] = False
        for u in nbrs(b): ver[u] += 0; push(u, b); push(b, u)
    keep = [i for i, t in enumerate(T) if alive[i]]
    used = sorted({v for i in keep for v in T[i]}); remap = {v: k for k, v in enumerate(used)}
    nidx = np.array([[remap[v] for v in T[i]] for i in keep], np.uint32)
    return pos[used], nor[used], uv[used], jnt[used], w[used], nidx

def read_smr(assets, smr, ratio, name):
    """One SkinnedMeshRenderer -> its bone fileIDs, game object, material/texture guids and the converted vertex data."""
    bones = [fid(x) for x in re.findall(r'^  - (\{fileID: -?\d+\})', re.search(r'm_Bones:\n((?:  - \{[^\n]*\}\n)+)', smr).group(1), re.M)]
    go = fid(re.search(r'm_GameObject: (\{[^}]*\})', smr).group(1))
    mesh_guid = re.search(r'm_Mesh: \{[^}]*guid: ([0-9a-f]{32})', smr).group(1)
    mat_guid = re.search(r'm_Materials:\n  - \{[^}]*guid: ([0-9a-f]{32})', smr).group(1)
    mesh_path = guid_map(assets, 'Mesh')[mesh_guid]
    mt = open(mesh_path).read()
    nv = int(re.search(r'm_VertexCount: (\d+)', mt).group(1))
    ch = [tuple(map(int, c)) for c in re.findall(r'- stream: (\d+)\n\s+offset: (\d+)\n\s+format: (\d+)\n\s+dimension: (\d+)', mt)]
    raw = bytes.fromhex(re.search(r'_typelessdata: ([0-9a-f]*)', mt).group(1))
    FMT = {0: (np.float32, 4), 1: (np.float16, 2), 10: (np.int32, 4), 11: (np.int32, 4)}
    strides = {}   # a stream's stride is the sum of its channels; streams are laid out one after the other, 16-byte aligned
    for s_, o, f, d in ch:
        if d: strides[s_] = max(strides.get(s_, 0), o + FMT[f][1] * (d & 15))
    base, start = 0, {}
    for s_ in sorted(strides):
        start[s_] = base; base += strides[s_] * nv; base = (base + 15) & ~15
    def chan(i):
        s_, o, f, d = ch[i]; dt, sz = FMT[f]
        a = np.empty((nv, d), dt)
        for v in range(nv): a[v] = np.frombuffer(raw, dt, d, start[s_] + v * strides[s_] + o)
        return a
    pos = chan(0).astype(np.float32); nor = chan(1).astype(np.float32); uv = chan(4).astype(np.float32)
    if ch[12][3] == 0:   # a rigid part (eyeballs): no weights, every vertex follows exactly one bone
        j1 = chan(13).astype(np.int32); jnt = np.zeros((nv, 4), np.int32); jnt[:, 0] = j1[:, 0]; wts = np.zeros((nv, 4), np.float32); wts[:, 0] = 1.0
    else: wts = chan(12).astype(np.float32); jnt = chan(13).astype(np.int32)
    idx = np.frombuffer(bytes.fromhex(re.search(r'm_IndexBuffer: ([0-9a-f]*)', mt).group(1)), np.uint16 if int(re.search(r'm_IndexFormat: (\d)', mt).group(1)) == 0 else np.uint32).astype(np.uint32).reshape(-1, 3)
    bp = re.search(r'm_BindPose:\n(.*?)\n  m_BoneNameHashes', mt, re.S).group(1)
    binds = [np.array([float(x) for x in m.groups()], np.float64).reshape(4, 4) for m in re.finditer(r'- e00: (\S+)\n\s+e01: (\S+)\n\s+e02: (\S+)\n\s+e03: (\S+)\n\s+e10: (\S+)\n\s+e11: (\S+)\n\s+e12: (\S+)\n\s+e13: (\S+)\n\s+e20: (\S+)\n\s+e21: (\S+)\n\s+e22: (\S+)\n\s+e23: (\S+)\n\s+e30: (\S+)\n\s+e31: (\S+)\n\s+e32: (\S+)\n\s+e33: (\S+)', bp)]
    if len(binds) != len(bones): raise SystemExit(f'{name}: {len(binds)} bind poses but {len(bones)} bones')
    S = np.diag([1, 1, -1, 1.0]); ibm = [(S @ b @ S) for b in binds]   # mirrored z; glTF stores column-major, numpy row-major -> transpose on write
    pos[:, 2] *= -1; nor[:, 2] *= -1; idx = idx[:, ::-1].copy()
    uv[:, 1] = 1.0 - uv[:, 1]                                           # Unity's texture origin is bottom-left, glTF's is top-left
    w = wts / np.maximum(wts.sum(1, keepdims=True), 1e-8)
    if ratio < 1.0: pos, nor, uv, jnt, w, idx = simplify(pos, nor, uv, jnt, w, idx, int(len(idx) * ratio))
    return dict(bones=bones, go=go, mat_guid=mat_guid, pos=pos, nor=nor, uv=uv, jnt=jnt, w=w, idx=idx, ibm=ibm)

def convert(assets, prefab_name, out, tex_size=512, ratio=1.0):
    pf = open(os.path.join(assets, 'GameObject', prefab_name + '.prefab')).read()
    B = blocks(pf)
    names = {k: re.search(r'm_Name: (.*)', v[1]).group(1).strip() for k, v in B.items() if v[0] == 1}
    T = {}
    for k, (c, t) in B.items():
        if c == 4:
            T[k] = dict(go=fid(re.search(r'm_GameObject: (\{[^}]*\})', t).group(1)), rot=vec(t, 'm_LocalRotation', 4), pos=vec(t, 'm_LocalPosition'), scl=vec(t, 'm_LocalScale'),
                        father=fid(re.search(r'm_Father: (\{[^}]*\})', t).group(1)))
    smrs = [t for k, (c, t) in B.items() if c == 137]
    if not smrs: raise SystemExit(f'{prefab_name}: no SkinnedMeshRenderer')
    parts = [read_smr(assets, t, ratio, prefab_name) for t in smrs]
    if len({p['mat_guid'] for p in parts}) != 1: raise SystemExit(f'{prefab_name}: the meshes use different materials')
    mat_path = guid_map(assets, 'Material')[parts[0]['mat_guid']]
    mt = open(mat_path).read()
    tex_path = guid_map(assets, 'Texture2D')[re.search(r'_BaseMap:\n\s+m_Texture: \{[^}]*guid: ([0-9a-f]{32})', mt).group(1)]

    # ---- nodes: the whole prefab hierarchy under the root, bones included
    go_t = {t['go']: k for k, t in T.items()}
    kids = {}
    for k, t in T.items(): kids.setdefault(t['father'], []).append(k)
    roots = kids.get('0', [])
    nodes = []
    def add(k):
        t = T[k]; i = len(nodes)
        q = t['rot']; node = dict(name=names.get(t['go'], 'n'), translation=[t['pos'][0], t['pos'][1], -t['pos'][2]], rotation=[-q[0], -q[1], q[2], q[3]], scale=t['scl'])
        nodes.append(node); node['_k'] = k
        for c in kids.get(k, []): node.setdefault('children', []).append(add(c))
        return i
    for r in roots: add(r)
    kmap = {n['_k']: i for i, n in enumerate(nodes)}
    for n in nodes: del n['_k']

    # ---- binary buffer
    buf = bytearray(); views = []; accs = []
    def push(arr, target=None, comp=None, typ=None, minmax=False):
        while len(buf) % 4: buf.append(0)
        views.append(dict(buffer=0, byteOffset=len(buf), byteLength=arr.nbytes, **({'target': target} if target else {})))
        buf.extend(arr.tobytes())
        a = dict(bufferView=len(views) - 1, componentType=comp, count=len(arr), type=typ)
        if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a); return len(accs) - 1
    meshes, skins, nv, nt = [], [], 0, 0
    for pi, P in enumerate(parts):
        ap = push(P['pos'].astype(np.float32), 34962, 5126, 'VEC3', True); an = push(P['nor'].astype(np.float32), 34962, 5126, 'VEC3'); au = push(P['uv'].astype(np.float32), 34962, 5126, 'VEC2')
        aj = push(P['jnt'].astype(np.uint16), 34962, 5123, 'VEC4'); aw = push(P['w'].astype(np.float32), 34962, 5126, 'VEC4')
        ai = push(P['idx'].reshape(-1).astype(np.uint32), 34963, 5125, 'SCALAR'); accs[ai]['count'] = P['idx'].size
        ab = push(np.array([m.T for m in P['ibm']], np.float32).reshape(-1, 16), None, 5126, 'MAT4')
        meshes.append(dict(name=f'{prefab_name}_{pi}', primitives=[dict(attributes=dict(POSITION=ap, NORMAL=an, TEXCOORD_0=au, JOINTS_0=aj, WEIGHTS_0=aw), indices=ai, material=0)]))
        joints = [kmap[b] for b in P['bones']]; skins.append(dict(joints=joints, inverseBindMatrices=ab, skeleton=joints[0]))
        node = nodes[kmap[go_t[P['go']]]]; node['mesh'] = pi; node['skin'] = pi; nv += len(P['pos']); nt += len(P['idx'])
    im = Image.open(tex_path).convert('RGBA')
    if tex_size and max(im.size) > tex_size: im = im.resize((tex_size, tex_size), Image.LANCZOS)
    pb = io.BytesIO(); im.save(pb, 'PNG', optimize=True); pngb = pb.getvalue()
    while len(buf) % 4: buf.append(0)
    views.append(dict(buffer=0, byteOffset=len(buf), byteLength=len(pngb))); buf.extend(pngb)
    gl = dict(asset=dict(version='2.0', generator='unity-fish-to-glb'), scene=0, scenes=[dict(nodes=[kmap[r] for r in roots])], nodes=nodes, meshes=meshes, skins=skins,
              materials=[dict(name=os.path.basename(mat_path)[:-4], pbrMetallicRoughness=dict(baseColorTexture=dict(index=0), metallicFactor=0, roughnessFactor=.8), alphaMode='MASK', alphaCutoff=.5, doubleSided=False)],
              textures=[dict(source=0, sampler=0)], samplers=[dict(magFilter=9729, minFilter=9987, wrapS=33071, wrapT=33071)], images=[dict(bufferView=len(views) - 1, mimeType='image/png')],
              accessors=accs, bufferViews=views, buffers=[dict(byteLength=len(buf))])
    js = json.dumps(gl, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    while len(buf) % 4: buf.append(0)
    with open(out, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(buf)))
        f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
        f.write(struct.pack('<I4s', len(buf), b'BIN\x00')); f.write(buf)
    return dict(verts=nv, tris=nt, meshes=len(parts), size=os.path.getsize(out) // 1024)

if __name__ == '__main__':
    a = sys.argv[1:]
    ts = int(a[a.index('--tex-size') + 1]) if '--tex-size' in a else 512
    rt = float(a[a.index('--ratio') + 1]) if '--ratio' in a else 1.0
    print(convert(a[0], a[1], a[2], ts, rt))
