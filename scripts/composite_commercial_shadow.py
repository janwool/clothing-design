#!/usr/bin/env python3
"""Merge a Cycles shadow-catcher render with a model-only alpha mask."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops


def composite_shadow(
    shadow_path: Path,
    model_mask_path: Path,
    output_path: Path,
    opacity: float,
    alpha_cutoff: float,
) -> None:
    shadow = Image.open(shadow_path).convert("RGBA")
    mask = Image.open(model_mask_path).convert("RGBA")
    if shadow.size != mask.size:
        raise ValueError(f"Image sizes differ: shadow={shadow.size}, mask={mask.size}")

    source_alpha = shadow.getchannel("A")
    model_alpha = mask.getchannel("A")
    cutoff = max(0, min(254, round(alpha_cutoff * 255)))
    opacity = max(0.0, min(1.0, opacity))
    denominator = max(1, 255 - cutoff)
    scaled_shadow_alpha = source_alpha.point(
        lambda value: round(max(value - cutoff, 0) * 255 / denominator * opacity)
    )
    final_alpha = ImageChops.lighter(model_alpha, scaled_shadow_alpha)
    shadow.putalpha(final_alpha)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    shadow.save(output_path, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("shadow", type=Path)
    parser.add_argument("model_mask", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--opacity", type=float, default=0.18)
    parser.add_argument("--alpha-cutoff", type=float, default=0.015)
    args = parser.parse_args()
    composite_shadow(
        args.shadow.resolve(),
        args.model_mask.resolve(),
        args.output.resolve(),
        args.opacity,
        args.alpha_cutoff,
    )


if __name__ == "__main__":
    main()
