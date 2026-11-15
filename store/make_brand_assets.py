"""GOT RIDER brand asset generator.

Regenerates every branding image from code (no external art needed):
  assets/logo.png            transparent logo (emblem + wordmark + tagline)
  assets/icon.png            1024x1024 launcher icon (opaque)
  assets/adaptive-icon.png   1024x1024 adaptive foreground (transparent, safe zone respected)
  assets/splash-icon.png     1024x1024 native splash image (transparent)
  assets/home-bg.jpg         1080x1920 menu background
  store/play-icon-512.png    Play Store hi-res icon
  store/feature-graphic-1024x500.png

Needs: python3, pillow, numpy, scipy.   Run:  python3 store/make_brand_assets.py
Fonts: Inter Black Italic (OFL) - adjust FONT_* paths if it lives elsewhere.
"""
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, 'assets')
FONT_BLACK_IT = '/usr/share/fonts/opentype/inter/Inter-BlackItalic.otf'
FONT_BOLD = '/usr/share/fonts/opentype/inter/Inter-Bold.otf'
FONT_BOLD_IT = '/usr/share/fonts/opentype/inter/Inter-ExtraBoldItalic.otf'

BLACK = (10, 10, 13)
RED = (225, 29, 46)

# ---------------------------------------------------------------- helpers
def lerp_stops(t, stops):
    """t: ndarray 0..1, stops: [(pos,(r,g,b)),...] -> HxWx3 float"""
    pos = np.array([s[0] for s in stops])
    out = np.zeros(t.shape + (3,), dtype=np.float32)
    for c in range(3):
        out[..., c] = np.interp(t, pos, [s[1][c] for s in stops])
    return out

SILVER = [(0.0, (255, 255, 255)), (0.30, (222, 227, 234)), (0.47, (140, 148, 160)),
          (0.50, (38, 42, 50)), (0.54, (96, 104, 116)), (0.70, (196, 203, 213)),
          (0.88, (240, 243, 247)), (1.0, (150, 158, 170))]
REDM = [(0.0, (255, 120, 120)), (0.30, (240, 52, 66)), (0.47, (190, 20, 34)),
        (0.50, (60, 4, 10)), (0.54, (140, 14, 26)), (0.70, (226, 38, 54)),
        (0.88, (255, 96, 104)), (1.0, (170, 18, 30))]

def metal(mask, stops, bevel=1.0, size_ref=None):
    """mask: float HxW 0..1. Returns RGBA float (0..255) chrome-filled, bevelled shape."""
    H, W = mask.shape
    ys = np.where(mask.max(axis=1) > 0.5)[0]
    y0, y1 = (ys[0], ys[-1]) if len(ys) else (0, H - 1)
    t = np.clip((np.arange(H)[:, None] - y0) / max(1, (y1 - y0)), 0, 1) * np.ones((1, W))
    col = lerp_stops(t, stops)
    ref = size_ref or (y1 - y0)
    # height map for bevel via distance transform
    inside = mask > 0.5
    dist = ndi.distance_transform_edt(inside)
    bw = max(2.0, ref * 0.045)
    hmap = np.clip(dist / bw, 0, 1)
    hmap = ndi.gaussian_filter(hmap, ref * 0.006)
    gy, gx = np.gradient(hmap)
    shade = (-(gx * -0.7 + gy * -0.7)) * bevel * 3.2  # light from top-left
    col = col + shade[..., None] * 110
    # specular edge line
    edge = inside & ~ndi.binary_erosion(inside, iterations=max(1, int(ref * 0.008)))
    col[edge] = col[edge] * 0.55 + 255 * 0.45
    col = np.clip(col, 0, 255)
    a = ndi.gaussian_filter(mask, 0.6)
    return np.dstack([col, a * 255])

def over(base, layer):
    """alpha-composite float RGBA layer onto float RGBA base (both 0..255)."""
    a = layer[..., 3:4] / 255.0
    ba = base[..., 3:4] / 255.0
    oa = a + ba * (1 - a)
    rgb = (layer[..., :3] * a + base[..., :3] * ba * (1 - a)) / np.maximum(oa, 1e-6)
    return np.dstack([rgb, oa * 255])

def glow_layer(mask, color, radius, strength=1.0):
    g = ndi.gaussian_filter(mask.astype(np.float32), radius) * strength
    g = np.clip(g, 0, 1)
    rgb = np.ones(mask.shape + (3,), dtype=np.float32) * np.array(color, dtype=np.float32)
    return np.dstack([rgb, g * 255])

