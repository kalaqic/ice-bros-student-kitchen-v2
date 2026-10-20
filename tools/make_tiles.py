"""Procedural pixel-art tiles, enemies and HUD icons for Ice Bros.
Palette follows assets/concept art.png: icy blues, navy outlines, white snow, warm wood.
Drawn at 24x24 'art pixels' and upscaled x2 with nearest-neighbour -> 48px tiles.
Run: python3 tools/make_tiles.py
"""
import os, random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'runtime')
for d in ['tiles', 'enemies', 'ui', 'items']:
    os.makedirs(os.path.join(OUT, d), exist_ok=True)

NAVY = (27, 42, 74); NAVY2 = (42, 64, 108); INK = (16, 24, 44)
ICE0 = (244, 251, 255); ICE1 = (214, 238, 252); ICE2 = (183, 222, 246); ICE3 = (138, 196, 236); ICE4 = (84, 150, 214)
WOOD0 = (214, 160, 98); WOOD1 = (182, 124, 66); WOOD2 = (138, 88, 44); WOOD3 = (94, 58, 28)
STEEL0 = (226, 234, 242); STEEL1 = (186, 198, 212); STEEL2 = (130, 146, 166); STEEL3 = (80, 92, 112)
RED = (226, 62, 62); RED2 = (160, 30, 40); GREEN = (96, 200, 90); GREEN2 = (48, 140, 60); YEL = (255, 210, 70)
W = (255, 255, 255)


def new(w=24, h=24):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def px(d, x, y, c):
    d.point((x, y), fill=c)


def save(im, path, scale=2):
    im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    im.save(os.path.join(OUT, path))


def rect(d, x0, y0, x1, y1, c):
    d.rectangle((x0, y0, x1, y1), fill=c)

