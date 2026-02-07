"""Optimize V3 assets for web: resize, compress, copy to public/"""
from PIL import Image
import shutil, os

SRC = r"C:\Dev\skyrate\assets\generated"
DST = r"C:\Dev\skyrate\frontend\public\images"

def optimize(src, dst, max_size, quality=85):
    img = Image.open(src)
    img.thumbnail((max_size, max_size), Image.LANCZOS)
    if img.mode == 'RGBA':
        img.save(dst, 'PNG', optimize=True)
    else:
        img = img.convert('RGB')
        img.save(dst, 'JPEG', quality=quality, optimize=True)
    kb = os.path.getsize(dst) // 1024
    print(f"  {os.path.basename(dst)}: {img.size[0]}x{img.size[1]} ({kb}KB)")

print("=== LOGOS ===")
# Master horizontal logo - keep decent size
optimize(f"{SRC}/logos/logo_horizontal.png", f"{DST}/logos/logo-horizontal.png", 600)
optimize(f"{SRC}/v3/logos/logo_icon_v3.png", f"{DST}/logos/logo-icon.png", 128)
optimize(f"{SRC}/v3/logos/logo_dark_v3.png", f"{DST}/logos/logo-dark.png", 400)
optimize(f"{SRC}/v3/logos/logo_white_v3.png", f"{DST}/logos/logo-white.png", 400)

print("\n=== ICONS (64x64 for nav) ===")
icons = ['dashboard', 'school', 'funding', 'vendor', 'consultant', 'appeal', 'ai', 'notification']
for name in icons:
    optimize(f"{SRC}/v3/icons/icon_{name}_v3.png", f"{DST}/icons/{name}.png", 64)

print("\n=== BACKGROUNDS (max 1920w) ===")
bgs = ['hero', 'gradient', 'network', 'data']
for name in bgs:
    optimize(f"{SRC}/v3/backgrounds/bg_{name}_v3.png", f"{DST}/backgrounds/{name}.png", 1920, quality=80)

print("\n=== ILLUSTRATIONS (max 800w) ===")
ills = ['erate', 'consultant', 'vendor', 'success', 'ai']
for name in ills:
    optimize(f"{SRC}/v3/illustrations/illus_{name}_v3.png", f"{DST}/illustrations/{name}.png", 800)

print("\n=== MARKETING ===")
optimize(f"{SRC}/v3/marketing/og_image_v3.png", f"{DST}/marketing/og-image.png", 1200, quality=85)
optimize(f"{SRC}/v3/marketing/social_linkedin_v3.png", f"{DST}/marketing/linkedin.png", 1200, quality=85)
optimize(f"{SRC}/v3/marketing/social_twitter_v3.png", f"{DST}/marketing/twitter.png", 1200, quality=85)

# Generate favicon (32x32 ICO)
print("\n=== FAVICON ===")
icon_img = Image.open(f"{SRC}/v3/logos/logo_icon_v3.png")
icon_img.thumbnail((32, 32), Image.LANCZOS)
icon_img.save(f"{DST}/../favicon.ico", format='ICO', sizes=[(32, 32)])
print(f"  favicon.ico: 32x32")

# Apple touch icon (180x180)
touch = Image.open(f"{SRC}/v3/logos/logo_icon_v3.png")
touch.thumbnail((180, 180), Image.LANCZOS)
touch.save(f"{DST}/../apple-touch-icon.png", 'PNG', optimize=True)
print(f"  apple-touch-icon.png: 180x180")

print("\nDone!")