def outline_layer(mask, px, color=(8, 8, 10)):
    m = ndi.binary_dilation(mask > 0.5, iterations=max(1, int(px)))
    m = ndi.gaussian_filter(m.astype(np.float32), 0.8)
    rgb = np.ones(mask.shape + (3,), dtype=np.float32) * np.array(color, dtype=np.float32)
    return np.dstack([rgb, m * 255])

def shape_mask(size, draw_fn, ss=2):
    W, H = size
    im = Image.new('L', (W * ss, H * ss), 0)
    d = ImageDraw.Draw(im)
    draw_fn(d, ss)
    im = im.resize((W, H), Image.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0

def text_mask(size, text, font_path, font_px, xy, tracking=0, shear=0.0, anchor='lm', ss=2):
    W, H = size
    f = ImageFont.truetype(font_path, font_px * ss)
    im = Image.new('L', (W * ss, H * ss), 0)
    d = ImageDraw.Draw(im)
    x, y = xy[0] * ss, xy[1] * ss
    if tracking == 0:
        d.text((x, y), text, font=f, fill=255, anchor=anchor)
    else:
        total = sum(d.textlength(ch, font=f) for ch in text) + tracking * ss * (len(text) - 1)
        if anchor[0] == 'm':
            x -= total / 2
        for ch in text:
            d.text((x, y), ch, font=f, fill=255, anchor='l' + anchor[1])
            x += d.textlength(ch, font=f) + tracking * ss
    if shear:
        im = im.transform(im.size, Image.AFFINE, (1, shear, -shear * y, 0, 1, 0), resample=Image.BICUBIC)
    im = im.resize((W, H), Image.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0

def to_img(arr, mode='RGBA'):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode)

def paste_rgba(base_img, over_img, xy):
    base_img.alpha_composite(over_img, xy)

# ---------------------------------------------------------------- emblem
def emblem(S=1000):
    """Winged wheel emblem. Returns RGBA float array SxS (transparent bg)."""
    c = S / 2
    R = S * 0.285  # ring outer radius
    cv = np.zeros((S, S, 4), dtype=np.float32)

    # --- red energy glow
    full = np.zeros((S, S), dtype=np.float32)
    yy, xx = np.mgrid[0:S, 0:S]
    rr = np.hypot(xx - c, yy - c)
    full[rr < R * 1.05] = 1
    cv = over(cv, glow_layer(full, RED, S * 0.05, 1.3))

    # --- wings: four clean swept blades per side (bottom blade is red)
    FEATH = [  # (root y, tip x, rise)  in units of S
        (-0.105, 0.495, 0.135),
        (-0.040, 0.455, 0.112),
        (0.025, 0.405, 0.090),
        (0.090, 0.340, 0.068),
    ]
    def blade(i, side, ss):
        y, xt, rise = FEATH[i]
        x0 = 0.22
        th = 0.050
        A = (x0, y)
        B = (xt, y - rise)
        C = (x0 + 0.02, y + th)
        # slightly concave lower edge for a swooshy look
        mx = x0 + 0.02 + (xt - x0 - 0.02) * 0.55
        my = (y + th) + ((y - rise) - (y + th)) * 0.55 + 0.016
        D = (mx, my)
        return [(c * ss + side * px * S * ss, c * ss + py * S * ss) for px, py in (A, B, D, C)]

    def draw_feathers(idx):
        def f(d, ss):
            for side in (1, -1):
                for i in idx:
                    d.polygon(blade(i, side, ss), fill=255)
        return f
    wm = shape_mask((S, S), draw_feathers([0, 1, 2]), ss=3)
    cv = over(cv, outline_layer(wm, S * 0.009))
    cv = over(cv, metal(wm, SILVER, bevel=1.1, size_ref=S * 0.12))
    bm = shape_mask((S, S), draw_feathers([3]), ss=3)
    cv = over(cv, outline_layer(bm, S * 0.009))
    cv = over(cv, metal(bm, REDM, bevel=1.0, size_ref=S * 0.06))

    # --- outer ring (silver chrome)
    ring = ((rr <= R) & (rr >= R * 0.86)).astype(np.float32)
    ring = ndi.gaussian_filter(ring, 0.8)
    cv = over(cv, outline_layer(ring, S * 0.008))
    cv = over(cv, metal(ring, SILVER, bevel=1.2, size_ref=R * 2))

    # --- black disc
    disc = (rr < R * 0.84).astype(np.float32)
    dsc = np.zeros((S, S, 4), dtype=np.float32)
    g = np.clip(1 - rr / (R * 0.84), 0, 1)
    base = np.dstack([14 + 26 * g, 14 + 8 * g, 18 + 10 * g])
    dsc[..., :3] = base
    dsc[..., 3] = ndi.gaussian_filter(disc, 0.8) * 255
    cv = over(cv, dsc)

    # --- red tread ring (segmented, like tyre / rev ring)
    ang = np.arctan2(yy - c, xx - c)
    seg = ((np.floor((ang + math.pi) / (2 * math.pi) * 48) % 2) == 0)
    tread = ((rr <= R * 0.80) & (rr >= R * 0.72) & seg).astype(np.float32)
    tread = ndi.gaussian_filter(tread, 0.8)
    cv = over(cv, metal(tread, REDM, bevel=0.6, size_ref=R * 1.6))

    # --- thin silver inner ring
    ir = ((rr <= R * 0.68) & (rr >= R * 0.655)).astype(np.float32)
    cv = over(cv, metal(ndi.gaussian_filter(ir, 0.8), SILVER, bevel=0.3, size_ref=R * 1.4))

    # --- speed slashes behind letter
    def slashes(d, ss):
        for k, (dx, w) in enumerate([(-0.20, 0.012), (-0.15, 0.022), (-0.09, 0.012)]):
            x = c * ss + dx * S * ss
            d.polygon([(x - 0.10 * S * ss, c * ss + 0.15 * S * ss), (x - 0.10 * S * ss + w * S * ss * 3, c * ss + 0.15 * S * ss),
                       (x + 0.10 * S * ss + w * S * ss * 3, c * ss - 0.15 * S * ss), (x + 0.10 * S * ss, c * ss - 0.15 * S * ss)], fill=255)
    sm = shape_mask((S, S), slashes)
    sm *= (rr < R * 0.64)
    cv = over(cv, np.dstack([np.ones((S, S, 3)) * np.array((130, 12, 24)), sm * 150]))

    # --- G letter
    gm = text_mask((S, S), 'G', FONT_BLACK_IT, int(S * 0.34), (c + S * 0.005, c + S * 0.012), anchor='mm', shear=0.0)
    cv = over(cv, outline_layer(gm, S * 0.006))
    cv = over(cv, metal(gm, SILVER, bevel=1.0, size_ref=S * 0.26))
    return cv


# ---------------------------------------------------------------- full logo
def logo(W=1600, H=1300, with_emblem=True, tagline=True):
    cv = np.zeros((H, W, 4), dtype=np.float32)
    ey = 0
    if with_emblem:
        E = 940
        em = emblem(E)
        eimg = to_img(em)
        base = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        base.alpha_composite(eimg, ((W - E) // 2, 0))
        cv = np.asarray(base, dtype=np.float32)
        ey = int(E * 0.5 + E * 0.285) + 10   # bottom of the ring
    # wordmark
    wy = ey + 175 if with_emblem else 330
    fpx = 330
    # measure to fit
    f = ImageFont.truetype(FONT_BLACK_IT, fpx)
    d0 = ImageDraw.Draw(Image.new('L', (10, 10)))
    gw = d0.textlength('GOT', font=f)
    rw = d0.textlength('RIDER', font=f)
    gap = fpx * 0.20
    track = fpx * 0.01
    total = gw + gap + rw + track * 7
    scale = (W * 0.94) / total
    fpx = int(fpx * scale)
    f = ImageFont.truetype(FONT_BLACK_IT, fpx)
    gw = d0.textlength('GOT', font=f) + track * 3 * scale
    rw = d0.textlength('RIDER', font=f) + track * 5 * scale
    gap = fpx * 0.20
    total = gw + gap + rw
    x0 = (W - total) / 2
    shear = 0.0
    m_got = text_mask((W, H), 'GOT', FONT_BLACK_IT, fpx, (x0, wy), tracking=track * scale, anchor='lm')
    m_rid = text_mask((W, H), 'RIDER', FONT_BLACK_IT, fpx, (x0 + gw + gap, wy), tracking=track * scale, anchor='lm')
    both = np.maximum(m_got, m_rid)
    cv = over(cv, glow_layer(both, RED, 22, 1.0))
    cv = over(cv, outline_layer(both, 9))
    cv = over(cv, metal(m_got, REDM, bevel=1.3, size_ref=fpx * 0.73))
    cv = over(cv, metal(m_rid, SILVER, bevel=1.3, size_ref=fpx * 0.73))

    # speed-stripe under wordmark
    sy = wy + fpx * 0.50
    def stripe(d, ss):
        L = W * 0.94 * ss
        xl = (W - W * 0.94) / 2 * ss
        y = sy * ss
        h = 11 * ss
        d.polygon([(xl + 28 * ss, y), (xl + L, y), (xl + L - 28 * ss, y + h), (xl, y + h)], fill=255)
    st = shape_mask((W, H), stripe)
    cv = over(cv, glow_layer(st, RED, 8, 1.0))
    cv = over(cv, metal(st, REDM, bevel=0.4, size_ref=11))

    if tagline:
        tm = text_mask((W, H), 'RULE THE ROAD', FONT_BOLD_IT, int(fpx * 0.20), (W / 2, sy + 84), tracking=fpx * 0.075, anchor='mm')
        cv = over(cv, outline_layer(tm, 3))
        cv = over(cv, metal(tm, SILVER, bevel=0.5, size_ref=fpx * 0.15))
    img = to_img(cv)
    bbox = img.getbbox()
    img = img.crop((max(0, bbox[0] - 24), max(0, bbox[1] - 24), min(W, bbox[2] + 24), min(H, bbox[3] + 24)))
    return img


# ---------------------------------------------------------------- bike silhouette background
def bike_mask(W, H, ss=2):
    """Side-view sport-bike + crouched rider silhouette in a W x H box (rider facing right)."""
    def draw(d, s):
        k = W * s / 1000.0
        def P(pts):
            return [(x * k, y * k) for x, y in pts]
        def wheel(cx, cy, r, t):
            d.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], fill=255)
            d.ellipse([(cx - r + t) * k, (cy - r + t) * k, (cx + r - t) * k, (cy + r - t) * k], fill=0)
            d.ellipse([(cx - 17) * k, (cy - 17) * k, (cx + 17) * k, (cy + 17) * k], fill=255)
            for a in range(0, 360, 36):  # thin spokes
                ra = math.radians(a)
                d.line([(cx * k, cy * k), ((cx + (r - t) * math.cos(ra)) * k, (cy + (r - t) * math.sin(ra)) * k)], fill=255, width=int(3 * k))
        RW = 138
        wheel(215, 622, RW, 30)
        wheel(802, 622, RW, 30)
        # rear fender hugging the rear tyre + swingarm
        d.polygon(P([(110, 478), (205, 470), (300, 492), (352, 545), (322, 548), (280, 515), (205, 498), (118, 505)]), fill=255)
        d.polygon(P([(215, 606), (440, 600), (452, 636), (218, 640)]), fill=255)
        # main body: tail, seat, tank, fairing, nose, belly / engine
        d.polygon(P([(92, 455), (150, 418), (262, 406), (346, 424), (432, 428), (484, 386), (572, 374),
                     (642, 394), (704, 414), (792, 468), (864, 528), (872, 558), (832, 578), (786, 596),
                     (730, 614), (652, 652), (524, 676), (430, 662), (384, 612), (332, 560), (252, 520),
                     (162, 502), (104, 482)]), fill=255)
        # tail-light cowl accent + under-tail exhaust
        d.polygon(P([(92, 455), (60, 440), (74, 474), (104, 482)]), fill=255)
        d.polygon(P([(116, 548), (350, 590), (352, 628), (112, 586)]), fill=255)
        # windscreen
        d.polygon(P([(640, 396), (704, 322), (738, 330), (712, 410)]), fill=255)
        # front fork (twin) + brake caliper
        d.polygon(P([(726, 412), (760, 424), (812, 624), (784, 632)]), fill=255)
        d.polygon(P([(738, 414), (764, 424), (822, 622), (800, 628)]), fill=255)
        # rider: helmet, torso (crouched), arm to bar, leg to peg
        d.ellipse([618 * k, 288 * k, 704 * k, 374 * k], fill=255)
        d.polygon(P([(690, 330), (704, 356), (670, 378), (640, 360)]), fill=255)          # helmet chin/visor
        d.polygon(P([(372, 412), (420, 376), (552, 336), (632, 342), (652, 388), (596, 414), (470, 436), (392, 444)]), fill=255)
        d.line(P([(606, 372), (704, 428)]), fill=255, width=int(36 * k))                      # arm
        d.line(P([(402, 432), (528, 492), (470, 632)]), fill=255, width=int(48 * k))          # leg
        d.line(P([(468, 632), (548, 646)]), fill=255, width=int(34 * k))                      # boot
    return shape_mask((W, H), draw, ss=ss)


def home_background(W=1080, H=1920):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # dark base with warm red horizon glow
    base = np.zeros((H, W, 3), dtype=np.float32)
    t = yy / H
    base += np.array([8, 8, 11])
    hor = H * 0.662
    glow = np.exp(-((yy - hor) ** 2) / (2 * (H * 0.11) ** 2)) * np.exp(-((xx - W / 2) ** 2) / (2 * (W * 0.55) ** 2))
    base += glow[..., None] * np.array([170, 20, 34])
    top = np.exp(-((yy) ** 2) / (2 * (H * 0.18) ** 2))
    base += top[..., None] * np.array([26, 26, 34])
    # road in perspective below horizon
    vx, vy = W / 2, hor
    below = yy > vy
    prog = np.clip((yy - vy) / (H - vy), 0, 1)
    half = prog * W * 0.95 + 4
    road = below & (np.abs(xx - vx) < half)
    asphalt = np.array([16, 16, 20]) + prog[..., None] * 8
    base = np.where(road[..., None], asphalt + glow[..., None] * np.array([60, 8, 12]) * (1 - prog[..., None]), base)
    # lane dashes
    for lane in (-0.5, 0.0, 0.5):
        for k in range(14):
            p0 = (k / 14.0) ** 1.9
            p1 = p0 + 0.045 * (1 + p0 * 4)
            m = below & (prog >= p0) & (prog <= p1) & (np.abs(xx - (vx + lane * half)) < (2 + 7 * prog))
            if lane == 0.0:
                col = np.array([190, 190, 200]) * (0.35 + 0.65 * prog[..., None])
            else:
                col = np.array([120, 120, 130]) * (0.25 + 0.5 * prog[..., None])
            base = np.where(m[..., None], col, base)
    # red & silver edge lines
    for sgn, col in ((-1, (225, 29, 46)), (1, (210, 214, 222))):
        m = below & (np.abs(xx - (vx + sgn * half)) < (2 + 5 * prog))
        base = np.where(m[..., None], np.array(col) * (0.3 + 0.7 * prog[..., None]), base)
    # speed streaks (light trails)
    rng = np.random.default_rng(7)
    layer = np.zeros((H, W), dtype=np.float32)
    for i in range(46):
        x = rng.uniform(0, W)
        y = rng.uniform(H * 0.05, H * 0.95)
        ln = rng.uniform(80, 340)
        a = rng.uniform(0.10, 0.35)
        x0, x1 = int(max(0, x - 1.5)), int(min(W, x + 1.5))
        y0, y1 = int(y), int(min(H, y + ln))
        grad = np.linspace(0, a, y1 - y0)[:, None]
        layer[y0:y1, x0:x1] = np.maximum(layer[y0:y1, x0:x1], grad)
    layer = ndi.gaussian_filter(layer, 1.2)
    base += layer[..., None] * np.array([255, 70, 80]) * 0.9

    # bike silhouette
    bw = int(W * 1.0)
    bh = int(bw * 0.72)
    bm = bike_mask(bw, bh)
    by0 = int(H * 0.231)
    mask_full = np.zeros((H, W), dtype=np.float32)
    mask_full[by0:by0 + bh, 0:bw] = bm[: min(bh, H - by0), :W]
    # ground glow behind bike
    base += ndi.gaussian_filter(mask_full, 40)[..., None] * np.array([150, 14, 28]) * 0.9
    # body: dark metallic gradient, full rim light (silver) + red top-edge light
    inside = mask_full > 0.5
    rim = inside & ~ndi.binary_erosion(inside, iterations=3)
    rim_f = ndi.gaussian_filter(rim.astype(np.float32), 1.0)
    rel = np.clip((yy - by0) / bh, 0, 1)
    body = np.dstack([18 + 26 * (1 - rel), 18 + 24 * (1 - rel), 22 + 30 * (1 - rel)])
    # soft inner sheen along the upper surfaces
    sheen = ndi.gaussian_filter(inside.astype(np.float32), 14) - ndi.gaussian_filter(inside.astype(np.float32), 3)
    body += np.clip(sheen, 0, 1)[..., None] * np.array([60, 60, 70]) * 0.8
    base = base * (1 - mask_full[..., None]) + body * mask_full[..., None]
    topw = np.clip(1.25 - (yy - by0) / (bh * 0.9), 0.15, 1)
    base += rim_f[..., None] * (np.array([255, 60, 78]) * topw[..., None] * 0.85 + np.array([220, 225, 235]) * 0.55)
    # reflection on road
    ref = mask_full[by0 + int(bh * 0.88): by0 + bh, :][::-1]
    # vignette
    v = 1 - 0.55 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / 2
    base *= np.clip(v, 0.35, 1)[..., None]
    # film grain
    base += rng.normal(0, 2.0, (H, W, 1))
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), 'RGB')


