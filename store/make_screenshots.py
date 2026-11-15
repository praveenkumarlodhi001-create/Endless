"""Apne REAL gameplay screenshots ko Play Store ke liye frame + caption karta hai.

Use:
  1. Phone par game chalao, screenshots lo (shot list: store/SCREENSHOTS.md)
  2. Unhe is folder me ./raw/ naam se rakho (png/jpg)
  3. python3 make_screenshots.py
  Output: ./out/shot_01.png ... (1080x1920, portrait) — Play Console me upload karo.
  Landscape (car mode) screenshot ho to 1920x1080 banta hai.
"""
import glob, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
CAPTIONS = [
    'Endless 3D highway racing',
    'Tilt your phone to steer',
    'Tap to BOOST to 220 km/h',
    'Near misses = bonus score',
    'Unlock bikes, cars & supercars',
    'Drive in car mode (landscape)',
    'Day, evening & night cycle',
    'Free & offline - no ads',
]


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def frame(src, caption, dst):
    im = Image.open(src).convert('RGB')
    land = im.width > im.height
    W, H = (1920, 1080) if land else (1080, 1920)
    bar = 150
    canvas = Image.new('RGB', (W, H), '#0b1220')
    avail_h = H - bar - 40
    avail_w = W - 80
    s = min(avail_w / im.width, avail_h / im.height)
    shot = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    canvas.paste(shot, ((W - shot.width) // 2, bar + 20))
    d = ImageDraw.Draw(canvas)
    size = 64
    f = font(size)
    while d.textlength(caption, font=f) > W - 80 and size > 24:
        size -= 2
        f = font(size)
    d.text(((W - d.textlength(caption, font=f)) / 2, 36), caption, font=f, fill='#ff7a18')
    canvas.save(dst)


def main():
    files = sorted(glob.glob(os.path.join(HERE, 'raw', '*.*')))
    if not files:
        print('raw/ folder me screenshots daalo (min 2, max 8).')
        return
    os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
    for i, p in enumerate(files[:8]):
        dst = os.path.join(HERE, 'out', 'shot_%02d.png' % (i + 1))
        frame(p, CAPTIONS[i % len(CAPTIONS)], dst)
        print('saved', dst)


if __name__ == '__main__':
    main()
