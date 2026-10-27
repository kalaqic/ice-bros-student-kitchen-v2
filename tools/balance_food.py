"""
Rewrites the food in every normal level map so each level has the SAME amount and both players the same:
  6 x David (p c m) + 6 x Nemanja (z b s) + 2 x shared noodles (n) = 14.
Existing food spots are reused (extras dropped, missing ones added on free floor far from other food),
then owners alternate across the map so nobody's food is all on one side.   python3 tools/balance_food.py
"""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ['shared/levels/level1.ts', 'shared/levels/campaign.ts', 'shared/levels/extra.ts']
PER, SHARED = 6, 2
TOTAL = PER * 2 + SHARED
FOOD = set('pcmzbsn')
SOLID = set('#CFSKTHWXLAMYVQU')

def reachable(grid, start):
    h, w = len(grid), len(grid[0])
    seen, q = {start}, [start]
    while q:
        x, y = q.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and grid[ny][nx] not in SOLID:
                seen.add((nx, ny)); q.append((nx, ny))
    return seen

def spread(cands, chosen, n):
    """farthest-point sampling: add n spots from cands, each as far as possible from the chosen ones"""
    cands = [c for c in cands if c not in chosen]
    out = list(chosen)
    for _ in range(n):
        if not cands: break
        best = max(cands, key=lambda c: min((abs(c[0] - o[0]) + abs(c[1] - o[1]) for o in out), default=99))
        out.append(best); cands.remove(best)
    return out

def balance(rows):
    grid = [list(r) for r in rows]
    spots = [(x, y) for y, r in enumerate(grid) for x, ch in enumerate(r) if ch in FOOD]
    if not spots:
        return rows  # boss level
    noodles = [s for s in spots if grid[s[1]][s[0]] == 'n']
    start = next((x, y) for y, r in enumerate(grid) for x, ch in enumerate(r) if ch == 'D')
    reach = reachable(grid, start)
    if len(spots) > TOTAL:  # keep a well spread subset (noodle spots first)
        keep = spread(spots, noodles[:SHARED] or spots[:1], TOTAL - len(noodles[:SHARED] or spots[:1]))
        spots = keep[:TOTAL]
    elif len(spots) < TOTAL:
        free = [(x, y) for (x, y) in reach if grid[y][x] == '.' and y > 0 and grid[y - 1][x] != 'E']
        spots = spread(free + spots, spots, TOTAL - len(spots))
    for (x, y) in [(x, y) for y, r in enumerate(grid) for x, ch in enumerate(r) if ch in FOOD]:
        grid[y][x] = '.'
    # shared noodles: keep the original noodle spots if possible, otherwise the two most central spots
    cx, cy = len(grid[0]) / 2, len(grid) / 2
    shared = [s for s in spots if s in noodles][:SHARED]
    rest = [s for s in spots if s not in shared]
    rest.sort(key=lambda s: abs(s[0] - cx) + abs(s[1] - cy))
    while len(shared) < SHARED: shared.append(rest.pop(0))
    for (x, y) in shared: grid[y][x] = 'n'
    # alternate owners in reading order so both have food everywhere
    rest = sorted([s for s in spots if s not in shared], key=lambda s: (s[1], s[0]))
    d = n = 0
    for i, (x, y) in enumerate(rest):
        if (i % 2 == 0 and d < PER) or n >= PER:
            grid[y][x] = 'pcm'[d % 3]; d += 1
        else:
            grid[y][x] = 'zbs'[n % 3]; n += 1
    return [''.join(r) for r in grid]

for f in FILES:
    path = os.path.join(ROOT, f)
    src = open(path).read()
    def fix(m):
        rows = re.findall(r"'([^']*)'", m.group(1))
        new = balance(rows)
        body = m.group(1)
        for a, b in zip(rows, new):
            body = body.replace(f"'{a}'", f"'{b}'", 1)
        return 'map: [' + body + ']'
    src = re.sub(r'map: \[(.*?)\]', fix, src, flags=re.S)
    open(path, 'w').write(src)
    print('balanced', f)
