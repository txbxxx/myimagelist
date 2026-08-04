from PIL import Image, ImageDraw, ImageFont, ImageColor
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(OUT_DIR, exist_ok=True)

COLORS = {
    'blue':   ('#A0C4FF', '#3B5998', 'Blue Sky'),
    'pink':   ('#FFADAD', '#8B3A3A', 'Cherry Blossom'),
    'mint':   ('#CAFFBF', '#3A6B3A', 'Fresh Mint'),
    'yellow': ('#FDFFB6', '#8B8B2E', 'Lemon Drop'),
    'purple': ('#BDB2FF', '#4B3A8B', 'Lavender'),
    'peach':  ('#FFD6A5', '#8B5A2E', 'Peachy'),
}

FONT_PATHS = [
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/segoeui.ttf',
    'C:/Windows/Fonts/msyh.ttc',
]

def get_font(size):
    for p in FONT_PATHS:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

def make_image(name, bg, fg, label, size=(800, 800)):
    img = Image.new('RGB', size, bg)
    draw = ImageDraw.Draw(img)

    # Decorative circles
    for i, (cx, cy, r) in enumerate([
        (size[0]*0.2, size[1]*0.25, 120),
        (size[0]*0.75, size[1]*0.2, 90),
        (size[0]*0.65, size[1]*0.75, 150),
        (size[0]*0.15, size[1]*0.8, 70),
    ]):
        alpha = 180 if i % 2 == 0 else 120
        fill = (*ImageColor.getrgb(fg if i % 2 else '#FFFFFF'), alpha)
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=fg if i % 2 else '#FFFFFF')

    # Central rounded rectangle
    margin = 80
    draw.rounded_rectangle(
        [margin, size[1]//2 - 120, size[0]-margin, size[1]//2 + 120],
        radius=40,
        fill='#FFFFFF',
        outline=fg,
        width=8
    )

    # Label text
    font = get_font(64)
    bbox = draw.textbbox((0, 0), label, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size[0]-tw)//2, (size[1]-th)//2 - 10), label, fill=fg, font=font)

    # Small caption
    small_font = get_font(28)
    caption = f"Sample · {name.title()}"
    bbox2 = draw.textbbox((0, 0), caption, font=small_font)
    tw2, th2 = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]
    draw.text(((size[0]-tw2)//2, size[1] - 120), caption, fill=fg, font=small_font)

    return img

def make_gif(path, bg, fg, label):
    frames = []
    font = get_font(64)
    small_font = get_font(28)
    for offset in range(0, 40, 10):
        img = Image.new('RGB', (800, 800), bg)
        draw = ImageDraw.Draw(img)
        # Moving circles
        draw.ellipse([140+offset, 180, 260+offset, 300], fill=fg)
        draw.ellipse([540-offset, 140, 660-offset, 260], fill='#FFFFFF')
        draw.rounded_rectangle([80, 320, 720, 520], radius=40, fill='#FFFFFF', outline=fg, width=8)
        bbox = draw.textbbox((0, 0), label, font=font)
        draw.text(((800-(bbox[2]-bbox[0]))//2, 380), label, fill=fg, font=font)
        bbox2 = draw.textbbox((0, 0), 'GIF Sample', font=small_font)
        draw.text(((800-(bbox2[2]-bbox2[0]))//2, 700), 'GIF Sample', fill=fg, font=small_font)
        frames.append(img)
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=200, loop=0)

def make_png_transparent(path, bg, fg, label):
    img = Image.new('RGBA', (800, 800), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([80, 80, 720, 720], radius=60, fill=bg + 'DD', outline=fg, width=8)
    font = get_font(64)
    bbox = draw.textbbox((0, 0), label, font=font)
    draw.text(((800-(bbox[2]-bbox[0]))//2, 360), label, fill=fg, font=font)
    small_font = get_font(28)
    bbox2 = draw.textbbox((0, 0), 'Transparent PNG', font=small_font)
    draw.text(((800-(bbox2[2]-bbox2[0]))//2, 680), 'Transparent PNG', fill=fg, font=small_font)
    img.save(path)

# Generate static samples
for name, (bg, fg, label) in COLORS.items():
    img = make_image(name, bg, fg, label)
    img.save(os.path.join(OUT_DIR, f'sample-{name}.jpg'), quality=90)
    print(f'Generated sample-{name}.jpg')

# Generate GIF
make_gif(os.path.join(OUT_DIR, 'sample-animation.gif'), '#FFADAD', '#8B3A3A', 'Animation')
print('Generated sample-animation.gif')

# Generate transparent PNG
make_png_transparent(os.path.join(OUT_DIR, 'sample-transparent.png'), '#CAFFBF', '#3A6B3A', 'PNG')
print('Generated sample-transparent.png')
