#!/usr/bin/env python3
"""Add a restrained, detached studio ground shadow to transparent covers.

The Blender render remains untouched.  This compositor derives placement from
the visible model bounds and writes the shadow only into transparent pixels, so
the hem or product edge cannot acquire a dark fringe.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


def _model_bbox(alpha: Image.Image, threshold: int = 16) -> tuple[int, int, int, int]:
    mask = alpha.point(lambda value: 255 if value >= threshold else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("input image contains no visible model")
    return bbox


def add_ground_shadow(
    source: Path,
    output: Path,
    *,
    gap_ratio: float = 0.012,
    width_ratio: float = 0.68,
    broad_opacity: int = 34,
    contact_opacity: int = 48,
) -> dict[str, object]:
    model = Image.open(source).convert("RGBA")
    alpha = model.getchannel("A")
    left, top, right, bottom = _model_bbox(alpha)
    width = right - left
    height = bottom - top
    canvas_width, canvas_height = model.size

    gap = max(8, round(height * gap_ratio))
    broad_width = max(42, round(width * width_ratio))
    broad_height = max(16, round(height * 0.048))
    contact_width = max(28, round(broad_width * 0.58))
    contact_height = max(8, round(broad_height * 0.42))
    center_x = round((left + right) * 0.5 + width * 0.025)
    broad_center_y = min(canvas_height - broad_height, bottom + gap + broad_height // 2)
    contact_center_y = min(canvas_height - contact_height, bottom + gap + contact_height // 2)

    broad_mask = Image.new("L", model.size, 0)
    draw = ImageDraw.Draw(broad_mask)
    draw.ellipse(
        (
            center_x - broad_width // 2,
            broad_center_y - broad_height // 2,
            center_x + broad_width // 2,
            broad_center_y + broad_height // 2,
        ),
        fill=broad_opacity,
    )
    broad_mask = broad_mask.filter(ImageFilter.GaussianBlur(max(8, broad_height * 0.48)))

    contact_mask = Image.new("L", model.size, 0)
    draw = ImageDraw.Draw(contact_mask)
    draw.ellipse(
        (
            center_x - contact_width // 2,
            contact_center_y - contact_height // 2,
            center_x + contact_width // 2,
            contact_center_y + contact_height // 2,
        ),
        fill=contact_opacity,
    )
    contact_mask = contact_mask.filter(ImageFilter.GaussianBlur(max(4, contact_height * 0.62)))

    shadow_alpha = ImageChops.lighter(broad_mask, contact_mask)
    # The shadow is strictly behind transparent canvas pixels.  This protects
    # hems, cuffs, bag bases, and anti-aliased product edges from gray fringing.
    transparent = ImageChops.invert(alpha)
    shadow_alpha = ImageChops.multiply(shadow_alpha, transparent)
    shadow = Image.new("RGBA", model.size, (29, 34, 43, 0))
    shadow.putalpha(shadow_alpha)
    result = Image.alpha_composite(shadow, model)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.suffix.lower() == ".webp":
        result.save(output, format="WEBP", quality=94, method=3, exact=True)
    else:
        result.save(output, format="PNG", optimize=True)

    return {
        "source": str(source),
        "output": str(output),
        "modelBBox": [left, top, right, bottom],
        "shadowCenter": [center_x, broad_center_y],
        "shadowSize": [broad_width, broad_height],
        "gap": gap,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(add_ground_shadow(args.source, args.output))


if __name__ == "__main__":
    main()
