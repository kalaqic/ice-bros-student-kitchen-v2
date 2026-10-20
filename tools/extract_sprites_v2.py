"""Second asset pass: better animations from
   assets/david_nemanja_sheet.png  (idle 4, walk 4, run 4, take photo, flash effect)
   assets/ice_shot.png             (take ice shot 6, ice blast effect 4, ice block create 4)
Runs after tools/extract_sprites.py and rebuilds assets/runtime/chars/<who>.png + frames.json,
keeping coffee + victory frames from the first pass. The stunned-enemy examples in the
camera sheet are intentionally ignored (stun = stars above any enemy).
"""
import os, json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'assets')
OUT = os.path.join(A, 'runtime')
os.makedirs(os.path.join(OUT, 'fx'), exist_ok=True)
TARGET_H = 119          # standing character height inside a cell (matches pass 1)
OLD_CELL_W, OLD_CELL_H = 132, 136


# ---------------------------------------------------------------- helpers
def split_segments(mask, n_expected=None, min_gap=6):
    cols = mask.any(0)
    segs, start, gap, end = [], None, 0, 0
    for x in range(len(cols)):
        if cols[x]:
            if start is None: start = x
            gap, end = 0, x
        elif start is not None:
            gap += 1
            if gap > min_gap: segs.append([start, end]); start = None
    if start is not None: segs.append([start, end])
    segs = [s for s in segs if s[1] - s[0] > 20]
    # split merged frames at the emptiest column
    while n_expected and len(segs) < n_expected:
        widths = [s[1] - s[0] for s in segs]
        i = int(np.argmax(widths))
        s0, s1 = segs[i]
        dens = mask[:, s0:s1 + 1].sum(0).astype(float)
        k = len(dens)
        lo, hi = int(k * 0.3), int(k * 0.7)
        cut = s0 + lo + int(np.argmin(dens[lo:hi]))
        segs[i:i + 1] = [[s0, cut], [cut + 1, s1]]
    return segs


def crop_rgba(arr, x0, y0, x1, y1, mask):
    sub = arr[y0:y1, x0:x1].copy()
    sub[..., 3] = np.where(mask[y0:y1, x0:x1], sub[..., 3], 0)
    im = Image.fromarray(sub.astype('uint8'), 'RGBA')
    bb = im.getbbox()
    return im.crop(bb) if bb else im


def keep_big(mask, min_h=14, max_w=None):
    lab, n = ndimage.label(mask)
    out = np.zeros_like(mask)
    for i, s in enumerate(ndimage.find_objects(lab)):
        h, w = s[0].stop - s[0].start, s[1].stop - s[1].start
        if h < min_h and w * h < 400: continue
        if max_w and w > max_w: continue
        if h < 40 and w > 90: continue
        out |= lab == i + 1
    return out


def glow_alpha(rgb):
    """alpha from brightness for glowing effects drawn on black"""
    m = rgb.max(-1).astype(float)
    alpha = np.clip((m - 18) / 140, 0, 1)
    col = np.where(alpha[..., None] > 0, np.clip(rgb / np.maximum(m[..., None], 1) * np.maximum(m[..., None], 160), 0, 255), 0)
    return np.dstack([col, alpha * 255]).astype('uint8')


# ---------------------------------------------------------------- camera sheet (RGBA)
cam = np.array(Image.open(os.path.join(A, 'david_nemanja_sheet.png')).convert('RGBA')).astype(int)
PANELS = {
    'david': {'idle': ((20, 66, 450, 262), 4), 'walk': ((455, 66, 865, 262), 4), 'run': ((870, 66, 1390, 262), 4),
              'photo': ((20, 266, 865, 436), 7), 'flash': ((870, 266, 1390, 436), 4)},
    'nemanja': {'idle': ((1420, 66, 1860, 272), 4), 'walk': ((1862, 66, 2292, 272), 4), 'run': ((2294, 66, 2795, 272), 4),
                'photo': ((1420, 268, 2292, 436), 7), 'flash': ((2294, 268, 2795, 436), 4)},
}


