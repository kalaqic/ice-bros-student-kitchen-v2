"""Generic sprite-sheet cutter used by tools/extract_stages.py.

A region = rectangle on a sheet that holds N frames of one animation laid out left->right.
Background removal modes:
  alpha  - sheet already has transparency
  navy   - dark blue / purple panel (tasks.png, David side)
  red    - dark red panel (tasks.png, Nemanja side)
  flat   - uniform dark background colour (auto-detected from the region border)
  glow   - effects drawn on black: alpha from brightness (keeps soft glow)
"""
import numpy as np
from PIL import Image
from scipy import ndimage


def _border_connected(mask):
    lab, n = ndimage.label(mask)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    return np.isin(lab, list(border))


def _remove_lines(fg, min_len=90):
    """thin horizontal / vertical panel borders and label underlines"""
    fg = fg.copy()
    H, W = fg.shape
    for y in range(H):
        row = fg[y]; x = 0
        while x < W:
            if row[x]:
                e = x
                while e < W and row[e]: e += 1
                if e - x > min_len:
                    ab = fg[max(0, y - 4), x:e].mean(); be = fg[min(H - 1, y + 4), x:e].mean()
                    if max(ab, be) < 0.4: fg[max(0, y - 2):y + 3, x:e] = False
                x = e
            else: x += 1
    for x in range(W):
        col = fg[:, x]; y = 0
        while y < H:
            if col[y]:
                e = y
                while e < H and col[e]: e += 1
                if e - y > min_len:
                    le = fg[y:e, max(0, x - 4)].mean(); ri = fg[y:e, min(W - 1, x + 4)].mean()
                    if max(le, ri) < 0.4: fg[y:e, max(0, x - 2):x + 3] = False
                y = e
            else: y += 1
    return fg


def mask_for(sub, mode, tol=26):
    """returns (rgba uint8 array, foreground bool mask)"""
    sub = sub.astype(int)
    rgb = sub[..., :3]
    alpha = sub[..., 3] if sub.shape[2] == 4 else np.full(rgb.shape[:2], 255)
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    out_alpha = None
    if mode == 'none':      # opaque crop (floor / wall tiles)
        return np.dstack([rgb, np.full(rgb.shape[:2], 255)]).astype('uint8'), np.ones(rgb.shape[:2], bool)
    if mode == 'alpha':
        fg = alpha > 40
        out_alpha = alpha
    elif mode == 'glow':
        a = np.clip((mx - 20) / 120, 0, 1)
        out_alpha = (a * 255).astype(int)
        fg = out_alpha > 30
        rgb = np.where(a[..., None] > 0, np.clip(rgb / np.maximum(mx[..., None], 1) * np.maximum(mx[..., None], 150), 0, 255), 0).astype(int)
    else:
        if mode == 'navy':
            bgish = ((B - R > 6) & (mx < 42)) | (mx < 16) | ((R - G > 22) & (B - G > 35) & (mx < 200) & ((B - R) > -30))
        elif mode == 'red':
            bgish = ((R > 3.0 * G + 4) & (R > 2.4 * B + 4) & (mx < 120)) | (mx < 16)
        else:  # flat
            edge = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
            vals = edge // 4 * 4
            u, c = np.unique(vals, axis=0, return_counts=True)
            bgc = u[np.argmax(c)] + 2
            bgish = (np.abs(rgb - bgc).sum(-1) < tol) | (alpha < 40)
        fg = ~_border_connected(bgish)
    fg = _remove_lines(fg)
    fg = ndimage.binary_opening(fg, np.ones((2, 2)))
    if mode not in ('alpha', 'glow'):
        fg = ndimage.binary_fill_holes(fg)
    if out_alpha is None:
        out_alpha = np.where(fg, 255, 0)
    else:
        out_alpha = np.where(fg, out_alpha, 0)
    return np.dstack([rgb, out_alpha]).astype('uint8'), fg