# ---------------- floor ----------------
for v in range(2):
    rnd = random.Random(7 + v)
    im, d = new()
    base = ICE1 if v == 0 else (222, 241, 253)
    rect(d, 0, 0, 23, 23, base)
    # 2x2 kitchen tiles with grout
    for gx in (0, 12):
        for gy in (0, 12):
            alt = ((gx + gy) // 12 + v) % 2
            rect(d, gx, gy, gx + 11, gy + 11, ICE0 if alt else base)
            d.line((gx, gy, gx + 11, gy), fill=W)
            d.line((gx, gy, gx, gy + 11), fill=W)
    d.line((0, 11, 23, 11), fill=ICE2); d.line((11, 0, 11, 23), fill=ICE2)
    d.line((0, 23, 23, 23), fill=ICE2); d.line((23, 0, 23, 23), fill=ICE2)
    for _ in range(5):
        x, y = rnd.randrange(1, 22), rnd.randrange(1, 22)
        px(d, x, y, ICE2)
    # frost sparkle
    x, y = rnd.randrange(3, 20), rnd.randrange(3, 20)
    px(d, x, y, W); px(d, x + 1, y, ICE0)
    save(im, f'tiles/floor{v}.png')

# ---------------- walls ----------------
def wall(cap):
    im, d = new()
    rect(d, 0, 0, 23, 23, NAVY2)
    for row in range(4):
        y = row * 6
        off = 0 if row % 2 == 0 else 6
        d.line((0, y, 23, y), fill=NAVY)
        for x in range(-off, 24, 12):
            d.line((x, y, x, y + 5), fill=NAVY)
            d.line((x + 1, y + 1, x + 10, y + 1), fill=(66, 94, 146))
    if cap:
        rect(d, 0, 0, 23, 4, W)
        d.line((0, 5, 23, 5), fill=ICE2)
        for x in (2, 3, 9, 15, 16, 21):
            px(d, x, 6, W)
        for x in (3, 15):
            px(d, x, 7, ICE1)
        d.line((0, 0, 23, 0), fill=ICE1)
    return im
save(wall(False), 'tiles/wall.png'); save(wall(True), 'tiles/wall_cap.png')

# ---------------- counter (wood top, cabinet front) ----------------
def counter(variant):
    im, d = new()
    rect(d, 0, 0, 23, 15, WOOD0)
    for y in (4, 9, 14):
        d.line((0, y, 23, y), fill=WOOD1)
    px(d, 5, 2, WOOD1); px(d, 17, 7, WOOD1); px(d, 11, 12, WOOD1)
    rect(d, 0, 16, 23, 23, ICE2)
    d.line((0, 16, 23, 16), fill=WOOD3)
    d.line((11, 17, 11, 23), fill=ICE4)
    px(d, 9, 19, STEEL3); px(d, 14, 19, STEEL3)
    if variant == 1:  # cutting board + tomato
        rect(d, 4, 3, 13, 10, (236, 196, 140)); d.rectangle((4, 3, 13, 10), outline=WOOD2)
        rect(d, 16, 4, 19, 7, RED); px(d, 17, 4, GREEN)
    elif variant == 2:  # dirty mug
        rect(d, 8, 4, 13, 10, W); d.rectangle((8, 4, 13, 10), outline=STEEL3)
        rect(d, 9, 5, 12, 6, WOOD3); px(d, 14, 6, STEEL3); px(d, 14, 7, STEEL3)
    elif variant == 3:  # microwave
        rect(d, 2, 1, 21, 13, STEEL1); d.rectangle((2, 1, 21, 13), outline=STEEL3)
        rect(d, 4, 3, 15, 11, INK); rect(d, 17, 4, 19, 5, GREEN); px(d, 18, 8, STEEL3); px(d, 18, 10, STEEL3)
    return im
for v in range(4):
    save(counter(v), f'tiles/counter{v}.png')

# ---------------- fridge ----------------
im, d = new()
rect(d, 1, 0, 22, 23, STEEL0); d.rectangle((1, 0, 22, 23), outline=STEEL3)
d.line((2, 8, 21, 8), fill=STEEL2)
rect(d, 18, 2, 19, 6, STEEL3); rect(d, 18, 10, 19, 18, STEEL3)
for (x, y, c) in [(5, 12, RED), (8, 14, YEL), (6, 17, GREEN), (10, 11, ICE4)]:
    rect(d, x, y, x + 1, y + 1, c)
rect(d, 4, 3, 9, 5, W)
save(im, 'tiles/fridge.png')

# ---------------- stove ----------------
im, d = new()
rect(d, 0, 0, 23, 23, STEEL3); rect(d, 0, 0, 23, 15, (52, 58, 72))
for cx in (6, 17):
    d.ellipse((cx - 4, 3, cx + 4, 11), outline=RED2)
    d.ellipse((cx - 2, 5, cx + 2, 9), outline=(255, 120, 60))
d.line((0, 16, 23, 16), fill=INK)
for x in (4, 9, 14, 19):
    rect(d, x, 19, x + 1, 20, STEEL0)
save(im, 'tiles/stove.png')

# ---------------- sink ----------------
im, d = new()
rect(d, 0, 0, 23, 15, STEEL1); rect(d, 3, 3, 20, 13, STEEL2); rect(d, 4, 4, 19, 12, (120, 170, 210))
rect(d, 10, 0, 13, 2, STEEL3); px(d, 11, 3, STEEL3)
rect(d, 6, 6, 9, 8, W); rect(d, 13, 8, 16, 10, (230, 220, 200))  # dirty dishes
rect(d, 0, 16, 23, 23, ICE2); d.line((0, 16, 23, 16), fill=STEEL3); d.line((11, 17, 11, 23), fill=ICE4)
save(im, 'tiles/sink.png')

# ---------------- table ----------------
im, d = new()
rect(d, 0, 0, 23, 23, WOOD1)
for y in (0, 6, 12, 18):
    d.line((0, y, 23, y), fill=WOOD2)
    d.line((0, y + 1, 23, y + 1), fill=WOOD0)
px(d, 7, 3, WOOD2); px(d, 18, 9, WOOD2); px(d, 4, 15, WOOD2); px(d, 14, 21, WOOD2)
save(im, 'tiles/table.png')

# ---------------- gate (icy bars + padlock) ----------------
im, d = new()
rect(d, 0, 0, 23, 23, (150, 200, 235, 120))
for x in (2, 8, 14, 20):
    rect(d, x, 0, x + 2, 23, ICE3); d.line((x, 0, x, 23), fill=W); d.line((x + 2, 0, x + 2, 23), fill=ICE4)
rect(d, 0, 3, 23, 4, ICE4); rect(d, 0, 19, 23, 20, ICE4)
rect(d, 8, 9, 15, 16, YEL); d.rectangle((8, 9, 15, 16), outline=WOOD3)
d.arc((9, 5, 14, 12), 180, 360, fill=STEEL3)
px(d, 11, 12, INK); px(d, 12, 12, INK); px(d, 11, 13, INK)
save(im, 'tiles/gate.png')

# ---------------- exit door (2 tiles wide) ----------------
for state in ('closed', 'open'):
    im, d = new(48, 24)
    rect(d, 0, 0, 47, 23, NAVY2)
    rect(d, 4, 2, 43, 23, WOOD3)
    if state == 'closed':
        rect(d, 6, 4, 23, 23, WOOD1); rect(d, 24, 4, 41, 23, WOOD1)
        for x in (10, 15, 20, 28, 33, 38):
            d.line((x, 4, x, 23), fill=WOOD2)
        d.line((23, 4, 23, 23), fill=WOOD3)
        rect(d, 20, 13, 21, 14, YEL); rect(d, 26, 13, 27, 14, YEL)
        rect(d, 21, 0, 26, 2, RED)
    else:
        rect(d, 6, 4, 41, 23, (255, 240, 170))
        rect(d, 8, 6, 39, 23, (255, 250, 210))
        for i in range(6):
            px(d, 10 + i * 5, 8 + (i % 3) * 4, W)
        rect(d, 21, 0, 26, 2, GREEN)
    save(im, f'tiles/exit_{state}.png')

# ---------------- terminals ----------------
im, d = new()  # David coding terminal: desk + laptop
rect(d, 0, 10, 23, 23, WOOD1); d.line((0, 10, 23, 10), fill=WOOD0); d.line((0, 17, 23, 17), fill=WOOD2)
rect(d, 4, 1, 19, 11, INK); rect(d, 5, 2, 18, 10, (20, 40, 70))
for (x, y) in [(7, 5), (8, 4), (8, 6)]: px(d, x, y, GREEN)
for (x, y) in [(15, 5), (14, 4), (14, 6)]: px(d, x, y, GREEN)
d.line((10, 7, 12, 3), fill=GREEN)
rect(d, 2, 12, 21, 14, STEEL1); d.line((2, 14, 21, 14), fill=STEEL3)
save(im, 'tiles/terminal_david.png')
im, d = new()  # Nemanja arcade cabinet
rect(d, 3, 0, 20, 23, (40, 30, 70)); d.rectangle((3, 0, 20, 23), outline=INK)
rect(d, 4, 0, 19, 3, RED); rect(d, 6, 4, 17, 11, INK); rect(d, 7, 5, 16, 10, (60, 120, 200))
px(d, 9, 7, YEL); px(d, 10, 7, YEL); px(d, 14, 8, RED); px(d, 12, 6, W)
rect(d, 4, 13, 19, 15, (70, 60, 110))
rect(d, 7, 12, 8, 13, INK); px(d, 7, 11, RED)
px(d, 13, 14, YEL); px(d, 16, 14, (90, 200, 255))
d.line((5, 20, 18, 20), fill=INK)
save(im, 'tiles/terminal_nemanja.png')

# ---------------- meal prep item ----------------
im, d = new()
rect(d, 2, 8, 21, 20, (230, 240, 248)); d.rectangle((2, 8, 21, 20), outline=STEEL3)
rect(d, 3, 9, 11, 19, W)  # rice
for (x, y) in [(4, 11), (7, 13), (5, 16), (9, 10), (8, 17)]: px(d, x, y, (220, 220, 210))
rect(d, 12, 9, 20, 13, (200, 140, 70)); d.line((12, 11, 20, 11), fill=(170, 100, 50))  # chicken
rect(d, 12, 14, 20, 19, GREEN); px(d, 13, 15, GREEN2); px(d, 16, 17, GREEN2); px(d, 18, 15, GREEN2)
rect(d, 1, 5, 22, 7, (160, 210, 240)); d.rectangle((1, 5, 22, 7), outline=STEEL3)
save(im, 'items/mealprep.png')

# ---------------- enemies ----------------
def slime(frame, body, dark, light):
    im, d = new()
    squash = 1 if frame else 0
    top = 6 + squash * 2
    d.ellipse((2 - squash, top, 21 + squash, 22), fill=body, outline=INK)
    rect(d, 3 - squash, 18, 20 + squash, 21, body)
    d.line((3 - squash, 22, 20 + squash, 22), fill=INK)
    for (x, y) in [(5, 15), (17, 12), (14, 18)]:
        rect(d, x, y + squash, x + 1, y + 1 + squash, dark)
    rect(d, 6, top + 2, 8, top + 3, light)
    ey = 11 + squash
    for ex in (8, 14):
        rect(d, ex, ey, ex + 2, ey + 3, W); rect(d, ex + 1, ey + 1, ex + 2, ey + 3, INK)
    d.line((10, ey + 6, 13, ey + 6), fill=INK)
    px(d, 10, ey + 7, (230, 90, 120)) if frame else None
    # drip
    px(d, 4, 22 + (0 if frame else 0), dark)
    return im
for f in range(2):
    save(slime(f, (130, 200, 80), (80, 140, 50), (200, 240, 160)), f'enemies/mold_{f}.png')
    save(slime(f, (190, 140, 220), (130, 80, 170), (235, 210, 250)), f'enemies/yogurt_{f}.png')

def dishes(frame):
    im, d = new()
    o = frame
    for i, y in enumerate((16, 12, 8)):
        yy = y - o * (i == 2)
        d.ellipse((3, yy, 20, yy + 6), fill=W, outline=STEEL3)
        d.ellipse((6, yy + 1, 17, yy + 4), fill=STEEL0)
    rect(d, 9, 17, 12, 18, (200, 180, 120)); px(d, 15, 13, (150, 110, 60))  # food crust
    for ex in (8, 13):
        rect(d, ex, 3 - o, ex + 2, 6 - o, W); d.rectangle((ex, 3 - o, ex + 2, 6 - o), outline=INK); px(d, ex + 1, 5 - o, INK)
    # fork arm
    d.line((20, 14, 23, 10 + o), fill=STEEL2)
    for x in (21, 22, 23):
        px(d, x, 8 + o, STEEL2)
    d.line((2, 15, 0, 18 - o), fill=STEEL2)
    rect(d, 5, 22, 8, 23, INK); rect(d, 15, 22, 18, 23, INK)
    return im
for f in range(2):
    save(dishes(f), f'enemies/dishes_{f}.png')

# ---------------- HUD icons ----------------
HEART = ["0110110",
         "1221221",
         "1222221",
         "1222221",
         "0122210",
         "0012100",
         "0001000"]
for name, fill, hi in (('heart', RED, (255, 150, 150)), ('heart_empty', (60, 70, 100), (90, 100, 130))):
    im, d = new(7, 7)
    for y, row in enumerate(HEART):
        for x, ch in enumerate(row):
            if ch == '1': px(d, x, y, INK)
            elif ch == '2': px(d, x, y, fill)
    px(d, 1, 2, hi) if name == 'heart' else None
    save(im, f'ui/{name}.png', scale=4)

im, d = new(14, 10)  # camera
rect(d, 0, 2, 13, 9, (50, 56, 70)); d.rectangle((0, 2, 13, 9), outline=INK)
rect(d, 3, 0, 6, 2, (50, 56, 70)); d.ellipse((4, 3, 10, 9), fill=STEEL1, outline=INK); rect(d, 6, 5, 8, 7, (60, 120, 200))
rect(d, 11, 3, 12, 4, YEL)
save(im, 'ui/camera.png', scale=3)
print('tiles ok')



# ---------------- bookshelf (library levels) ----------------
im, d = new()
rect(d, 0, 0, 23, 23, WOOD2); d.rectangle((0, 0, 23, 23), outline=WOOD3)
for sy in (2, 9, 16):
    rect(d, 1, sy + 5, 22, sy + 6, WOOD3)
    x = 2
    rnd = random.Random(sy)
    while x < 21:
        w = rnd.choice([2, 2, 3]); h = rnd.choice([4, 5])
        col = rnd.choice([(190, 60, 60), (60, 110, 190), (220, 180, 70), (90, 160, 90), (150, 90, 170), ICE0])
        rect(d, x, sy + 5 - h, x + w - 1, sy + 4, col)
        x += w + (1 if rnd.random() < 0.3 else 0)
save(im, 'tiles/bookshelf.png')

# ---------------- washing machine (laundry level) ----------------
im, d = new()
rect(d, 1, 0, 22, 23, STEEL0); d.rectangle((1, 0, 22, 23), outline=STEEL3)
rect(d, 2, 1, 21, 4, STEEL1); px(d, 4, 2, GREEN); px(d, 18, 2, RED); rect(d, 8, 2, 14, 3, INK)
d.ellipse((5, 7, 18, 20), fill=STEEL2, outline=STEEL3)
d.ellipse((7, 9, 16, 18), fill=(120, 180, 230))
px(d, 9, 11, W); px(d, 10, 11, W); rect(d, 10, 14, 13, 16, (230, 230, 255))
save(im, 'tiles/washer.png')

# ---------------- boss office carpet / desk (solid) ----------------
im, d = new()
rect(d, 0, 0, 23, 23, (120, 30, 40))
for k in range(0, 24, 6):
    d.line((k, 0, k, 23), fill=(140, 40, 50))
d.rectangle((0, 0, 23, 23), outline=(200, 160, 60))
rect(d, 2, 2, 21, 3, (90, 20, 30))
save(im, 'tiles/boss_carpet.png')
print('extra tiles ok')
