#!/usr/bin/env python3
"""Self-made textures for Toby's Great Escape (turkey-run-game-01) — maximal pass.

Every texture is generated from scratch in this script with numpy + PIL:
value-noise fields, drawn planks/stones/tiles/leaves, no stock photos, no
copied art. Run:  python3 tools/gen_textures.py
Writes PNGs into game/assets/.

Maximal pass notes:
- Key ground/surface textures render at 4096 px with detail counts and
  stroke sizes scaled to the resolution (U = SIZE / 2048), so the bigger
  files carry genuinely richer detail, not an upscale.
- The autumn leaf and turkey-feather palettes are brightened: the old
  1024 px leaves read almost black on the 3D trees, and Toby's back read as
  a black blob. bodyfeather/tailfeather are new, brighter feather maps so
  the turkey reads as a turkey from the behind-camera view.
- New prop textures: crate, barrel, wallpaper (kitchen), flowers (meadow
  patches) and thatch (haystack).
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "game", "assets")
SIZE = 1024
# Scale factor for absolute pixel sizes (1.0 at the old 2048 px baseline).
U = 1.0


def s(v):
    """Scale an absolute pixel size to the current resolution."""
    return max(1, int(round(v * U)))


def n(count):
    """Scale a detail count to the current resolution (area ratio)."""
    return int(count * U * U)


def fbm(size, seed, octaves=5, base=4):
    """Fractal value noise in [0, 1], tileable-ish via edge wrap on the grid."""
    rng = np.random.default_rng(seed)
    total = np.zeros((size, size), dtype=np.float64)
    amp = 1.0
    norm = 0.0
    freq = base
    for _ in range(octaves):
        grid = rng.random((freq + 1, freq + 1))
        grid[-1, :] = grid[0, :]
        grid[:, -1] = grid[:, 0]
        xs = np.linspace(0, freq, size, endpoint=False)
        ys = np.linspace(0, freq, size, endpoint=False)
        x0 = np.floor(xs).astype(int)
        y0 = np.floor(ys).astype(int)
        fx = xs - x0
        fy = ys - y0
        sx = fx * fx * (3 - 2 * fx)
        sy = fy * fy * (3 - 2 * fy)
        top = grid[y0][:, x0] * (1 - sx) + grid[y0][:, x0 + 1] * sx
        bot = grid[y0 + 1][:, x0] * (1 - sx) + grid[y0 + 1][:, x0 + 1] * sx
        total += (top * (1 - sy[:, None]) + bot * sy[:, None]) * amp
        norm += amp
        amp *= 0.5
        freq *= 2
    return total / norm


def blend(base_rgb, noise, lo, hi):
    """Map a noise field onto a colour ramp lo->hi and mix with base (0..1)."""
    base = np.asarray(base_rgb, dtype=np.float64) / 255.0
    lo = np.asarray(lo, dtype=np.float64) / 255.0
    hi = np.asarray(hi, dtype=np.float64) / 255.0
    ramp = lo[None, None, :] + (hi - lo)[None, None, :] * noise[..., None]
    return np.clip(base * 0.35 + ramp * 0.65, 0, 1)


def to_img(arr):
    return Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGB")


def save(name, img):
    path = os.path.join(OUT, name)
    img.save(path, "PNG")
    print(f"{name}: {os.path.getsize(path) // 1024} KiB")


def grass():
    n1 = fbm(SIZE, 11)
    n2 = fbm(SIZE, 23, octaves=4, base=16)
    img = to_img(blend((104, 136, 56), n1, (80, 112, 42), (176, 168, 66)))
    d = ImageDraw.Draw(img)
    rng = random.Random(7)
    # grass blades, dense at 4096
    for _ in range(n(9000)):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        c = rng.choice([(124, 156, 62), (156, 168, 74), (86, 116, 48), (196, 178, 84)])
        d.line([(x, y), (x + rng.randint(-s(2), s(2)), y - rng.randint(s(3), s(9)))],
               fill=c, width=1)
    # clover dots
    for _ in range(n(1400)):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        d.ellipse([x, y, x + s(5), y + s(4)], fill=(70, 110, 52))
    # (No daisies here: at the ground's 14x repeat even a few white blooms
    # per tile speckle the whole lawn. Flowers live on the flower patches
    # in the world instead.)
    # fallen autumn leaves
    for _ in range(n(900)):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        c = rng.choice([(205, 125, 32), (195, 65, 28), (224, 164, 44), (165, 95, 32)])
        d.ellipse([x, y, x + rng.randint(s(4), s(9)), y + rng.randint(s(3), s(6))], fill=c)
    img = Image.blend(img, img.filter(ImageFilter.GaussianBlur(2)), 0.15)
    return img


def dirt():
    n1 = fbm(SIZE, 31)
    img = to_img(blend((126, 92, 54), n1, (100, 70, 40), (172, 130, 82)))
    d = ImageDraw.Draw(img)
    rng = random.Random(13)
    for _ in range(n(2600)):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        r = rng.randint(1, s(4))
        c = rng.choice([(94, 68, 42), (154, 116, 72), (74, 54, 32), (184, 144, 98)])
        d.ellipse([x, y, x + r, y + r], fill=c)
    for _ in range(60):  # pebbles and twigs
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        d.line([(x, y), (x + rng.randint(-s(18), s(18)), y + rng.randint(-s(6), s(6)))],
               fill=(96, 74, 46), width=s(2))
    for _ in range(40):  # faint wheel ruts
        y = rng.randrange(SIZE)
        d.line([(0, y), (SIZE, y + rng.randint(-30, 30))], fill=(84, 60, 34), width=s(3))
    return img.filter(ImageFilter.GaussianBlur(0.6))


def planks(base, gap, seed, weather=False):
    n1 = fbm(SIZE, seed)
    arr = np.zeros((SIZE, SIZE, 3))
    rng = random.Random(seed)
    ph = SIZE // 8
    for row in range(8):
        jitter = rng.uniform(-0.12, 0.12)
        col = tuple(min(255, max(0, int(c * (1 + jitter)))) for c in base)
        arr[row * ph:(row + 1) * ph, :, :] = np.array(col) / 255.0
    grain = fbm(SIZE, seed + 1, octaves=4, base=8)
    # stretch grain horizontally: average columns to make long streaks
    streak = np.repeat(np.mean(grain, axis=1, keepdims=True), SIZE, axis=1)
    arr = arr * (0.82 + 0.28 * streak[..., None])
    img = to_img(arr)
    d = ImageDraw.Draw(img)
    for row in range(1, 8):
        d.line([(0, row * ph), (SIZE, row * ph)], fill=gap, width=s(4))
        for _ in range(3):  # nails
            x = rng.randrange(SIZE)
            d.ellipse([x, row * ph + s(6), x + s(5), row * ph + s(11)], fill=(40, 32, 24))
    if weather:
        for _ in range(n(120)):
            x = rng.randrange(SIZE)
            d.line([(x, rng.randrange(SIZE)), (x + rng.randint(-s(6), s(6)), rng.randrange(SIZE))],
                   fill=(200, 195, 185), width=s(2))
    return img


def wood():
    return planks((172, 126, 76), (60, 42, 26), 41)


def barnwood():
    return planks((172, 66, 46), (72, 30, 24), 43, weather=True)


def fencewood():
    return planks((146, 124, 92), (70, 60, 44), 47, weather=True)


def stone():
    n1 = fbm(SIZE, 51)
    img = to_img(blend((132, 132, 130), n1, (104, 104, 106), (172, 170, 164)))
    d = ImageDraw.Draw(img)
    rng = random.Random(17)
    cw, ch = SIZE // 4, SIZE // 4
    for gy in range(4):
        for gx in range(4):
            shade = rng.uniform(-14, 14)
            x0, y0 = gx * cw + s(4), gy * ch + s(4)
            c = tuple(int(v + shade) for v in (136, 134, 130))
            d.rounded_rectangle([x0, y0, x0 + cw - s(8), y0 + ch - s(8)], radius=s(18), fill=c)
            for _ in range(n(60)):
                x, y = rng.randrange(x0, x0 + cw - s(8)), rng.randrange(y0, y0 + ch - s(8))
                d.point((x, y), fill=tuple(int(v + rng.randint(-18, 18)) for v in c))
    return img


def tiles():
    img = Image.new("RGB", (SIZE, SIZE), (234, 216, 182))
    d = ImageDraw.Draw(img)
    rng = random.Random(19)
    cell = SIZE // 8
    for gy in range(8):
        for gx in range(8):
            c = (228, 208, 170) if (gx + gy) % 2 == 0 else (200, 122, 76)
            shade = rng.uniform(-8, 8)
            c = tuple(int(v + shade) for v in c)
            d.rectangle([gx * cell + s(2), gy * cell + s(2),
                         (gx + 1) * cell - s(2), (gy + 1) * cell - s(2)], fill=c)
    n1 = fbm(SIZE, 53, octaves=3, base=24)
    arr = np.asarray(img, dtype=np.float64) / 255.0
    arr = arr * (0.92 + 0.12 * n1[..., None])
    return to_img(arr)


def leaves():
    # Brightened hard: the old dark leaf map made whole tree canopies read
    # as black blobs. Warm light base, big overlapping autumn leaves.
    img = Image.new("RGB", (SIZE, SIZE), (88, 58, 26))
    d = ImageDraw.Draw(img)
    rng = random.Random(29)
    palette = [(224, 128, 36), (238, 168, 44), (206, 76, 32), (244, 196, 66),
               (176, 108, 36), (150, 96, 40), (232, 150, 52)]
    for _ in range(n(6500)):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        w, h = rng.randint(s(10), s(26)), rng.randint(s(6), s(14))
        c = rng.choice(palette)
        d.ellipse([x, y, x + w, y + h], fill=c, outline=tuple(int(v * 0.75) for v in c))
        # leaf vein
        d.line([(x + 2, y + h // 2), (x + w - 2, y + h // 2)],
               fill=tuple(int(v * 0.8) for v in c), width=1)
    return img.filter(ImageFilter.GaussianBlur(0.7))


def bark():
    n1 = fbm(SIZE, 61, octaves=5, base=4)
    streak = np.repeat(np.mean(n1, axis=0, keepdims=True), SIZE, axis=0)
    img = to_img(blend((104, 74, 46), streak, (68, 46, 28), (158, 116, 72)))
    d = ImageDraw.Draw(img)
    rng = random.Random(37)
    for _ in range(n(260)):
        x = rng.randrange(SIZE)
        d.line([(x, 0), (x + rng.randint(-s(14), s(14)), SIZE)],
               fill=(58, 38, 22), width=rng.randint(s(2), s(5)))
    for _ in range(n(200)):  # pale lichen flecks
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        d.ellipse([x, y, x + s(6), y + s(4)], fill=(168, 164, 130))
    return img


def hay():
    img = to_img(blend((218, 180, 96), fbm(SIZE, 71), (194, 154, 74), (240, 206, 124)))
    d = ImageDraw.Draw(img)
    rng = random.Random(41)
    for _ in range(n(9000)):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        ang = rng.uniform(0, math.pi)
        ln = rng.randint(s(8), s(26))
        x2, y2 = x + math.cos(ang) * ln, y + math.sin(ang) * ln
        c = rng.choice([(228, 192, 102), (202, 162, 82), (242, 216, 132), (182, 142, 68)])
        d.line([(x, y), (x2, y2)], fill=c, width=1)
    return img


def roof():
    img = Image.new("RGB", (SIZE, SIZE), (112, 54, 46))
    d = ImageDraw.Draw(img)
    rng = random.Random(43)
    rh, rw = SIZE // 12, SIZE // 8
    for row in range(12):
        off = (rw // 2) if row % 2 else 0
        for col in range(-1, 9):
            shade = rng.uniform(-16, 16)
            c = tuple(int(v + shade) for v in (132, 64, 52))
            x0 = col * rw + off
            d.rounded_rectangle([x0 + s(2), row * rh + s(2), x0 + rw - s(2), row * rh + rh - s(2)],
                                radius=s(8), fill=c)
    return img


def feather():
    # Brightened classic feather map (golden-feather pickups + wing trim).
    img = Image.new("RGB", (SIZE, SIZE), (96, 70, 44))
    d = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2
    bands = [(140, 100, 56), (228, 202, 158), (96, 66, 40), (180, 138, 80), (64, 46, 30)]
    for r in range(s(480), 0, -s(14)):
        c = bands[(r // s(14)) % len(bands)]
        d.ellipse([cx - r, cy - r * 1.6, cx + r, cy + r * 1.6], outline=c, width=s(7))
    rng = random.Random(53)
    for _ in range(n(2600)):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(s(30), s(470))
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 1.6
        d.point((x, y), fill=(236, 216, 176))
    return img


def bodyfeather():
    # Toby's body from behind: scalloped rows of brown feathers tipped with
    # cream, so the rear reads as feathers instead of a dark ball.
    img = Image.new("RGB", (SIZE, SIZE), (128, 92, 54))
    d = ImageDraw.Draw(img)
    rng = random.Random(157)
    row_h = SIZE // 10
    palette = [(150, 106, 60), (128, 88, 48), (168, 124, 72), (110, 76, 42)]
    for row in range(11):
        y = row * row_h
        off = (SIZE // 16) if row % 2 else 0
        for col in range(-1, 9):
            x = col * (SIZE // 8) + off
            c = rng.choice(palette)
            d.ellipse([x, y, x + SIZE // 8, y + row_h * 2], fill=c,
                      outline=(236, 214, 170), width=s(3))
            d.arc([x + s(6), y + row_h, x + SIZE // 8 - s(6), y + row_h * 2],
                  start=0, end=180, fill=(236, 214, 170), width=s(3))
    for _ in range(n(1800)):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        d.point((x, y), fill=(226, 198, 150))
    return img


def tailfeather():
    # Bold tail-fan map: wide cream, bronze and dark-brown bands with a
    # bronze eye-spot at the tip, built to read at a glance from behind.
    img = Image.new("RGB", (SIZE, SIZE), (110, 80, 48))
    d = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2
    bands = [(150, 104, 58), (238, 210, 164), (88, 60, 36), (190, 140, 76), (52, 36, 24)]
    for r in range(s(480), 0, -s(22)):
        c = bands[(r // s(22)) % len(bands)]
        d.ellipse([cx - r, cy - r * 1.6, cx + r, cy + r * 1.6], outline=c, width=s(12))
    # eye-spot at the tip
    d.ellipse([cx - s(90), cy - s(430), cx + s(90), cy - s(250)], fill=(60, 40, 24))
    d.ellipse([cx - s(60), cy - s(400), cx + s(60), cy - s(280)], fill=(200, 150, 70))
    d.ellipse([cx - s(30), cy - s(370), cx + s(30), cy - s(310)], fill=(40, 26, 16))
    rng = random.Random(163)
    for _ in range(n(2200)):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(s(40), s(460))
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 1.6
        d.point((x, y), fill=(240, 222, 180))
    return img


def brick():
    img = Image.new("RGB", (SIZE, SIZE), (212, 202, 187))
    d = ImageDraw.Draw(img)
    rng = random.Random(59)
    bh, bw = SIZE // 12, SIZE // 6
    for row in range(12):
        off = (bw // 2) if row % 2 else 0
        for col in range(-1, 7):
            shade = rng.uniform(-14, 14)
            c = tuple(int(v + shade) for v in (170, 88, 64))
            x0 = col * bw + off
            d.rectangle([x0 + s(3), row * bh + s(3), x0 + bw - s(3), row * bh + bh - s(3)], fill=c)
    n1 = fbm(SIZE, 67, octaves=3, base=16)
    arr = np.asarray(img, dtype=np.float64) / 255.0
    arr = arr * (0.9 + 0.16 * n1[..., None])
    return to_img(arr)


def pumpkin():
    n1 = fbm(SIZE, 73)
    img = to_img(blend((216, 112, 28), n1, (182, 86, 20), (242, 152, 52)))
    d = ImageDraw.Draw(img)
    rng = random.Random(71)
    for x in range(0, SIZE, SIZE // 12):  # pumpkin ribs
        d.line([(x, 0), (x + rng.randint(-20, 20), SIZE)], fill=(172, 80, 18), width=s(10))
    for _ in range(n(1200)):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        d.point((x, y), fill=(232, 142, 42))
    return img


def cornfield():
    img = to_img(blend((100, 126, 46), fbm(SIZE, 79), (74, 100, 32), (154, 172, 72)))
    d = ImageDraw.Draw(img)
    rng = random.Random(83)
    for _ in range(n(2400)):  # tall corn stalks
        x = rng.randrange(SIZE)
        h = rng.randint(s(200), s(700))
        y0 = rng.randrange(SIZE)
        c = rng.choice([(114, 144, 52), (144, 169, 67), (94, 122, 42)])
        d.line([(x, y0), (x + rng.randint(-s(14), s(14)), y0 - h)], fill=c, width=s(5))
        d.ellipse([x - s(8), y0 - h, x + s(26), y0 - h + s(12)], fill=(218, 182, 62))
    return img


def water():
    n1 = fbm(SIZE, 89, octaves=4, base=6)
    img = to_img(blend((56, 114, 144), n1, (40, 88, 120), (100, 164, 194)))
    d = ImageDraw.Draw(img)
    rng = random.Random(89)
    for _ in range(n(500)):  # ripple highlights
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        d.arc([x, y, x + rng.randint(s(20), s(70)), y + rng.randint(s(6), s(14))],
              start=200, end=340, fill=(194, 228, 242), width=s(2))
    for _ in range(n(240)):  # sparkle dots
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        d.point((x, y), fill=(220, 240, 250))
    return img


def tablecloth():
    img = Image.new("RGB", (SIZE, SIZE), (240, 234, 222))
    d = ImageDraw.Draw(img)
    cell = SIZE // 16
    for gy in range(16):
        for gx in range(16):
            if gx % 2 == 0:
                d.rectangle([gx * cell, 0, (gx + 1) * cell, SIZE], fill=(216, 86, 76))
            if gy % 2 == 0:
                d.rectangle([0, gy * cell, SIZE, (gy + 1) * cell], fill=(216, 86, 76))
    # overlap makes the classic gingham darker squares
    arr = np.asarray(img, dtype=np.float64) / 255.0
    n1 = fbm(SIZE, 97, octaves=3, base=24)
    arr = arr * (0.94 + 0.08 * n1[..., None])
    return to_img(arr)


def metal():
    n1 = fbm(SIZE, 101, octaves=4, base=6)
    streak = np.repeat(np.mean(n1, axis=1, keepdims=True), SIZE, axis=1)
    return to_img(blend((154, 156, 160), streak, (122, 124, 130), (198, 200, 204)))


def cloud():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rng = random.Random(107)
    for _ in range(46):
        x, y = rng.randrange(80, SIZE - 80), rng.randrange(300, 700)
        r = rng.randint(40, 130)
        d.ellipse([x - r, y - r // 2, x + r, y + r // 2], fill=(255, 255, 255, 150))
    return img  # keep the alpha channel: clouds are soft white puffs, not slabs


def forestfloor():
    n1 = fbm(SIZE, 113)
    img = to_img(blend((92, 102, 50), n1, (68, 78, 38), (146, 136, 70)))
    d = ImageDraw.Draw(img)
    rng = random.Random(113)
    for _ in range(n(2600)):  # moss tufts and fallen leaves
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        c = rng.choice([(76, 96, 44), (156, 106, 34), (196, 136, 44), (106, 116, 54)])
        d.ellipse([x, y, x + rng.randint(s(3), s(8)), y + rng.randint(s(2), s(5))], fill=c)
    for _ in range(n(500)):  # acorns and twigs
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        d.ellipse([x, y, x + s(6), y + s(5)], fill=(120, 84, 48))
    return img


def cobble():
    img = to_img(blend((144, 138, 128), fbm(SIZE, 127), (116, 110, 102), (180, 174, 162)))
    d = ImageDraw.Draw(img)
    rng = random.Random(127)
    cw, ch = SIZE // 8, SIZE // 8
    for gy in range(8):
        for gx in range(8):
            shade = rng.uniform(-16, 16)
            c = tuple(int(v + shade) for v in (150, 144, 134))
            d.rounded_rectangle([gx * cw + s(3), gy * ch + s(3), (gx + 1) * cw - s(3), (gy + 1) * ch - s(3)],
                                radius=s(26), fill=c)
    return img


def wheat():
    img = to_img(blend((208, 170, 86), fbm(SIZE, 131), (182, 142, 62), (234, 198, 112)))
    d = ImageDraw.Draw(img)
    rng = random.Random(131)
    for _ in range(n(7000)):  # wheat stalks
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        ln = rng.randint(s(20), s(60))
        c = rng.choice([(222, 192, 102), (192, 157, 72), (237, 207, 122)])
        d.line([(x, y), (x + rng.randint(-s(6), s(6)), y - ln)], fill=c, width=s(2))
        d.ellipse([x - s(3), y - ln - s(6), x + s(3), y - ln + s(6)], fill=(228, 192, 92))
    return img


def plaster():
    n1 = fbm(SIZE, 137, octaves=4, base=6)
    img = to_img(blend((234, 224, 202), n1, (216, 204, 180), (246, 238, 220)))
    d = ImageDraw.Draw(img)
    rng = random.Random(137)
    for _ in range(n(300)):  # hairline cracks
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        d.line([(x, y), (x + rng.randint(-s(40), s(40)), y + rng.randint(-s(40), s(40)))],
               fill=(202, 190, 166), width=1)
    return img


def pantry():
    # Brightened: the old dark pantry read as a black slab on the kitchen wall.
    img = to_img(blend((176, 136, 92), fbm(SIZE, 149), (148, 112, 72), (206, 164, 112)))
    d = ImageDraw.Draw(img)
    rng = random.Random(149)
    for row in range(4):  # shelves with jars
        y = row * (SIZE // 4) + SIZE // 8
        d.rectangle([0, y, SIZE, y + s(14)], fill=(120, 84, 52))
        for _ in range(n(14)):
            x = rng.randrange(SIZE)
            w, h = rng.randint(s(36), s(70)), rng.randint(s(70), s(130))
            c = rng.choice([(198, 138, 74), (140, 108, 74), (216, 176, 104), (110, 128, 86),
                            (188, 110, 80), (150, 130, 90)])
            d.rounded_rectangle([x, y - h, x + w, y], radius=s(8), fill=c)
            d.rectangle([x + s(6), y - h + s(8), x + w - s(6), y - h + s(22)],
                        fill=(240, 232, 210))
    return img


def crate():
    # Wooden packing crate: pale planks, dark frame, diagonal brace, nails.
    img = Image.new("RGB", (SIZE, SIZE), (186, 148, 96))
    d = ImageDraw.Draw(img)
    rng = random.Random(167)
    n1 = fbm(SIZE, 167, octaves=4, base=8)
    arr = np.asarray(img, dtype=np.float64) / 255.0
    arr = arr * (0.88 + 0.2 * n1[..., None])
    img = to_img(arr)
    d = ImageDraw.Draw(img)
    for row in range(4):
        y = row * (SIZE // 4)
        d.line([(0, y), (SIZE, y)], fill=(120, 88, 52), width=s(6))
    d.line([(0, 0), (SIZE, SIZE)], fill=(120, 88, 52), width=s(14))
    d.line([(SIZE, 0), (0, SIZE)], fill=(120, 88, 52), width=s(14))
    m = s(26)
    d.rectangle([m, m, SIZE - m, SIZE - m], outline=(96, 68, 38), width=s(18))
    for cx, cy in [(s(60), s(60)), (SIZE - s(60), s(60)), (s(60), SIZE - s(60)),
                   (SIZE - s(60), SIZE - s(60))]:
        d.ellipse([cx - s(8), cy - s(8), cx + s(8), cy + s(8)], fill=(52, 40, 28))
    return img


def barrel():
    # Oak barrel: vertical staves with grain, two dark iron hoops.
    img = Image.new("RGB", (SIZE, SIZE), (150, 106, 62))
    d = ImageDraw.Draw(img)
    rng = random.Random(173)
    sw = SIZE // 9
    for col in range(9):
        shade = rng.uniform(-14, 14)
        c = tuple(int(v + shade) for v in (158, 112, 66))
        d.rectangle([col * sw, 0, (col + 1) * sw, SIZE], fill=c)
        d.line([(col * sw, 0), (col * sw, SIZE)], fill=(96, 64, 36), width=s(4))
    n1 = fbm(SIZE, 173, octaves=4, base=8)
    arr = np.asarray(img, dtype=np.float64) / 255.0
    arr = arr * (0.86 + 0.24 * n1[..., None])
    img = to_img(arr)
    d = ImageDraw.Draw(img)
    for y in (SIZE // 5, 4 * SIZE // 5):
        d.rectangle([0, y - s(16), SIZE, y + s(16)], fill=(52, 54, 58))
        d.rectangle([0, y - s(16), SIZE, y - s(8)], fill=(110, 114, 120))
    return img


def wallpaper():
    # Warm farmhouse kitchen wallpaper: cream base, small autumn sprigs.
    img = Image.new("RGB", (SIZE, SIZE), (238, 226, 200))
    d = ImageDraw.Draw(img)
    rng = random.Random(179)
    cell = SIZE // 8
    for gy in range(8):
        for gx in range(8):
            cx, cy = gx * cell + cell // 2, gy * cell + cell // 2
            c = rng.choice([(198, 110, 60), (178, 80, 50), (150, 130, 60), (200, 140, 70)])
            for ang in range(0, 360, 60):
                a = math.radians(ang)
                d.ellipse([cx + math.cos(a) * s(14) - s(6), cy + math.sin(a) * s(14) - s(4),
                           cx + math.cos(a) * s(14) + s(6), cy + math.sin(a) * s(14) + s(4)],
                          fill=c)
            d.ellipse([cx - s(5), cy - s(5), cx + s(5), cy + s(5)], fill=(224, 180, 80))
    n1 = fbm(SIZE, 179, octaves=3, base=24)
    arr = np.asarray(img, dtype=np.float64) / 255.0
    arr = arr * (0.95 + 0.07 * n1[..., None])
    return to_img(arr)


def flowers():
    # Meadow flower patch: rich green base, dense colourful blooms.
    img = to_img(blend((96, 130, 54), fbm(SIZE, 181), (72, 104, 40), (140, 168, 76)))
    d = ImageDraw.Draw(img)
    rng = random.Random(181)
    for _ in range(n(1200)):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        d.line([(x, y), (x + rng.randint(-s(2), s(2)), y - rng.randint(s(4), s(10)))],
               fill=(110, 146, 62), width=1)
    palette = [(232, 120, 140), (240, 200, 60), (240, 240, 238), (200, 90, 70),
               (150, 110, 200), (240, 150, 60)]
    for _ in range(n(900)):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        r = rng.randint(s(4), s(9))
        c = rng.choice(palette)
        for ang in range(0, 360, 72):
            a = math.radians(ang)
            d.ellipse([x + math.cos(a) * r - r // 2, y + math.sin(a) * r - r // 2,
                       x + math.cos(a) * r + r // 2, y + math.sin(a) * r + r // 2], fill=c)
        d.ellipse([x - r // 2, y - r // 2, x + r // 2, y + r // 2], fill=(250, 220, 80))
    return img


def thatch():
    # Golden roof thatch / haystack: layered straw strokes.
    img = to_img(blend((206, 168, 84), fbm(SIZE, 183), (180, 140, 60), (232, 196, 110)))
    d = ImageDraw.Draw(img)
    rng = random.Random(183)
    for _ in range(n(8000)):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        ln = rng.randint(s(14), s(44))
        c = rng.choice([(222, 188, 96), (192, 156, 70), (238, 208, 124), (170, 132, 58)])
        d.line([(x, y), (x + rng.randint(-s(4), s(4)), y + ln)], fill=c, width=s(2))
    for row in range(6):
        y = row * (SIZE // 6)
        d.line([(0, y), (SIZE, y)], fill=(150, 116, 52), width=s(5))
    return img


def main():
    global SIZE, U
    os.makedirs(OUT, exist_ok=True)
    big = {"grass.png": grass, "dirt.png": dirt, "tiles.png": tiles,
           "brick.png": brick, "cornfield.png": cornfield, "water.png": water,
           "pumpkin.png": pumpkin, "forestfloor.png": forestfloor,
           "cobble.png": cobble, "plaster.png": plaster,
           "pantry.png": pantry}
    medium = {"leaves.png": leaves, "hay.png": hay, "wheat.png": wheat,
              "feather.png": feather, "bodyfeather.png": bodyfeather,
              "tailfeather.png": tailfeather, "crate.png": crate,
              "barrel.png": barrel, "wallpaper.png": wallpaper,
              "flowers.png": flowers, "thatch.png": thatch,
              "wood.png": wood, "barnwood.png": barnwood,
              "fencewood.png": fencewood, "stone.png": stone,
              "bark.png": bark, "roof.png": roof,
              "tablecloth.png": tablecloth, "metal.png": metal}
    small = {"cloud.png": cloud}
    for name, fn in big.items():
        SIZE = 4096
        U = SIZE / 2048
        save(name, fn())
    for name, fn in medium.items():
        SIZE = 2048
        U = SIZE / 2048
        save(name, fn())
    for name, fn in small.items():
        SIZE = 1024
        U = SIZE / 2048
        save(name, fn())
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"TOTAL assets: {total / (1024 * 1024):.2f} MiB")


if __name__ == "__main__":
    main()
