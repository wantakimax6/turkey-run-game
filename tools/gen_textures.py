#!/usr/bin/env python3
"""Self-made textures for Toby's Great Escape (turkey-run-game-01).

Every texture is generated from scratch in this script with numpy + PIL:
value-noise fields, drawn planks/stones/tiles/leaves, no stock photos, no
copied art. Run:  python3 tools/gen_textures.py
Writes 1024x1024 PNGs into game/assets/.
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "game", "assets")
SIZE = 1024


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
    n = fbm(SIZE, 11)
    n2 = fbm(SIZE, 23, octaves=4, base=16)
    img = to_img(blend((96, 128, 52), n, (74, 104, 38), (168, 158, 62)))
    d = ImageDraw.Draw(img)
    rng = random.Random(7)
    # grass blades
    for _ in range(9000):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        c = rng.choice([(120, 150, 60), (150, 160, 70), (80, 110, 45), (190, 170, 80)])
        d.line([(x, y), (x + rng.randint(-2, 2), y - rng.randint(3, 9))], fill=c, width=1)
    # fallen autumn leaves
    for _ in range(700):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        c = rng.choice([(200, 120, 30), (190, 60, 25), (220, 160, 40), (160, 90, 30)])
        d.ellipse([x, y, x + rng.randint(4, 9), y + rng.randint(3, 6)], fill=c)
    # patchiness
    soft = to_img(np.repeat(n2[..., None], 3, axis=2) * 0.0 + 1.0)
    img = Image.blend(img, img.filter(ImageFilter.GaussianBlur(2)), 0.15)
    return img


def dirt():
    n = fbm(SIZE, 31)
    img = to_img(blend((122, 88, 52), n, (96, 66, 38), (168, 126, 80)))
    d = ImageDraw.Draw(img)
    rng = random.Random(13)
    for _ in range(2600):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        r = rng.randint(1, 4)
        c = rng.choice([(90, 64, 40), (150, 112, 70), (70, 50, 30), (180, 140, 95)])
        d.ellipse([x, y, x + r, y + r], fill=c)
    for _ in range(40):  # faint wheel ruts
        y = rng.randrange(SIZE)
        d.line([(0, y), (SIZE, y + rng.randint(-30, 30))], fill=(80, 56, 32), width=3)
    return img.filter(ImageFilter.GaussianBlur(0.6))


def planks(base, gap, seed, weather=False):
    n = fbm(SIZE, seed)
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
        d.line([(0, row * ph), (SIZE, row * ph)], fill=gap, width=4)
        for _ in range(3):  # nails
            x = rng.randrange(SIZE)
            d.ellipse([x, row * ph + 6, x + 5, row * ph + 11], fill=(40, 32, 24))
    if weather:
        for _ in range(120):
            x = rng.randrange(SIZE)
            d.line([(x, rng.randrange(SIZE)), (x + rng.randint(-6, 6), rng.randrange(SIZE))],
                   fill=(200, 195, 185), width=2)
    return img


def wood():
    return planks((168, 122, 74), (60, 42, 26), 41)


def barnwood():
    return planks((158, 52, 38), (70, 28, 22), 43, weather=True)


def fencewood():
    return planks((140, 118, 88), (70, 60, 44), 47, weather=True)


def stone():
    n = fbm(SIZE, 51)
    img = to_img(blend((128, 128, 126), n, (100, 100, 102), (168, 166, 160)))
    d = ImageDraw.Draw(img)
    rng = random.Random(17)
    cw, ch = SIZE // 4, SIZE // 4
    for gy in range(4):
        for gx in range(4):
            shade = rng.uniform(-14, 14)
            x0, y0 = gx * cw + 4, gy * ch + 4
            c = tuple(int(v + shade) for v in (132, 130, 126))
            d.rounded_rectangle([x0, y0, x0 + cw - 8, y0 + ch - 8], radius=18, fill=c)
            for _ in range(60):
                x, y = rng.randrange(x0, x0 + cw - 8), rng.randrange(y0, y0 + ch - 8)
                d.point((x, y), fill=tuple(int(v + rng.randint(-18, 18)) for v in c))
    return img


def tiles():
    img = Image.new("RGB", (SIZE, SIZE), (232, 214, 180))
    d = ImageDraw.Draw(img)
    rng = random.Random(19)
    cell = SIZE // 8
    for gy in range(8):
        for gx in range(8):
            c = (226, 206, 168) if (gx + gy) % 2 == 0 else (196, 118, 74)
            shade = rng.uniform(-8, 8)
            c = tuple(int(v + shade) for v in c)
            d.rectangle([gx * cell + 2, gy * cell + 2, (gx + 1) * cell - 2, (gy + 1) * cell - 2], fill=c)
    n = fbm(SIZE, 53, octaves=3, base=24)
    arr = np.asarray(img, dtype=np.float64) / 255.0
    arr = arr * (0.92 + 0.12 * n[..., None])
    return to_img(arr)


def leaves():
    img = Image.new("RGB", (SIZE, SIZE), (52, 34, 18))
    d = ImageDraw.Draw(img)
    rng = random.Random(29)
    palette = [(196, 96, 26), (216, 140, 32), (178, 52, 24), (226, 176, 52), (150, 84, 28), (120, 70, 30)]
    for _ in range(5200):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        w, h = rng.randint(8, 22), rng.randint(5, 12)
        c = rng.choice(palette)
        d.ellipse([x, y, x + w, y + h], fill=c, outline=tuple(int(v * 0.7) for v in c))
    return img.filter(ImageFilter.GaussianBlur(0.7))


def bark():
    n = fbm(SIZE, 61, octaves=5, base=4)
    streak = np.repeat(np.mean(n, axis=0, keepdims=True), SIZE, axis=0)
    img = to_img(blend((96, 66, 40), streak, (60, 40, 24), (150, 108, 66)))
    d = ImageDraw.Draw(img)
    rng = random.Random(37)
    for _ in range(260):
        x = rng.randrange(SIZE)
        d.line([(x, 0), (x + rng.randint(-14, 14), SIZE)], fill=(52, 34, 20), width=rng.randint(2, 5))
    return img


def hay():
    img = to_img(blend((214, 176, 92), fbm(SIZE, 71), (190, 150, 70), (238, 204, 120)))
    d = ImageDraw.Draw(img)
    rng = random.Random(41)
    for _ in range(9000):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        ang = rng.uniform(0, math.pi)
        ln = rng.randint(8, 26)
        x2, y2 = x + math.cos(ang) * ln, y + math.sin(ang) * ln
        c = rng.choice([(226, 190, 100), (200, 160, 80), (240, 214, 130), (180, 140, 66)])
        d.line([(x, y), (x2, y2)], fill=c, width=1)
    return img


def roof():
    img = Image.new("RGB", (SIZE, SIZE), (110, 52, 44))
    d = ImageDraw.Draw(img)
    rng = random.Random(43)
    rh, rw = SIZE // 12, SIZE // 8
    for row in range(12):
        off = (rw // 2) if row % 2 else 0
        for col in range(-1, 9):
            shade = rng.uniform(-16, 16)
            c = tuple(int(v + shade) for v in (128, 62, 50))
            x0 = col * rw + off
            d.rounded_rectangle([x0 + 2, row * rh + 2, x0 + rw - 2, row * rh + rh - 2],
                                radius=8, fill=c)
    return img


def feather():
    img = Image.new("RGB", (SIZE, SIZE), (60, 44, 30))
    d = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2
    bands = [(96, 66, 38), (214, 190, 150), (70, 48, 32), (160, 120, 70), (40, 28, 20)]
    for r in range(480, 0, -14):
        c = bands[(r // 14) % len(bands)]
        d.ellipse([cx - r, cy - r * 1.6, cx + r, cy + r * 1.6], outline=c, width=7)
    rng = random.Random(53)
    for _ in range(2600):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(30, 470)
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 1.6
        d.point((x, y), fill=(230, 210, 170))
    return img


def brick():
    img = Image.new("RGB", (SIZE, SIZE), (210, 200, 185))
    d = ImageDraw.Draw(img)
    rng = random.Random(59)
    bh, bw = SIZE // 12, SIZE // 6
    for row in range(12):
        off = (bw // 2) if row % 2 else 0
        for col in range(-1, 7):
            shade = rng.uniform(-14, 14)
            c = tuple(int(v + shade) for v in (166, 84, 62))
            x0 = col * bw + off
            d.rectangle([x0 + 3, row * bh + 3, x0 + bw - 3, row * bh + bh - 3], fill=c)
    n = fbm(SIZE, 67, octaves=3, base=16)
    arr = np.asarray(img, dtype=np.float64) / 255.0
    arr = arr * (0.9 + 0.16 * n[..., None])
    return to_img(arr)


def pumpkin():
    n = fbm(SIZE, 73)
    img = to_img(blend((214, 110, 26), n, (180, 84, 18), (240, 150, 50)))
    d = ImageDraw.Draw(img)
    rng = random.Random(71)
    for x in range(0, SIZE, SIZE // 12):  # pumpkin ribs
        d.line([(x, 0), (x + rng.randint(-20, 20), SIZE)], fill=(170, 78, 16), width=10)
    for _ in range(1200):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        d.point((x, y), fill=(230, 140, 40))
    return img


def cornfield():
    img = to_img(blend((96, 122, 44), fbm(SIZE, 79), (70, 96, 30), (150, 168, 70)))
    d = ImageDraw.Draw(img)
    rng = random.Random(83)
    for _ in range(2400):  # tall corn stalks
        x = rng.randrange(SIZE)
        h = rng.randint(200, 700)
        y0 = rng.randrange(SIZE)
        c = rng.choice([(110, 140, 50), (140, 165, 65), (90, 118, 40)])
        d.line([(x, y0), (x + rng.randint(-14, 14), y0 - h)], fill=c, width=5)
        d.ellipse([x - 8, y0 - h, x + 26, y0 - h + 12], fill=(216, 180, 60))
    return img


def water():
    n = fbm(SIZE, 89, octaves=4, base=6)
    img = to_img(blend((52, 110, 140), n, (36, 84, 116), (96, 160, 190)))
    d = ImageDraw.Draw(img)
    rng = random.Random(89)
    for _ in range(500):  # ripple highlights
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        d.arc([x, y, x + rng.randint(20, 70), y + rng.randint(6, 14)],
              start=200, end=340, fill=(190, 225, 240), width=2)
    return img


def tablecloth():
    img = Image.new("RGB", (SIZE, SIZE), (238, 232, 220))
    d = ImageDraw.Draw(img)
    cell = SIZE // 16
    for gy in range(16):
        for gx in range(16):
            if gx % 2 == 0:
                d.rectangle([gx * cell, 0, (gx + 1) * cell, SIZE], fill=(214, 84, 74))
            if gy % 2 == 0:
                d.rectangle([0, gy * cell, SIZE, (gy + 1) * cell], fill=(214, 84, 74))
    # overlap makes the classic gingham darker squares
    arr = np.asarray(img, dtype=np.float64) / 255.0
    n = fbm(SIZE, 97, octaves=3, base=24)
    arr = arr * (0.94 + 0.08 * n[..., None])
    return to_img(arr)


def metal():
    n = fbm(SIZE, 101, octaves=4, base=6)
    streak = np.repeat(np.mean(n, axis=1, keepdims=True), SIZE, axis=1)
    return to_img(blend((150, 152, 156), streak, (118, 120, 126), (196, 198, 202)))


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
    n = fbm(SIZE, 113)
    img = to_img(blend((86, 96, 46), n, (62, 72, 34), (140, 130, 66)))
    d = ImageDraw.Draw(img)
    rng = random.Random(113)
    for _ in range(2600):  # moss tufts and fallen leaves
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        c = rng.choice([(70, 90, 40), (150, 100, 30), (190, 130, 40), (100, 110, 50)])
        d.ellipse([x, y, x + rng.randint(3, 8), y + rng.randint(2, 5)], fill=c)
    return img


def cobble():
    img = to_img(blend((140, 134, 124), fbm(SIZE, 127), (112, 106, 98), (176, 170, 158)))
    d = ImageDraw.Draw(img)
    rng = random.Random(127)
    cw, ch = SIZE // 8, SIZE // 8
    for gy in range(8):
        for gx in range(8):
            shade = rng.uniform(-16, 16)
            c = tuple(int(v + shade) for v in (146, 140, 130))
            d.rounded_rectangle([gx * cw + 3, gy * ch + 3, (gx + 1) * cw - 3, (gy + 1) * ch - 3],
                                radius=26, fill=c)
    return img


def wheat():
    img = to_img(blend((206, 168, 84), fbm(SIZE, 131), (180, 140, 60), (232, 196, 110)))
    d = ImageDraw.Draw(img)
    rng = random.Random(131)
    for _ in range(7000):  # wheat stalks
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        ln = rng.randint(20, 60)
        c = rng.choice([(220, 190, 100), (190, 155, 70), (235, 205, 120)])
        d.line([(x, y), (x + rng.randint(-6, 6), y - ln)], fill=c, width=2)
        d.ellipse([x - 3, y - ln - 6, x + 3, y - ln + 6], fill=(226, 190, 90))
    return img


def plaster():
    n = fbm(SIZE, 137, octaves=4, base=6)
    img = to_img(blend((232, 222, 200), n, (214, 202, 178), (244, 236, 218)))
    d = ImageDraw.Draw(img)
    rng = random.Random(137)
    for _ in range(300):  # hairline cracks
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        d.line([(x, y), (x + rng.randint(-40, 40), y + rng.randint(-40, 40))],
               fill=(200, 188, 164), width=1)
    return img


def pantry():
    img = to_img(blend((150, 110, 70), fbm(SIZE, 149), (120, 86, 52), (186, 142, 92)))
    d = ImageDraw.Draw(img)
    rng = random.Random(149)
    for row in range(4):  # shelves with jars
        y = row * (SIZE // 4) + SIZE // 8
        d.rectangle([0, y, SIZE, y + 14], fill=(96, 64, 38))
        for _ in range(14):
            x = rng.randrange(SIZE)
            w, h = rng.randint(36, 70), rng.randint(70, 130)
            c = rng.choice([(180, 120, 60), (120, 90, 60), (200, 160, 90), (90, 110, 70)])
            d.rounded_rectangle([x, y - h, x + w, y], radius=8, fill=c)
    return img


def main():
    global SIZE
    os.makedirs(OUT, exist_ok=True)
    big = {"grass.png": grass, "dirt.png": dirt, "tiles.png": tiles,
           "leaves.png": leaves, "hay.png": hay, "brick.png": brick,
           "feather.png": feather, "cornfield.png": cornfield,
           "water.png": water, "pumpkin.png": pumpkin,
           "forestfloor.png": forestfloor, "cobble.png": cobble,
           "wheat.png": wheat, "plaster.png": plaster, "pantry.png": pantry}
    small = {"wood.png": wood, "barnwood.png": barnwood, "fencewood.png": fencewood,
             "stone.png": stone, "bark.png": bark, "roof.png": roof,
             "tablecloth.png": tablecloth, "metal.png": metal, "cloud.png": cloud}
    for name, fn in big.items():
        SIZE = 2048
        save(name, fn())
    for name, fn in small.items():
        SIZE = 1024
        save(name, fn())
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"TOTAL assets: {total / (1024 * 1024):.2f} MiB")


if __name__ == "__main__":
    main()
