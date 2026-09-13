#!/usr/bin/env python3
"""Render current/fixed SVGs beside the production cover for selected models."""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def font(size: int, bold: bool = False):
    candidates = [
        Path("/System/Library/Fonts/PingFang.ttc"),
        Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size, index=0)
    return ImageFont.load_default()


def contained(path: Path, size: tuple[int, int]) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    image.thumbnail(size, Image.Resampling.LANCZOS)
    plate = Image.new("RGBA", size, "white")
    plate.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return plate.convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("before_svg_dir", type=Path)
    parser.add_argument("fixed_svg_dir", type=Path)
    parser.add_argument("cover_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    models = json.loads(args.config.read_text(encoding="utf-8"))["models"]

    with tempfile.TemporaryDirectory(prefix="selected-uv-fix-") as directory:
        temporary = Path(directory)
        before_dir, fixed_dir = temporary / "before", temporary / "fixed"
        before_dir.mkdir()
        fixed_dir.mkdir()
        before = [args.before_svg_dir / f"{model['slug']}.svg" for model in models]
        fixed = [args.fixed_svg_dir / f"{model['slug']}.svg" for model in models]
        subprocess.run(["qlmanage", "-t", "-s", "760", "-o", str(before_dir), *map(str, before)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["qlmanage", "-t", "-s", "760", "-o", str(fixed_dir), *map(str, fixed)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        columns = 2
        rows = math.ceil(len(models) / columns)
        cell_w, cell_h, title_h = 1200, 500, 110
        canvas = Image.new("RGB", (columns * cell_w, title_h + rows * cell_h), "#eef1f5")
        draw = ImageDraw.Draw(canvas)
        draw.text((30, 20), "指定 UV SVG 修复对照 — 10 项", fill="#111827", font=font(34, True))
        draw.text((30, 66), "左：线上原版    中：修复候选    右：线上模型封面", fill="#4b5563", font=font(21))
        panel_size = (350, 360)
        labels = (("线上原 SVG", "#b42318"), ("修复后 SVG", "#047857"), ("模型封面", "#1d4ed8"))
        for index, model in enumerate(models):
            col, row = index % columns, index // columns
            x0, y0 = col * cell_w, title_h + row * cell_h
            draw.rounded_rectangle((x0 + 10, y0 + 8, x0 + cell_w - 10, y0 + cell_h - 10), 12, fill="white", outline="#cbd2dc", width=2)
            draw.text((x0 + 24, y0 + 18), f"ID {model['id']}  {model['slug']}", fill="#111827", font=font(18, True))
            actual_type = model.get("actualType") or model.get("actual_type") or model["slug"]
            draw.text((x0 + 24, y0 + 46), actual_type, fill="#6b7280", font=font(15))
            sources = [
                before_dir / f"{model['slug']}.svg.png",
                fixed_dir / f"{model['slug']}.svg.png",
                args.cover_dir / f"{model['slug']}.image",
            ]
            for panel, ((label, color), source) in enumerate(zip(labels, sources)):
                px = x0 + 22 + panel * 388
                draw.text((px, y0 + 77), label, fill=color, font=font(16, True))
                image = contained(source, panel_size)
                canvas.paste(image, (px, y0 + 108))
                draw.rectangle((px, y0 + 108, px + panel_size[0], y0 + 108 + panel_size[1]), outline="#d5dbe4", width=2)

        args.output.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(args.output, optimize=True)
        print(args.output.resolve())


if __name__ == "__main__":
    main()
