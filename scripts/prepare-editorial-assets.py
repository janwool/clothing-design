#!/usr/bin/env python3
"""Resize selected Imagegen editorial sources into web-ready WebP assets."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


PROJECT_ROOT = Path(__file__).resolve().parents[1]
GENERATED_ROOT = Path.home() / ".codex/generated_images/01a005f4-466e-7cd3-81b5-25e0fecaf393"
OUTPUT_ROOT = PROJECT_ROOT / "public/images/editorial"

ASSETS = {
    "exec-42f29003-399a-4cc1-a46c-a5832eb8d9db.png": "apparel-designer-studio.webp",
    "exec-f02d63b7-c465-46bb-82dd-cd8da1490127.png": "pod-studio-review.webp",
    "exec-42350f4b-c704-4f4d-864d-046fae7505b7.png": "garment-team-review.webp",
}


def build_brand_icon() -> None:
    size = 1024
    icon = Image.new("RGB", (size, size), "#f7f5ef")
    draw = ImageDraw.Draw(icon)
    draw.rounded_rectangle((96, 96, 928, 928), radius=210, fill="#181816")

    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 590)
    glyph_box = draw.textbbox((0, 0), "C", font=font)
    glyph_width = glyph_box[2] - glyph_box[0]
    glyph_height = glyph_box[3] - glyph_box[1]
    glyph_x = (size - glyph_width) / 2 - 20
    glyph_y = (size - glyph_height) / 2 - glyph_box[1]
    draw.text((glyph_x, glyph_y), "C", font=font, fill="#ffffff")
    draw.rounded_rectangle((720, 295, 760, 729), radius=20, fill="#187665")

    icon.save(PROJECT_ROOT / "public/images/icon.png", "PNG", optimize=True)


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    for source_name, output_name in ASSETS.items():
        image = Image.open(GENERATED_ROOT / source_name).convert("RGB")
        image.thumbnail((1200, 900), Image.Resampling.LANCZOS)
        output_path = OUTPUT_ROOT / output_name
        image.save(output_path, "WEBP", quality=88, method=6)
        print(f"{output_path.relative_to(PROJECT_ROOT)} {image.width}x{image.height}")
    build_brand_icon()
    print("public/images/icon.png 1024x1024")


if __name__ == "__main__":
    main()
