#!/usr/bin/env python3
"""Generate Android launcher icons (legacy + adaptive) for the AskAI APK from
branding/icon-1024.png, writing into the Capacitor-generated res/ folders.
Run after `npx cap add android`. Requires Pillow."""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "branding", "icon-1024.png")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPTIVE = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}


def tile(size, scale):
    """White square `size` with the logo centered at `scale` of the canvas."""
    src = Image.open(SRC).convert("RGBA")
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    art = src.resize((int(size * scale), int(size * scale)), Image.LANCZOS)
    off = (size - art.width) // 2
    canvas.paste(art, (off, off), art)
    return canvas.convert("RGB")


def main():
    if not os.path.isdir(RES):
        print("res/ not found — run after `npx cap add android`")
        return
    for d, sz in LEGACY.items():
        folder = os.path.join(RES, f"mipmap-{d}")
        os.makedirs(folder, exist_ok=True)
        img = tile(sz, 0.98)
        img.save(os.path.join(folder, "ic_launcher.png"))
        img.save(os.path.join(folder, "ic_launcher_round.png"))
    for d, sz in ADAPTIVE.items():
        folder = os.path.join(RES, f"mipmap-{d}")
        os.makedirs(folder, exist_ok=True)
        # Foreground is full-bleed white so the adaptive mask shows a clean white
        # tile; the mark sits well inside the safe zone so it's never cropped.
        tile(sz, 0.66).save(os.path.join(folder, "ic_launcher_foreground.png"))
        Image.new("RGB", (sz, sz), (255, 255, 255)).save(
            os.path.join(folder, "ic_launcher_background.png")
        )
    print("AskAI launcher icons written to", RES)


if __name__ == "__main__":
    main()
