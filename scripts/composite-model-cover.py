#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageColor, ImageEnhance


def main() -> None:
    parser = argparse.ArgumentParser(description="Composite a transparent garment render onto a solid cover background.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--background", default="#F4F5F7")
    parser.add_argument("--quality", type=int, default=88)
    parser.add_argument(
        "--foreground-brightness",
        type=float,
        default=1.0,
        help="Brightness multiplier for the rendered garment while preserving its alpha channel.",
    )
    args = parser.parse_args()

    foreground = Image.open(args.input).convert("RGBA")
    if args.foreground_brightness != 1.0:
        alpha = foreground.getchannel("A")
        brightened = ImageEnhance.Brightness(foreground.convert("RGB")).enhance(
            args.foreground_brightness
        )
        foreground = brightened.convert("RGBA")
        foreground.putalpha(alpha)
    background_color = ImageColor.getrgb(args.background)
    background = Image.new("RGBA", foreground.size, (*background_color, 255))
    result = Image.alpha_composite(background, foreground).convert("RGB")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output, "WEBP", quality=args.quality, method=6)
    print(f"output={args.output}")
    print(f"size={result.width}x{result.height}")
    print(f"background={args.background}")
    print(f"foreground_brightness={args.foreground_brightness}")


if __name__ == "__main__":
    main()
