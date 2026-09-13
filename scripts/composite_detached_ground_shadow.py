#!/usr/bin/env python3
"""Add a softened, detached Cycles ground shadow to a transparent model cover."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


def composite(
    shadow_source_path: Path,
    model_path: Path,
    output_path: Path,
    opacity: float,
    offset_y: int,
    blur_radius: float,
    alpha_cutoff: float,
) -> None:
    source = Image.open(shadow_source_path).convert("RGBA")
    model = Image.open(model_path).convert("RGBA")
    if source.size != model.size:
        raise ValueError(f"Image sizes differ: shadow={source.size}, model={model.size}")

    source_alpha = source.getchannel("A")
    model_alpha = model.getchannel("A")
    shadow_alpha = ImageChops.subtract(source_alpha, model_alpha)
    model_bbox = model_alpha.getbbox()
    if model_bbox is None:
        raise ValueError("Model alpha mask is empty")
    model_width = model_bbox[2] - model_bbox[0]
    horizontal_padding = round(model_width * 0.1)
    ground_start = max(0, model_bbox[3] - 30)
    ground_only = Image.new("L", source.size, 0)
    ground_box = (
        max(0, model_bbox[0] - horizontal_padding),
        ground_start,
        min(source.width, model_bbox[2] + horizontal_padding),
        min(source.height, model_bbox[3] + 120),
    )
    ground_only.paste(shadow_alpha.crop(ground_box), ground_box)
    shadow_alpha = ground_only
    cutoff = max(0, min(254, round(alpha_cutoff * 255)))
    opacity = max(0.0, min(1.0, opacity))
    denominator = max(1, 255 - cutoff)
    shadow_alpha = shadow_alpha.point(
        lambda value: round(max(value - cutoff, 0) * 255 / denominator * opacity)
    )
    if blur_radius > 0:
        shadow_alpha = shadow_alpha.filter(ImageFilter.GaussianBlur(blur_radius))
    shadow_alpha = shadow_alpha.point(lambda value: 0 if value < 2 else value)

    shadow_layer = source.copy()
    shadow_layer.putalpha(shadow_alpha)
    shifted = Image.new("RGBA", source.size, (0, 0, 0, 0))
    shifted.alpha_composite(shadow_layer, (0, offset_y))
    shifted.alpha_composite(model)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    shifted.save(output_path, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("shadow_source", type=Path)
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--opacity", type=float, default=0.22)
    parser.add_argument("--offset-y", type=int, default=18)
    parser.add_argument("--blur-radius", type=float, default=5.0)
    parser.add_argument("--alpha-cutoff", type=float, default=0.015)
    args = parser.parse_args()
    composite(
        args.shadow_source.resolve(),
        args.model.resolve(),
        args.output.resolve(),
        args.opacity,
        args.offset_y,
        args.blur_radius,
        args.alpha_cutoff,
    )


if __name__ == "__main__":
    main()