# ---------------------------------------------------------------- build all
def main():
    os.makedirs(ASSETS, exist_ok=True)
    lg = logo()
    lg.save(os.path.join(ASSETS, 'logo.png'))
    print('logo', lg.size)

    em = to_img(emblem(1000))

    # launcher icon: black + red glow, big emblem + wordmark
    S = 1024
    icon = Image.new('RGBA', (S, S), BLACK + (255,))
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    g = np.exp(-(((xx - S / 2) ** 2) + ((yy - S * 0.42) ** 2)) / (2 * (S * 0.34) ** 2))
    bg = np.dstack([10 + 70 * g, 10 + 5 * g, 13 + 10 * g, np.ones_like(g) * 255])
    icon = Image.fromarray(bg.astype(np.uint8), 'RGBA')
    emb = em.resize((int(S * 0.90), int(S * 0.90)), Image.LANCZOS)
    icon.alpha_composite(emb, ((S - emb.width) // 2, int(S * -0.045)))
    wm = logo(with_emblem=False, tagline=False)
    wm = wm.resize((int(S * 0.80), int(wm.height * S * 0.80 / wm.width)), Image.LANCZOS)
    icon.alpha_composite(wm, ((S - wm.width) // 2, int(S * 0.70)))
    icon.convert('RGB').save(os.path.join(ASSETS, 'icon.png'))

    # adaptive foreground: content inside the central 66% safe circle
    af = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    e2 = em.resize((int(S * 0.74), int(S * 0.74)), Image.LANCZOS)
    af.alpha_composite(e2, ((S - e2.width) // 2, (S - e2.height) // 2))
    af.save(os.path.join(ASSETS, 'adaptive-icon.png'))

    # native splash image (shown on #0a0a0d before the animated in-app splash)
    sp = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    l2 = lg.copy()
    l2.thumbnail((int(S * 0.86), int(S * 0.86)), Image.LANCZOS)
    sp.alpha_composite(l2, ((S - l2.width) // 2, (S - l2.height) // 2))
    sp.save(os.path.join(ASSETS, 'splash-icon.png'))

    # menu background
    home_background().save(os.path.join(ASSETS, 'home-bg.jpg'), quality=88, optimize=True)

    # Play Store icon 512 (flattened; Play applies its own rounding)
    icon.convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(HERE, 'play-icon-512.png'))

    # feature graphic 1024x500
    FW, FH = 1024, 500
    bgimg = home_background(1080, 1920).rotate(0)
    crop = bgimg.crop((0, 690, 1080, 690 + int(1080 * 500 / 1024))).resize((FW, FH), Image.LANCZOS)
    fg = crop.convert('RGBA')
    dark = Image.new('RGBA', (FW, FH), (6, 6, 9, 0))
    gl = np.asarray(fg, dtype=np.float32)
    xs = np.linspace(0, 1, FW)[None, :, None]
    gl[..., :3] *= (0.18 + 0.82 * np.clip((xs - 0.25) / 0.50, 0, 1))  # darken left for the text block
    fg = Image.fromarray(gl.astype(np.uint8), 'RGBA')
    lgs = lg.copy()
    lgs.thumbnail((470, 430), Image.LANCZOS)
    fg.alpha_composite(lgs, (28, (FH - lgs.height) // 2))
    fg.convert('RGB').save(os.path.join(HERE, 'feature-graphic-1024x500.png'))
    print('done')


if __name__ == '__main__':
    main()
