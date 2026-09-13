#!/usr/bin/env python3
"""Remove a narrow rendered hem fringe while preserving an antialiased alpha edge."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def trim_bottom_edge(source: Path, output: Path, pixels: int, start_ratio: float) -> None:
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A")
    values = alpha.load()
    start_y = round(image.height * start_ratio)
    trim = max(1, pixels)

    for x in range(image.width):
        bottom = next(
            (y for y in range(image.height - 1, start_y - 1, -1) if values[x, y] > 0),
            None,
        )
        if bottom is None:
            continue
        new_bottom = max(start_y, bottom - trim)
        for y in range(new_bottom + 1, bottom + 1):
            values[x, y] = 0
        # Rebuild a small antialiased transition at the new silhouette.
        if values[x, new_bottom] > 0:
            values[x, new_bottom] = min(values[x, new_bottom], 85)
        if new_bottom - 1 >= start_y and values[x, new_bottom - 1] > 0:
            values[x, new_bottom - 1] = min(values[x, new_bottom - 1], 190)

    image.putalpha(alpha)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--pixels", type=int, default=9)
    parser.add_argument("--start-ratio", type=float, default=0.72)
    args = parser.parse_args()
    trim_bottom_edge(
        args.source.resolve(),
        args.output.resolve(),
        args.pixels,
        args.start_ratio,
    )


if __name__ == "__main__":
    main()