def cam_frames(box, n):
    x0, y0, x1, y1 = box
    sub = cam[y0:y1, x0:x1].copy()
    sub[:(99 if y0 < 200 else 299) - y0, :, 3] = 0           # label tabs
    op = sub[..., 3] > 200
    for y in range(op.shape[0]):                              # thin border lines
        row, x = op[y], 0
        while x < len(row):
            if row[x]:
                e = x
                while e < len(row) and row[e]: e += 1
                if e - x > 90:
                    ab, be = op[max(0, y - 5), x:e].mean(), op[min(op.shape[0] - 1, y + 5), x:e].mean()
                    if min(ab, be) < 0.35: sub[max(0, y - 1):y + 2, x:e, 3] = 0
                x = e
            else: x += 1
    mask = keep_big(sub[..., 3] > 200, max_w=220)
    mask = ndimage.binary_fill_holes(mask)
    segs = split_segments(mask, n)
    frames = []
    for s0, s1 in segs[:n]:
        frames.append(crop_rgba(sub, s0, 0, s1 + 1, sub.shape[0], mask))
    return frames


def cam_flash(box):
    x0, y0, x1, y1 = box
    sub = cam[y0 + 40:y1 - 24, x0 + 24:x1 - 24].copy()
    rgb = sub[..., :3] * (sub[..., 3:4] / 255.0)
    g = glow_alpha(rgb)
    lab, n = ndimage.label(g[..., 3] > 20)
    for i, sl in enumerate(ndimage.find_objects(lab)):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if (w > 40 and h < 8) or (h > 40 and w < 8): g[lab == i + 1] = 0     # panel border lines
    mask = g[..., 3] > 40
    segs = split_segments(ndimage.binary_dilation(mask, iterations=4), 4, min_gap=10)
    out = []
    for s0, s1 in segs[:4]:
        im = Image.fromarray(g[:, max(0, s0 - 6):s1 + 7])
        out.append(im.crop(im.getbbox()))
    return out


# ---------------------------------------------------------------- ice sheet (RGB on black)
ice = np.array(Image.open(os.path.join(A, 'ice_shot.png')).convert('RGB')).astype(int)


def ice_char_frames(x0, x1):
    """Frames overlap (the beam of one pose reaches the next pose), so frames are cut between
    heads; the beam itself is drawn in-game from the separate ICE BLAST effect frames."""
    y0, y1 = 172, 445
    rgb = ice[y0:y1, x0:x1]
    fg0 = rgb.max(-1) >= 14
    fg = ndimage.binary_closing(fg0, np.ones((5, 5)))
    heads = split_segments(fg[8:70], 6, min_gap=3)            # head row is cleanly separated
    hc = [(a + b) / 2 for a, b in heads[:6]]
    rgba = np.dstack([rgb, np.full(rgb.shape[:2], 255)])
    g = glow_alpha(rgb)
    out = []
    for k, c in enumerate(hc):
        left = int(c - 72)
        right = int(hc[k + 1] - 68) if k + 1 < len(hc) else int(c + 125)
        left, right = max(0, left), min(rgb.shape[1], right)
        m = fg[:, left:right]
        lab, n = ndimage.label(m)
        # seed = the torso just below this pose's head; keep that body + touching bits
        sx, sy = int(c - left), int(m.shape[0] * 0.55)
        ys, xs = np.nonzero(lab)
        d = (xs - sx) ** 2 + (ys - sy) ** 2
        body = lab[ys[np.argmin(d)], xs[np.argmin(d)]]
        m = lab == body
        filled = ndimage.binary_fill_holes(m)
        holes, hn = ndimage.label(filled & ~m)
        sub_rgb2 = rgb[:, left:right]
        sub_max = sub_rgb2.max(-1)
        icy2 = (sub_rgb2[..., 2] > sub_rgb2[..., 0] + 25) & (sub_rgb2[..., 2] > 90)
        for hi in range(1, hn + 1):
            hm = holes == hi
            near_ice = (ndimage.binary_dilation(hm, iterations=3) & icy2).sum() > 8
            if not (sub_max[hm].mean() < 4 and hm.sum() > 60 and near_ice):   # pure-black pocket = background
                m |= hm
        srgb = rgb[:, left:right]
        behind = (srgb[..., 2] > srgb[..., 0] + 25) & (srgb[..., 2] > 170) & (srgb[..., 1] > 120)
        behind[:, max(0, int(c - left) - 22):] = False
        m &= ~ndimage.binary_dilation(behind, iterations=2)
        lab2, n2 = ndimage.label(m)
        if n2 > 1:
            sz = ndimage.sum(m, lab2, range(1, n2 + 1))
            m = lab2 == (int(np.argmax(sz)) + 1)
        part = rgba[:, left:right].copy()
        gp = g[:, left:right].astype(int)
        sub_rgb = rgb[:, left:right]
        icy = (sub_rgb[..., 2] > sub_rgb[..., 0] + 25) & (sub_rgb[..., 2] > 90)   # only the blue ice glow
        icy[:, :max(0, int(c - left) - 10)] = False      # glow behind the body belongs to the previous pose
        part[..., 3] = np.where(m, 255, np.where(icy, gp[..., 3], 0))
        part[..., :3] = np.where(m[..., None], part[..., :3], gp[..., :3])
        im = Image.fromarray(part.astype('uint8'), 'RGBA')
        out.append(im.crop(im.getbbox()))
    return out


