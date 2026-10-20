"""Derive runtime sprites from the original concept sheets.
Originals in /assets are never modified; output goes to /assets/runtime.
Run: python3 tools/extract_sprites.py   (needs pillow, numpy, scipy)
"""
import os, json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'assets')
OUT = os.path.join(A, 'runtime')
os.makedirs(os.path.join(OUT, 'chars'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'items'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'ui'), exist_ok=True)

# Frame boxes (x, y, w, h) — both character sheets share the same 1448x1086 layout.
FRAMES = {
    'idle':   [(40, 625, 113, 198), (188, 625, 111, 198)],
    'walk':   [(343, 625, 120, 200), (490, 625, 120, 200), (630, 625, 118, 200), (775, 622, 124, 204)],
    'coffee': [(945, 632, 122, 196), (1075, 632, 203, 196), (1280, 619, 145, 212)],
    'win':    [(84, 872, 170, 207), (296, 868, 165, 211), (494, 862, 132, 217)],
}
ITEMS = {
    'david':   {'protein': (712, 890, 130, 122), 'creatine': (888, 892, 142, 120),
                'noodles': (1070, 885, 136, 127), 'laptop': (1214, 892, 204, 122)},
    'nemanja': {'pizza': (718, 890, 150, 122), 'burger': (910, 895, 135, 117),
                'soda': (1100, 870, 108, 142), 'scarf': (1238, 872, 194, 140)},
}
SCALE = 0.6
CELL_W, CELL_H = 132, 136


def mask_for(crop, transparent):
    a = np.array(crop).astype(int)
    if transparent:
        fg0 = a[..., 3] > 40
    else:
        fg0 = a[..., :3].max(-1) >= 34
    fg = ndimage.binary_closing(fg0, structure=np.ones((5, 5)))
    fg = ndimage.binary_fill_holes(fg)
    lab, n = ndimage.label(fg)
    if n == 0:
        return fg
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    objs = ndimage.find_objects(lab)
    keep = [i + 1 for i, s in enumerate(sizes)
            if s >= max(sizes) * 0.02 and (objs[i][0].stop - objs[i][0].start) >= 16]
    m = np.isin(lab, keep)
    # pull the mask in by one pixel to drop the soft halo
    m = ndimage.binary_erosion(m, iterations=1) if not transparent else (m & fg0 | ndimage.binary_erosion(m, iterations=2))
    return m


def cut(sheet, box, transparent):
    x, y, w, h = box
    crop = sheet.crop((x - 4, y - 4, x + w + 4, y + h + 4)).convert('RGBA')
    m = mask_for(crop, transparent)
    arr = np.array(crop)
    arr[..., 3] = np.where(m, 255 if not transparent else arr[..., 3], 0)
    if transparent:
        arr[..., 3] = np.where(m, np.maximum(arr[..., 3], 0), 0)
    im = Image.fromarray(arr.astype('uint8'), 'RGBA')
    bb = im.getbbox()
    return im.crop(bb), m


def head_center_x(im):
    a = np.array(im)[..., 3] > 0
    top = a[: int(a.shape[0] * 0.35)]
    xs = np.nonzero(top)[1]
    return xs.mean() if len(xs) else im.width / 2


