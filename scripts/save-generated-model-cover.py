#!/usr/bin/env python3
"""Prepare an imagegen garment edit for the model catalog."""

import argparse
from pathlib import Path

from PIL import Image, ImageOps


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("slug")
    args = parser.parse_args()

    output_dir = Path(__file__).resolve().parents[1] / "public/images/model-covers/generated-commercial-v1"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{args.slug}.webp"

    with Image.open(args.source) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image = ImageOps.fit(image, (768, 1024), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        image.save(output_path, "WEBP", quality=84, method=6)
    print(output_path)


if __name__ == "__main__":
    main()