def ice_effect_frames(y0, y1, x0=0, x1=830):
    g = glow_alpha(ice[y0:y1, x0:x1])
    m = g[..., 3] > 30
    segs = split_segments(ndimage.binary_dilation(m, iterations=6), 4, min_gap=8)
    out = []
    for s0, s1 in segs[:4]:
        im = Image.fromarray(g[:, max(0, s0 - 4):s1 + 5])
        out.append(im.crop(im.getbbox()))
    return out


def block_frames():
    y0, y1, x0, x1 = 752, 915, 0, 830
    rgb = ice[y0:y1, x0:x1]
    solid = ndimage.binary_fill_holes(ndimage.binary_closing(rgb.max(-1) >= 60, np.ones((5, 5))))
    g = glow_alpha(rgb)
    alpha = np.where(solid, 255, g[..., 3])
    col = np.where(solid[..., None], rgb, g[..., :3])
    arr = np.dstack([col, alpha]).astype('uint8')
    segs = split_segments(ndimage.binary_dilation(alpha > 30, iterations=5), 4, min_gap=8)
    out = []
    for s0, s1 in segs[:4]:
        im = Image.fromarray(arr[:, max(0, s0 - 3):s1 + 4])
        out.append(im.crop(im.getbbox()))
    return out


# ---------------------------------------------------------------- knocked down / revive / celebration
def cut_bounds(arr, y0, y1, bounds, tol=22):
    x0, x1 = bounds[0], bounds[-1]
    sub = arr[y0:y1, x0:x1]
    full = extract_mask(sub, tol)
    out = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        m = full[:, a - x0:b - x0]
        rgb = sub[:, a - x0:b - x0, :3]
        lab, n = ndimage.label(m)
        if n:
            sz = ndimage.sum(m, lab, range(1, n + 1))
            objs = ndimage.find_objects(lab)
            m = np.isin(lab, [i + 1 for i, sl in enumerate(objs)
                              if sz[i] >= max(sz) * 0.03 and (sl[0].stop - sl[0].start) >= 8])
        part = np.dstack([rgb, np.where(m, 255, 0)]).astype('uint8')
        im = Image.fromarray(part, 'RGBA'); bb = im.getbbox()
        out.append(im.crop(bb) if bb else im)
    return out

