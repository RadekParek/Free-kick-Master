"""Regenerate the original Android launcher/splash art. Requires Pillow (pip install pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android/app/src/main/res"


def icon(size, foreground=False):
    scale = 4
    img = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size * scale / 128
    if not foreground:
        draw.rounded_rectangle((0, 0, size * scale, size * scale), radius=29 * s, fill="#14251b")
    # The foreground of an adaptive icon must fit inside Android's safe circle.
    inset = 0.65 if foreground else 1
    offset = (128 - 128 * inset) / 2
    point = lambda x, y: ((x * inset + offset) * s, (y * inset + offset) * s)
    draw.polygon([point(x, y) for x, y in [(24, 92), (46, 34), (105, 34), (96, 53), (62, 53), (57, 66), (86, 66), (79, 84), (50, 84), (47, 92)]], fill="#c2f970")
    draw.ellipse((*point(79, 76), *point(113, 110)), fill="#f0f3e9")
    draw.polygon([point(x, y) for x, y in [(96, 83), (105, 89), (102, 99), (91, 99), (87, 89)]], fill="#14251b")
    return img.resize((size, size), Image.Resampling.LANCZOS)


for density, size in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    folder = RES / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    icon(size).save(folder / "ic_launcher.png")
    icon(size).save(folder / "ic_launcher_round.png")
    icon(round(size * 2.25), foreground=True).save(folder / "ic_launcher_foreground.png")

for path in RES.glob("drawable*/splash.png"):
    original = Image.open(path)
    w, h = original.size
    img = Image.new("RGB", (w, h), "#111713")
    mark = icon(min(w, h) // 4)
    img.paste(mark, ((w - mark.width) // 2, (h - mark.height) // 2), mark)
    img.save(path)

print("Updated launcher icons and splash art.")
