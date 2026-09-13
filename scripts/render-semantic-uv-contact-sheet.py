#!/usr/bin/env python3
"""Rasterize rebuilt UV SVGs and compose a labeled review contact sheet."""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/System/Library/Fonts/Helvetica.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("texture_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--preview-dir", type=Path)
    args = parser.parse_args()

    models = json.loads(args.config.read_text())["models"]
    svg_paths = [args.texture_dir / f"{model['slug']}.svg" for model in models]
    missing = [str(path) for path in svg_paths if not path.exists()]
    if missing:
        raise SystemExit(f"Missing SVGs: {missing}")

    with tempfile.TemporaryDirectory(prefix="semantic-uv-previews-") as directory:
        raster_dir = Path(directory)
        subprocess.run(
            ["qlmanage", "-t", "-s", "700", "-o", str(raster_dir), *map(str, svg_paths)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        columns = 4
        rows = math.ceil(len(models) / columns)
        cell_width, cell_height = 460, 500
        title_height = 86
        canvas = Image.new("RGB", (columns * cell_width, title_height + rows * cell_height), "#f4f5f7")
        draw = ImageDraw.Draw(canvas)
        title_font = font(30, bold=True)
        label_font = font(17, bold=True)
        type_font = font(14)
        draw.text((28, 22), "Semantic UV rebuild — 28 validated SVGs", fill="#111827", font=title_font)
        draw.text((28, 58), "front / back / side / detail zones · upright · exact overlap validation", fill="#4b5563", font=type_font)

        if args.preview_dir:
            args.preview_dir.mkdir(parents=True, exist_ok=True)
        for index, (model, svg_path) in enumerate(zip(models, svg_paths)):
            preview = raster_dir / f"{svg_path.name}.png"
            if not preview.exists():
                raise SystemExit(f"Quick Look did not render {svg_path}")
            image = Image.open(preview).convert("RGB")
            image.thumbnail((420, 420), Image.Resampling.LANCZOS)
            column, row = index % columns, index // columns
            x0, y0 = column * cell_width, title_height + row * cell_height
            draw.rounded_rectangle((x0 + 10, y0 + 8, x0 + cell_width - 10, y0 + cell_height - 10), 12, fill="white", outline="#d1d5db", width=2)
            image_x = x0 + (cell_width - image.width) // 2
            image_y = y0 + 54 + (410 - image.height) // 2
            canvas.paste(image, (image_x, image_y))
            draw.text((x0 + 24, y0 + 18), f"ID {model['id']}  {model['slug']}", fill="#111827", font=label_font)
            draw.text((x0 + 24, y0 + 43), model["actualType"], fill="#6b7280", font=type_font)
            if args.preview_dir:
                shutil.copy2(preview, args.preview_dir / preview.name)

        args.output.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(args.output, optimize=True)
        print(args.output.resolve())


if __name__ == "__main__":
    main()