def extract_mask(sub, tol=22):
    sub = sub.astype(int)
    rgb = sub[..., :3]; a = sub[..., 3] if sub.shape[2] == 4 else np.full(rgb.shape[:2], 255)
    opaque = a > 128
    vals = rgb[opaque].reshape(-1, 3) // 4 * 4
    u, c = np.unique(vals, axis=0, return_counts=True); bgc = u[np.argmax(c)] + 2
    near = (np.abs(rgb - bgc).sum(-1) < tol) | ~opaque
    lab, n = ndimage.label(near)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ~np.isin(lab, list(border))
    for y in range(fg.shape[0]):
        row = fg[y]; x = 0
        while x < len(row):
            if row[x]:
                e = x
                while e < len(row) and row[e]: e += 1
                if e - x > 70:
                    ab = fg[max(0, y - 4), x:e].mean(); be = fg[min(fg.shape[0] - 1, y + 4), x:e].mean()
                    if max(ab, be) < 0.4: fg[max(0, y - 2):y + 3, x:e] = False
                x = e
            else: x += 1
    fg = ndimage.binary_opening(fg, np.ones((2, 2)))
    filled = ndimage.binary_fill_holes(fg)
    # enclosed pockets that are pure background colour (e.g. between the legs) stay transparent
    holes, hn = ndimage.label(filled & ~fg)
    for hi in range(1, hn + 1):
        hm = holes == hi
        if hm.sum() > 40 and (np.abs(rgb[hm] - bgc).sum(-1) < tol).mean() > 0.9: continue
        fg |= hm
    lab, n = ndimage.label(fg)
    if n:
        sz = ndimage.sum(fg, lab, range(1, n + 1))
        fg = np.isin(lab, [i + 1 for i, s in enumerate(sz) if s > 300])
    return fg


kd_sheet = np.array(Image.open(os.path.join(A, 'koncked_down.png')).convert('RGBA'))
cel_sheet = np.array(Image.open(os.path.join(A, 'celebration.png')).convert('RGBA'))
KD = {
    'david': {'ko': (106, 246, [20, 140, 255, 383, 525, 680, 850]), 'down': (318, 430, [20, 163, 310, 450, 575, 705, 850]),
              'revive': (499, 642, [20, 252, 458, 615, 690, 862]), 'shake': (715, 856, [20, 252, 462, 640, 862])},
    'nemanja': {'ko': (106, 246, [910, 1020, 1135, 1265, 1420, 1590, 1765]), 'down': (318, 430, [910, 1065, 1215, 1350, 1475, 1605, 1765]),
                'revive': (499, 642, [910, 1150, 1352, 1505, 1580, 1756]), 'shake': (715, 856, [910, 1140, 1352, 1530, 1756])},
}
CEL = {'nemanja': [5, 200, 385, 560, 745], 'david': [745, 925, 1095, 1265, 1445]}
os.makedirs(os.path.join(OUT, 'duo'), exist_ok=True)


def scaled(frames, sc):
    return [f.resize((max(1, round(f.width * sc)), max(1, round(f.height * sc))), Image.LANCZOS) for f in frames]


# ---------------------------------------------------------------- assemble strips
def head_cx(im):
    a = np.array(im)[..., 3] > 128
    top = a[: max(1, int(a.shape[0] * 0.3))]
    xs = np.nonzero(top)[1]
    return xs.mean() if len(xs) else im.width / 2