def split_columns(fg, n):
    """n frame column ranges, cutting at the emptiest columns near the even split points"""
    W = fg.shape[1]
    dens = fg.sum(0).astype(float)
    cols = np.nonzero(dens)[0]
    if not len(cols):
        return []
    a, b = cols[0], cols[-1] + 1
    span = b - a
    # clean case: frames separated by empty columns -> take the n-1 widest gaps
    gaps = []
    x = a
    while x < b:
        if dens[x] == 0:
            e = x
            while e < b and dens[e] == 0: e += 1
            gaps.append((e - x, x, e)); x = e
        else: x += 1
    if n > 1 and len(gaps) >= n - 1:
        best = sorted(sorted(gaps, reverse=True)[:n - 1], key=lambda g: g[1])
        # only trust gaps that give reasonably sized frames
        bounds = [a] + [(g[1] + g[2]) // 2 for g in best] + [b]
        widths = [bounds[i + 1] - bounds[i] for i in range(n)]
        if min(widths) > span / n * 0.35:
            return list(zip(bounds[:-1], bounds[1:]))
    cuts = [a]
    for k in range(1, n):
        target = a + span * k / n
        lo, hi = int(target - span / n * 0.35), int(target + span / n * 0.35)
        lo, hi = max(lo, cuts[-1] + 4), min(hi, b - 4)
        if hi <= lo: cuts.append(int(target)); continue
        win = dens[lo:hi]
        m = win.min()
        cand = np.nonzero(win <= m + 0.5)[0]
        # prefer the candidate closest to the target among the emptiest columns
        best = cand[np.argmin(np.abs(cand + lo - target))]
        cuts.append(lo + int(best))
    cuts.append(b)
    return list(zip(cuts[:-1], cuts[1:]))


def clean_components(fg, min_area=120, keep_small=False):
    lab, n = ndimage.label(fg)
    if not n:
        return fg
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    big = max(sizes)
    keep = [i + 1 for i, s in enumerate(sizes) if s >= (min_area if keep_small else max(min_area, big * 0.015))]
    return np.isin(lab, keep)


def cut_region(sheet, box, n, mode, min_area=120, keep_small=False, cuts=None):
    x0, y0, x1, y1 = box
    sub = sheet[y0:y1, x0:x1]
    rgba, fg = mask_for(sub, mode)
    if mode == 'none':
        return [Image.fromarray(rgba, 'RGBA')]
    fg = clean_components(fg, min_area, keep_small)
    rgba[..., 3] = np.where(fg, rgba[..., 3], 0)
    if cuts:
        ranges = [(c0 - x0, c1 - x0) for c0, c1 in zip(cuts[:-1], cuts[1:])]
    else:
        ranges = split_columns(fg, n)
    frames = []
    for c0, c1 in ranges:
        part = rgba[:, c0:c1].copy()
        m = fg[:, c0:c1]
        m = clean_components(m, min_area, keep_small)
        part[..., 3] = np.where(m, part[..., 3], 0)
        im = Image.fromarray(part, 'RGBA')
        bb = im.getbbox()
        frames.append(im.crop(bb) if bb else Image.new('RGBA', (2, 2)))
    return frames


def anchor_x(im):
    """horizontal anchor: centre of the lower body (feet), robust to things held out in front"""
    a = np.array(im)[..., 3] > 100
    h = a.shape[0]
    low = a[int(h * 0.55):]
    xs = np.nonzero(low)[1]
    if not len(xs):
        xs = np.nonzero(a)[1]
    return float(np.median(xs)) if len(xs) else im.width / 2


def pack(frames, scale, anchor='feet'):
    """scale frames and place them in equal cells (bottom aligned, anchored); returns list of cell images"""
    fr = [f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.LANCZOS) for f in frames]
    if anchor == 'center':
        ax = [f.width / 2 for f in fr]
    else:
        ax = [anchor_x(f) for f in fr]
    half = max(max(a, f.width - a) for a, f in zip(ax, fr))
    cw = int(np.ceil(half * 2)) + 2
    ch = max(f.height for f in fr) + 2
    cells = []
    for a, f in zip(ax, fr):
        c = Image.new('RGBA', (cw, ch))
        ox = int(round(cw / 2 - a))
        c.alpha_composite(f, (max(0, min(cw - f.width, ox)), ch - 1 - f.height))
        cells.append(c)
    return cells
