"""Shared helpers (copied from extract_sprites_v2) for the boss sheet."""
import numpy as np
from PIL import Image
from scipy import ndimage


def glow_alpha(rgb):
    """alpha from brightness for glowing effects drawn on black"""
    m = rgb.max(-1).astype(float)
    alpha = np.clip((m - 18) / 140, 0, 1)
    col = np.where(alpha[..., None] > 0, np.clip(rgb / np.maximum(m[..., None], 1) * np.maximum(m[..., None], 160), 0, 255), 0)
    return np.dstack([col, alpha * 255]).astype('uint8')



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