meta = {}
for who in ['david', 'nemanja']:
    sheet = Image.open(os.path.join(A, f'{who}_sheet.png')).convert('RGBA')
    transparent = who == 'david'
    cells = []
    # blank the 'VICTORY (3 FRAMES)' label that sits right above the victory poses
    from PIL import ImageDraw
    ImageDraw.Draw(sheet).rectangle((28, 828, 344, 887), fill=(0, 0, 0, 0))
    for anim, boxes in FRAMES.items():
        for i, box in enumerate(boxes):
            im, _ = cut(sheet, box, transparent)
            im = im.resize((round(im.width * SCALE), round(im.height * SCALE)), Image.LANCZOS)
            cx = head_center_x(im)
            cell = Image.new('RGBA', (CELL_W, CELL_H))
            ox = int(round(CELL_W / 2 - cx))
            ox = max(0, min(CELL_W - im.width, ox))
            oy = CELL_H - im.height - 2
            cell.alpha_composite(im, (ox, max(0, oy)))
            cells.append((anim, i, cell))
    strip = Image.new('RGBA', (CELL_W * len(cells), CELL_H))
    frames = {}
    for idx, (anim, i, cell) in enumerate(cells):
        strip.alpha_composite(cell, (idx * CELL_W, 0))
        frames.setdefault(anim, []).append(idx)
    strip.save(os.path.join(OUT, 'chars', f'{who}.png'))
    meta[who] = frames
    # portrait: head of idle frame 0
    idle = cells[0][2]
    bb = idle.getbbox()
    head = idle.crop((bb[0], bb[1], bb[2], bb[1] + int((bb[3] - bb[1]) * 0.42)))
    head.save(os.path.join(OUT, 'ui', f'{who}_portrait.png'))
    for name, box in ITEMS[who].items():
        im, _ = cut(sheet, box, transparent)
        im.thumbnail((64, 64), Image.LANCZOS)
        im.save(os.path.join(OUT, 'items', f'{name}.png'))

with open(os.path.join(OUT, 'chars', 'frames.json'), 'w') as f:
    json.dump({'cellW': CELL_W, 'cellH': CELL_H, 'anims': meta}, f, indent=1)

# ---- elements from the concept art (light background, dark outlines) ----
concept = Image.open(os.path.join(A, 'concept_art_ref.png')).convert('RGBA')


def cut_outlined(box, thumb=None, light=560, erase=None):
    """Background = light pixels connected to the crop border (flood fill)."""
    crop = concept.crop(box)
    a = np.array(crop).astype(int)
    lightm = a[..., :3].sum(-1) > light
    lab, n = ndimage.label(lightm)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    m = ~np.isin(lab, list(border))
    if erase:
        for (x0, y0, x1, y1) in erase:
            m[y0:y1, x0:x1] = False
    m = ndimage.binary_opening(m, structure=np.ones((2, 2)))
    lab, n = ndimage.label(m)
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s >= max(sizes) * 0.05]
    m = np.isin(lab, keep)
    a[..., 3] = np.where(m, 255, 0)
    im = Image.fromarray(a.astype('uint8'), 'RGBA')
    im = im.crop(im.getbbox())
    if thumb:
        im.thumbnail(thumb, Image.LANCZOS)
    return im

cut_outlined((560, 0, 880, 196), erase=[(0, 0, 58, 112), (278, 0, 320, 112), (0, 112, 24, 196)]).save(os.path.join(OUT, 'ui', 'logo.png'))
cut_outlined((44, 945, 142, 1036), (96, 96)).save(os.path.join(OUT, 'items', 'ice_block.png'))
cut_outlined((195, 955, 270, 1022), (64, 64)).save(os.path.join(OUT, 'items', 'coffee.png'))
cut_outlined((385, 955, 485, 1035), (64, 64)).save(os.path.join(OUT, 'items', 'noodles_bowl.png'))
# soda: paint over the printed brand script so the cup is a plain generic soda
soda = Image.open(os.path.join(OUT, 'items', 'soda.png')).convert('RGBA')
sa = np.array(soda).astype(int)
h, w = sa.shape[:2]
body = np.zeros((h, w), bool); body[int(h * 0.42):int(h * 0.86), :] = True
whiteish = (sa[..., :3].min(-1) > 150) & body & (sa[..., 3] > 0)
sa[whiteish, 0], sa[whiteish, 1], sa[whiteish, 2] = 214, 38, 46
band = slice(int(h * 0.60), int(h * 0.66))
reds = (sa[band][..., 0] > 150) & (sa[band][..., 1] < 90) & (sa[band][..., 3] > 0)
blk = sa[band]; blk[reds] = [245, 245, 245, 255]; sa[band] = blk
Image.fromarray(sa.astype('uint8'), 'RGBA').save(os.path.join(OUT, 'items', 'soda.png'))
print('ok', meta)
