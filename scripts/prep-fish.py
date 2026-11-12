"""Copies the 49 fish of `Fish Asset 3D/3D model` (ChatGPT, Codex, Tripo) into public/models/fish/<key>/ as model.fbx + tex.jpg (texture cut down to 1024 px) and writes public/models/fish/list.json.
The old `New from Tripo` copies are the same fish and are ignored."""
import os, re, json, shutil
from PIL import Image
root = 'Fish Asset 3D/3D model'; out = 'public/models/fish'
shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
items = []
for grp in ['ChatGPT', 'Codex', 'Tripo']:
    for d in sorted(os.listdir(os.path.join(root, grp))):
        p = os.path.join(root, grp, d)
        if not os.path.isdir(p): continue
        fbx = [f for f in os.listdir(p) if f.lower().endswith('.fbx')]; tex = [f for f in os.listdir(p) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        if len(fbx) != 1 or len(tex) != 1: print('SKIP', grp, d, fbx, tex); continue
        key = re.sub(r'(_final|_1)$', '', re.sub(r'_+$', '', d.lower())); key = re.sub(r'_+$', '', key)
        dst = os.path.join(out, key); os.makedirs(dst)
        shutil.copy(os.path.join(p, fbx[0]), os.path.join(dst, 'model.fbx'))
        im = Image.open(os.path.join(p, tex[0])).convert('RGB'); s = 1024 / max(im.size)
        if s < 1: im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        im.save(os.path.join(dst, 'tex.jpg'), quality=88)
        items.append({'key': key, 'group': grp, 'fbx': f'models/fish/{key}/model.fbx', 'tex': f'models/fish/{key}/tex.jpg'})
keys = [i['key'] for i in items]; assert len(keys) == len(set(keys)), 'duplicate keys'
json.dump(items, open(os.path.join(out, 'list.json'), 'w'), indent=1); print(len(items), 'fish'); print(' '.join(keys))