meta = {}
for who in ['david', 'nemanja']:
    anims = {}
    raw = {k: cam_frames(*PANELS[who][k]) for k in ['idle', 'photo']}
    s_cam = TARGET_H / np.median([f.height for f in raw['idle']])
    for k, fr in raw.items():
        anims[k] = [f.resize((max(1, round(f.width * s_cam)), max(1, round(f.height * s_cam))), Image.LANCZOS) for f in fr]
    shot = ice_char_frames(10, 830) if who == 'david' else ice_char_frames(845, 1665)
    s_ice = TARGET_H / shot[0].height
    anims['ice'] = [f.resize((round(f.width * s_ice), round(f.height * s_ice)), Image.LANCZOS) for f in shot]
    # coffee + victory from pass 1 (already scaled into 132x136 cells)
    old = Image.open(os.path.join(OUT, 'chars', f'{who}.png'))
    oldmeta = json.load(open(os.path.join(OUT, 'chars', 'frames.json')))['anims'][who] if os.path.exists(os.path.join(OUT, 'chars', 'frames.json')) else None
    # movement: the original walk cycle reads best (used for both lobby walk and level run)
    v1 = {'walk': [2, 3, 4, 5], 'coffee': [6, 7, 8]}
    for k, idxs in v1.items():
        cells = [old.crop((i * OLD_CELL_W, 0, (i + 1) * OLD_CELL_W, OLD_CELL_H)) for i in idxs]
        anims[k] = [c.crop(c.getbbox()) for c in cells]
    anims['run'] = anims['walk']
    # celebration (level complete)
    cel = cut_bounds(cel_sheet, 85, 495, CEL[who], tol=40)
    anims['win'] = scaled(cel, TARGET_H / (np.median([f.height for f in cel]) * 0.8))
    # knocked down + lying on the ground asking for help
    ko = cut_bounds(kd_sheet, *KD[who]['ko'][:2], KD[who]['ko'][2])
    s_kd = TARGET_H / ko[0].height
    anims['ko'] = scaled(ko, s_kd)
    anims['down'] = scaled(cut_bounds(kd_sheet, *KD[who]['down'][:2], KD[who]['down'][2]), s_kd)
    # two-character scenes: revive (this player is the one on the floor) and the bro handshake
    rev = cut_bounds(kd_sheet, *KD[who]['revive'][:2], KD[who]['revive'][2])
    rev = [rev[i] for i in (0, 1, 2, 4)]
    shake = cut_bounds(kd_sheet, *KD[who]['shake'][:2], KD[who]['shake'][2])
    for name, frs in (('revive', rev), ('shake', shake)):
        for i, f in enumerate(scaled(frs, s_kd)):
            f.save(os.path.join(OUT, 'duo', f'{name}_{who}_{i}.png'))
    # cell size: centred on the head, feet on the bottom
    def cx_of(k, f): return f.width / 2 if k in ('ko', 'down') else head_cx(f)
    half = 0
    for k, fr in anims.items():
        for f in fr:
            cx = cx_of(k, f)
            half = max(half, cx, f.width - cx)
    cell_w = int(np.ceil(half * 2)) + 4
    cell_h = max(f.height for fr in anims.values() for f in fr) + 4
    meta[who] = {'cellW': cell_w, 'cellH': cell_h, 'anims': {}}
    order = ['idle', 'walk', 'run', 'photo', 'ice', 'coffee', 'win', 'ko', 'down']
    total = sum(len(anims[k]) for k in order)
    strip = Image.new('RGBA', (cell_w * total, cell_h))
    i = 0
    for k in order:
        meta[who]['anims'][k] = []
        for f in anims[k]:
            ox = int(round(cell_w / 2 - cx_of(k, f)))
            strip.alpha_composite(f, (i * cell_w + max(0, min(cell_w - f.width, ox)), cell_h - 2 - f.height))
            meta[who]['anims'][k].append(i)
            i += 1
    strip.save(os.path.join(OUT, 'chars', f'{who}.png'))
    # HUD portrait from the new idle pose so it matches the in-game look
    f0 = raw['idle'][0]
    f0.crop((0, 0, f0.width, int(f0.height * 0.42))).save(os.path.join(OUT, 'ui', f'{who}_portrait.png'))

json.dump(meta, open(os.path.join(OUT, 'chars', 'frames.json'), 'w'), indent=1)

for i, f in enumerate(cam_flash(PANELS['david']['flash'][0])):
    f.thumbnail((96, 96), Image.LANCZOS); f.save(os.path.join(OUT, 'fx', f'flash_{i}.png'))
for i, f in enumerate(ice_effect_frames(518, 688)):
    f.thumbnail((120, 80), Image.LANCZOS); f.save(os.path.join(OUT, 'fx', f'iceblast_{i}.png'))
for i, f in enumerate(block_frames()):
    f.thumbnail((64, 64), Image.LANCZOS); f.save(os.path.join(OUT, 'fx', f'iceblock_{i}.png'))
print('v2 ok', {w: (m['cellW'], m['cellH'], {k: len(v) for k, v in m['anims'].items()}) for w, m in meta.items()})
