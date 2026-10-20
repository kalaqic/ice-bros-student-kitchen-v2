"""Branka (boss) frames from assets/branka.png -> assets/runtime/boss/
The sheet's original 'stunned enemy' style rows are used only for Branka herself."""
import os, json
import numpy as np
from PIL import Image
from boss_utils import cut_bounds, glow_alpha

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'runtime', 'boss')
os.makedirs(OUT, exist_ok=True)
sheet = np.array(Image.open(os.path.join(ROOT, 'assets', 'branka.png')).convert('RGBA'))
H = 150  # standing height in px inside the runtime frames

ROWS = {
    'idle': (470, 685, [22, 160, 310]),
    'taunt': (468, 692, [318, 500, 712]),
    'cast': (468, 692, [718, 882, 1050, 1215, 1442]),
    'stunned': (730, 886, [452, 652, 788, 948]),
    'hurt': (726, 902, [962, 1120, 1250, 1425]),
    'enraged': (897, 1080, [18, 236, 462]),
    'defeat': (915, 1078, [472, 700, 902, 1122, 1442]),
    'attack': (12, 405, [878, 1405]),
}
frames = {k: cut_bounds(sheet, y0, y1, b, tol=40) for k, (y0, y1, b) in ROWS.items()}
scale = H / np.median([f.height for f in frames['idle']])
meta = {}
for k, fr in frames.items():
    meta[k] = len(fr)
    for i, f in enumerate(fr):
        f.resize((round(f.width * scale), round(f.height * scale)), Image.LANCZOS).save(os.path.join(OUT, f'{k}_{i}.png'))

# fireball projectile (glow on black): 2 flying frames + explosion
g = glow_alpha(sheet[728:852, 15:440, :3].astype(int))
for i, (a, b) in enumerate([(0, 112), (112, 268), (268, 425)]):
    im = Image.fromarray(g[:, a:b]); im = im.crop(im.getbbox())
    im.thumbnail((84, 84), Image.LANCZOS)
    im.save(os.path.join(OUT, f'fireball_{i}.png'))
json.dump(meta, open(os.path.join(OUT, 'frames.json'), 'w'))
print('boss ok', meta)
