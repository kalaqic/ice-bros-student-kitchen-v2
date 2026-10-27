"""
4-direction run cycles from assets/running-better.png (8 frames each, David + Nemanja)
-> assets/runtime/stage/run_<role>_<dir>_<i>.png  (+ manifest.json entries; the game picks them up automatically).
Note: on the sheet "RUN DOWN" shows the BACK of the character and "RUN UP" the FRONT, so they are mapped by
what they look like: back view = moving up the screen, front view = moving down toward the camera.
"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sheetcut import cut_region, pack

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, 'assets', 'running-better.png')
OUT = os.path.join(ROOT, 'assets', 'runtime', 'stage')
X_L, X_R = (281, 990), (1008, 1754)          # left half (RUN RIGHT / RUN DOWN), right half (RUN LEFT / RUN UP)
ROWS = {'david': ((115, 226), (289, 406)), 'nemanja': ((559, 668), (726, 848))}   # below the label tab, above the frame numbers
# (panel column, row) -> game direction
MAP = {(0, 0): 'right', (1, 0): 'left', (0, 1): 'up', (1, 1): 'down'}
# the RUN LEFT rows hold 9 drawings (two of them almost touch) -> explicit column cuts, all 9 kept
LEFT_CUTS = {'david': [1008, 1086, 1172, 1259, 1342, 1421, 1502, 1585, 1671, 1754],
             'nemanja': [1008, 1085, 1169, 1255, 1339, 1419, 1500, 1583, 1666, 1754]}
SCALE = 0.62   # same scale as the task animations (matches the in-game hero height)

def main():
    sheet = np.array(Image.open(SHEET).convert('RGBA'))
    man_path = os.path.join(OUT, 'manifest.json')
    man = json.load(open(man_path))
    for role, rows in ROWS.items():
        for (col, row), d in MAP.items():
            x0, x1 = (X_L, X_R)[col]
            y0, y1 = rows[row]
            cuts = LEFT_CUTS[role] if d == 'left' else None
            frames = cut_region(sheet, (x0, y0, x1, y1), 9 if cuts else 8, 'flat', min_area=400, cuts=cuts)
            cells = pack(frames, SCALE)
            key = f'run_{role}_{d}'
            for i, c in enumerate(cells):
                c.save(os.path.join(OUT, f'{key}_{i}.png'))
            man[key] = {'n': len(cells), 'w': cells[0].width, 'h': cells[0].height}
            print(key, len(frames), 'frames', cells[0].size)
    json.dump(man, open(man_path, 'w'), indent=0, sort_keys=True)

if __name__ == '__main__':
    main()
