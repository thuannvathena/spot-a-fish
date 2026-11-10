#!/usr/bin/env python3
"""Gathers every file that makes up ONE Unity fish into one folder, to look at it as a whole.
Follows the prefab's GUID references (material -> texture, mesh, shader, scripts) and adds the game's own converted files.
Usage: unity-fish-pack.py <fish number, e.g. 16> [more numbers ...]      (all = every fish in public/models/unity/list.json)
Writes fish-packs/Fish_<N>/ (gitignored: it holds Unity sources, never publish)."""
import json, os, re, shutil, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'SpotAFish_UnityProject/ExportedProject/Assets')
GL = os.path.join(ROOT, 'public/models/unity')

def guids():
    g = {}
    for d, _, fs in os.walk(A):
        for f in fs:
            if f.endswith('.meta'):
                m = re.search(r'guid: ([0-9a-f]{32})', open(os.path.join(d, f), errors='ignore').read())
                if m: g[m.group(1)] = os.path.join(d, f[:-5])
    return g

def pack(n, g):
    start = f'{A}/GameObject/Fish_{n}.prefab'
    if not os.path.exists(start): print('no prefab for', n); return
    seen, q = [], [start]
    while q:
        p = q.pop(0)
        if p in seen or not os.path.exists(p): continue
        seen.append(p)
        if p.endswith(('.prefab', '.mat', '.controller', '.anim')):
            for x in re.findall(r'guid: ([0-9a-f]{32})', open(p, errors='ignore').read()):
                if x in g: q.append(g[x])
    out = os.path.join(ROOT, 'fish-packs', f'Fish_{n}'); shutil.rmtree(out, ignore_errors=True)
    rows = []
    for p in seen:
        rel = os.path.relpath(p, A); sub = os.path.dirname(rel) or '.'
        dst = os.path.join(out, 'unity-source', sub); os.makedirs(dst, exist_ok=True); shutil.copy(p, dst)
        if os.path.exists(p + '.meta'): shutil.copy(p + '.meta', dst)
        rows.append((rel, os.path.getsize(p)))
    gl = os.path.join(GL, f'fish_{int(n):02d}.glb')
    if os.path.exists(gl):
        os.makedirs(os.path.join(out, 'game'), exist_ok=True); shutil.copy(gl, os.path.join(out, 'game'))
        eyes = json.load(open(os.path.join(GL, 'eyes.json'))).get(f'fish_{int(n):02d}')
        if eyes: json.dump(eyes, open(os.path.join(out, 'game', 'eye.json'), 'w'), indent=1)
        rows.append((f'(game) fish_{int(n):02d}.glb', os.path.getsize(gl)))
    with open(os.path.join(out, 'README.md'), 'w') as f:
        f.write(f'# Fish {n}\n\n`unity-source/` = the original Unity files this fish is made of (copied, same sub-folders as in the Unity project).\n`game/` = what Spot A Fish loads: the converted, reduced `.glb` and the eye picture position/lid colour (`eye.json`) for the blink.\n\n| file | bytes |\n|---|---|\n')
        for r, s in rows: f.write(f'| {r} | {s:,} |\n')
        f.write('\nThe fish has no animation clip in Unity: its swim comes from `FishRigProceduralAnimator.cs` (a procedural wave over the bones). In the game the same kind of wave is done in `game/src/main.js`.\n')
    print(f'Fish_{n}:', len(rows), 'files ->', os.path.relpath(out, ROOT))

if __name__ == '__main__':
    g = guids(); a = sys.argv[1:] or ['16']
    if a == ['all']: a = [str(int(re.search(r'\d+', x).group())) for x in json.load(open(os.path.join(GL, 'list.json')))]
    for n in a: pack(n, g)
