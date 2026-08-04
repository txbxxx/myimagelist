from PIL import Image, ImageDraw, ImageFont, ImageColor
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(OUT_DIR, exist_ok=True)

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

# =================== 1. Color Palette ===================
def palette():
    colors = [
        ('--cartoon-bg', '#FFF9E6', 'Cream'),
        ('--cartoon-bg-soft', '#FFF0F5', 'Soft Pink'),
        ('--cartoon-blue', '#A0C4FF', 'Baby Blue'),
        ('--cartoon-mint', '#CAFFBF', 'Mint'),
        ('--cartoon-pink', '#FFADAD', 'Candy Pink'),
        ('--cartoon-yellow', '#FDFFB6', 'Lemon'),
        ('--cartoon-purple', '#BDB2FF', 'Lavender'),
        ('--cartoon-peach', '#FFD6A5', 'Peach'),
        ('--cartoon-brown', '#4A3B32', 'Ink Brown'),
        ('--cartoon-brown-deep', '#3E2723', 'Deep Brown'),
    ]
    w, h = 1200, 360
    img = Image.new('RGB', (w, h), '#FFFFFF')
    draw = ImageDraw.Draw(img)
    title_font = get_font(32)
    label_font = get_font(18)
    hex_font = get_font(14)
    draw.text((40, 24), '糖果图库 · 设计系统色板', fill='#4A3B32', font=title_font)

    x, y = 40, 80
    box = 100
    gap = 20
    for i, (token, hex_, label) in enumerate(colors):
        if x + box + gap > w:
            x = 40
            y += box + 60
        draw.rounded_rectangle([x, y, x+box, y+box], radius=16, fill=hex_, outline='#4A3B32', width=3)
        # Shadow
        draw.rounded_rectangle([x+4, y+4, x+box+4, y+box+4], radius=16, outline='#4A3B32', width=3)
        draw.text((x, y+box+10), label, fill='#4A3B32', font=label_font)
        draw.text((x, y+box+32), hex_, fill='#6B5A4A', font=hex_font)
        x += box + gap + 10

    img.save(os.path.join(OUT_DIR, 'diagram-palette.png'))
    print('Generated diagram-palette.png')

# =================== 2. ImageCard Anatomy ===================
def card_anatomy():
    w, h = 1200, 800
    img = Image.new('RGB', (w, h), '#FFF9E6')
    draw = ImageDraw.Draw(img)

    title_font = get_font(32)
    body_font = get_font(18)
    small_font = get_font(14)
    draw.text((40, 24), 'ImageCard 组件解剖', fill='#4A3B32', font=title_font)

    # Draw a stylized card
    cx, cy = 180, 180
    cw, ch = 280, 340
    # Shadow
    draw.rounded_rectangle([cx+4, cy+4, cx+cw+4, cy+ch+4], radius=18, fill='#4A3B32')
    # Card body
    draw.rounded_rectangle([cx, cy, cx+cw, cy+ch], radius=18, fill='#FFFFFF', outline='#4A3B32', width=3)
    # Thumb area
    draw.rounded_rectangle([cx+12, cy+12, cx+cw-12, cy+cw-12], radius=12, fill='#FFE0EC', outline='#4A3B32', width=2)
    # Category badge
    draw.rounded_rectangle([cx+24, cy+24, cx+110, cy+50], radius=999, fill='#A0C4FF', outline='#4A3B32', width=2)
    draw.text((cx+34, cy+28), '旅行', fill='#4A3B32', font=small_font)
    # Download button
    draw.rounded_rectangle([cx+cw-52, cy+24, cx+cw-20, cy+56], radius=18, fill='#FFFFFF', outline='#4A3B32', width=2)
    # Media badge
    draw.rounded_rectangle([cx+24, cy+cw-50, cx+90, cy+cw-26], radius=999, fill='#FF7A7A', outline='#4A3B32', width=2)
    draw.text((cx+32, cy+cw-46), 'VIDEO', fill='#FFFFFF', font=small_font)
    # Footer
    draw.text((cx+20, cy+cw+20), 'sample-blue.jpg', fill='#3E2723', font=body_font)
    draw.text((cx+20, cy+cw+48), '24.5 KB • 800×800 • JPEG • 08-04', fill='#6B5A4A', font=small_font)

    # Labels with lines
    labels = [
        ((cx+24, cy+24), '分类标签：糖果色胶囊'),
        ((cx+cw-52, cy+24), '悬浮下载按钮'),
        ((cx+24, cy+cw-50), '媒体类型角标'),
        ((cx+20, cy+cw+20), '文件名与元信息'),
        ((cx+cw//2, cy+ch//2), '1:1 缩略图区'),
    ]
    for (lx, ly), text in labels:
        draw.line([(lx, ly), (lx+180, ly-40 if ly > cy+ch//2 else ly-20)], fill='#4A3B32', width=2)
        draw.text((lx+185, ly-55 if ly > cy+ch//2 else ly-35), text, fill='#4A3B32', font=body_font)

    img.save(os.path.join(OUT_DIR, 'diagram-card-anatomy.png'))
    print('Generated diagram-card-anatomy.png')

# =================== 3. UX Flow ===================
def ux_flow():
    w, h = 1200, 500
    img = Image.new('RGB', (w, h), '#FFF9E6')
    draw = ImageDraw.Draw(img)

    title_font = get_font(32)
    node_font = get_font(18)
    draw.text((40, 24), '核心用户流程', fill='#4A3B32', font=title_font)

    nodes = [
        ('登录 / 注册', 120, 160, '#A0C4FF'),
        ('画廊浏览', 360, 160, '#CAFFBF'),
        ('分类筛选', 600, 100, '#FFD6A5'),
        ('大图预览', 600, 220, '#FFADAD'),
        ('上传文件', 840, 160, '#BDB2FF'),
        ('管理分类', 840, 280, '#FDFFB6'),
    ]

    for text, x, y, color in nodes:
        draw.rounded_rectangle([x, y, x+160, y+60], radius=16, fill=color, outline='#4A3B32', width=3)
        draw.rounded_rectangle([x+4, y+4, x+164, y+64], radius=16, outline='#4A3B32', width=2)
        bbox = draw.textbbox((0, 0), text, font=node_font)
        tw = bbox[2] - bbox[0]
        draw.text((x+(160-tw)//2, y+18), text, fill='#4A3B32', font=node_font)

    # Arrows
    def arrow(x1, y1, x2, y2):
        draw.line([(x1, y1), (x2, y2)], fill='#4A3B32', width=3)
        # Arrowhead
        draw.polygon([(x2, y2), (x2-8, y2-5), (x2-8, y2+5)], fill='#4A3B32')

    arrow(280, 190, 360, 190)
    arrow(520, 190, 600, 130)
    arrow(520, 190, 600, 250)
    arrow(760, 130, 840, 190)
    arrow(760, 250, 840, 190)

    img.save(os.path.join(OUT_DIR, 'diagram-ux-flow.png'))
    print('Generated diagram-ux-flow.png')

palette()
card_anatomy()
ux_flow()
