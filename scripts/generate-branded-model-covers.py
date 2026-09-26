#!/usr/bin/env python3
"""Build catalog covers from the actual 3D preview renders.

The garment pixels come from each model's existing render. This script removes
the dark render backdrop, places a small ClozDesign print on the garment, and
exports a lighter catalog composition. It never synthesizes garment geometry.
"""

import argparse
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/images/model-covers/render-branded-v2"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"


def source_rows():
    return json.loads((ROOT / "scripts/model-cover-source-manifest.json").read_text())


def download(url, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size > 1000:
        return
    subprocess.run([
        "curl", "-L", "--fail", "--silent", "--show-error", "--max-time", "30",
        "--output", str(destination), url,
    ], check=True)


def garment_mask(rgb):
    """Select bright model-render pixels, leaving the dark preview stage out."""
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    bright = np.uint8(gray > 57)
    bright = cv2.morphologyEx(bright, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(bright, 8)
    mask = np.zeros_like(bright)
    for component in range(1, count):
        x, y, width, height, area = stats[component]
        if area > 750 and y < rgb.shape[0] * 0.91:
            mask[labels == component] = 255
    if cv2.countNonZero(mask) < 2000:
        raise ValueError("Could not isolate rendered garment")
    mask = cv2.erode(mask, np.ones((3, 3), np.uint8), iterations=1)
    return cv2.GaussianBlur(mask, (5, 5), 0.8)


def bounds(mask):
    ys, xs = np.where(mask > 180)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def logo_position(category, box):
    x0, y0, x1, y1 = box
    width, height = x1 - x0, y1 - y0
    category = category.lower()
    placement = {
        "pants": (0.61, 0.35, 0.17),
        "underwear": (0.61, 0.28, 0.17),
        "skirt": (0.56, 0.34, 0.23),
        "hat": (0.50, 0.42, 0.24),
        "bag": (0.50, 0.45, 0.20),
        "dress": (0.62, 0.25, 0.16),
        "top": (0.72, 0.40, 0.16),
        "shirt": (0.72, 0.39, 0.16),
        "jacket": (0.73, 0.40, 0.16),
        "hoodie": (0.67, 0.45, 0.16),
        "blazer": (0.72, 0.42, 0.16),
        "coat": (0.72, 0.42, 0.16),
    }.get(category, (0.65, 0.33, 0.17))
    center_x = x0 + width * placement[0]
    center_y = y0 + height * placement[1]
    return center_x, center_y, max(60, int(width * placement[2]))


def fit_logo_to_fabric(mask, preferred_x, preferred_y, mark):
    """Move a print onto a solid visible panel instead of a neck/opening."""
    height, width = mask.shape
    mark_w, mark_h = mark.size
    best = None
    for dx in (-0.16, -0.08, 0, 0.08, 0.16):
        for dy in (-0.16, -0.08, 0, 0.08, 0.16, 0.24):
            cx = round(preferred_x + dx * width)
            cy = round(preferred_y + dy * height)
            x0 = round(cx - mark_w * 0.44)
            x1 = round(cx + mark_w * 0.44)
            y0 = round(cy - mark_h * 0.39)
            y1 = round(cy + mark_h * 0.39)
            if x0 < 0 or y0 < 0 or x1 >= width or y1 >= height:
                continue
            occupancy = np.mean(mask[y0:y1, x0:x1] > 205)
            distance = (abs(dx) + abs(dy)) * 0.7
            score = occupancy * 3 - distance
            if best is None or score > best[0]:
                best = (score, cx, cy)
    return (best[1], best[2]) if best else (preferred_x, preferred_y)


def brand_mark(width):
    height = int(width * 0.53)
    logo = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(logo)
    title_font = ImageFont.truetype(FONT_BOLD, int(width * 0.27))
    sub_font = ImageFont.truetype(FONT_REGULAR, int(width * 0.103))
    title = "Cloz"
    subtitle = "D E S I G N"
    title_box = draw.textbbox((0, 0), title, font=title_font)
    subtitle_box = draw.textbbox((0, 0), subtitle, font=sub_font)
    draw.text(((width - (title_box[2] - title_box[0])) / 2, -title_box[1]), title,
              font=title_font, fill=(29, 34, 38, 220))
    draw.text(((width - (subtitle_box[2] - subtitle_box[0])) / 2, height * 0.65 - subtitle_box[1]),
              subtitle, font=sub_font, fill=(29, 34, 38, 210))
    return logo.filter(ImageFilter.GaussianBlur(0.25))


def make_cover(source, category, output):
    original = Image.open(source).convert("RGBA")
    rgb = np.asarray(original.convert("RGB"))
    source_alpha = np.asarray(original.getchannel("A"))
    mask = source_alpha if np.min(source_alpha) < 250 else garment_mask(rgb)
    box = bounds(mask)
    center_x, center_y, mark_width = logo_position(category, box)
    mark = brand_mark(mark_width)
    center_x, center_y = fit_logo_to_fabric(mask, center_x, center_y, mark)

    # Keep the print inside actual garment pixels, including at angled edges.
    logo_layer = Image.new("RGBA", original.size, (0, 0, 0, 0))
    logo_layer.alpha_composite(mark, (round(center_x - mark.width / 2), round(center_y - mark.height / 2)))
    logo_array = np.asarray(logo_layer).copy()
    logo_array[:, :, 3] = np.minimum(logo_array[:, :, 3], mask)
    branded = Image.alpha_composite(original, Image.fromarray(logo_array, "RGBA"))

    width, height = 800, 1000
    yy = np.linspace(0, 1, height)[:, None]
    xx = np.linspace(0, 1, width)[None, :]
    radial = ((xx - 0.5) ** 2 + (yy - 0.35) ** 2) / 0.75
    shade = np.clip(radial * 9, 0, 10).astype(np.uint8)
    base = np.array([247, 245, 240], dtype=np.uint8)
    backdrop = np.broadcast_to(base, (height, width, 3)).copy() - shade[:, :, None]
    composition = Image.fromarray(backdrop, "RGB").convert("RGBA")
    branded.putalpha(Image.fromarray(mask, "L"))
    x0, y0, x1, y1 = box
    branded = branded.crop((max(0, x0 - 4), max(0, y0 - 4), min(original.width, x1 + 5), min(original.height, y1 + 5)))
    scale = min(width * 0.84 / branded.width, height * 0.79 / branded.height)
    branded = branded.resize((round(branded.width * scale), round(branded.height * scale)), Image.Resampling.LANCZOS)
    left = round((width - branded.width) / 2)
    top = round((height - branded.height) / 2 - 14)
    shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_y = min(height - 85, top + branded.height + 16)
    shadow_draw.ellipse((left + branded.width * 0.16, shadow_y - 14,
                         left + branded.width * 0.84, shadow_y + 22), fill=(70, 63, 57, 40))
    composition.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(24)))
    composition.alpha_composite(branded, (left, top))
    final = composition.convert("RGB")
    output.parent.mkdir(parents=True, exist_ok=True)
    final.save(output, "WEBP", quality=88, method=6)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=Path("/tmp/cloz-live-originals"))
    parser.add_argument("--slug", help="Render one model while checking placement")
    args = parser.parse_args()
    rows = [row for row in source_rows() if not args.slug or row["slug"] == args.slug]
    if args.slug and not rows:
        parser.error(f"Unknown active model: {args.slug}")
    manifest = {}
    for row in rows:
        source = args.source_dir / f"{row['slug']}.webp"
        download(row["image_url"], source)
        target = OUTPUT / f"{row['slug']}.webp"
        make_cover(source, row["category"], target)
        manifest[row["slug"]] = f"/images/model-covers/render-branded-v2/{row['slug']}.webp"
        print(target.relative_to(ROOT))
    if not args.slug:
        (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
