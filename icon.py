from PIL import Image, ImageDraw, ImageFont
import os

def make_icon(size, path):
    img = Image.new('RGBA', (size, size), (10, 77, 140, 255))
    d = ImageDraw.Draw(img)
    # Cruz hospitalar branca
    cw = size // 4
    cx, cy = size // 2, size // 2
    # Vertical
    d.rectangle([cx - cw // 2, cy - cw * 3 // 2, cx + cw // 2, cy + cw * 3 // 2], fill='white')
    # Horizontal
    d.rectangle([cx - cw * 3 // 2, cy - cw // 2, cx + cw * 3 // 2, cy + cw // 2], fill='white')
    img.save(path, 'PNG')
    print(f'Wrote {path} ({size}x{size})')

make_icon(192, 'icon-192.png')
make_icon(512, 'icon-512.png')
