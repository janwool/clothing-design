#!/usr/bin/env python3
"""Convert a raster black/white mask into SVG regions editable by Contour Studio."""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path

import cv2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Source mask PNG, or a directory containing *-mask.png files")
    parser.add_argument("output", type=Path, help="Destination editable SVG, or output directory in batch mode")
    parser.add_argument("--threshold", type=int, default=127, help="White-mask threshold (default: 127)")
    parser.add_argument("--epsilon", type=float, default=1.5, help="Contour simplification in pixels (default: 1.5)")
    parser.add_argument("--minimum-area", type=float, default=20.0, help="Ignore smaller contours (default: 20)")
    parser.add_argument("--title", default="Editable garment mask", help="SVG title")
    parser.add_argument("--manifest", type=Path, help="Write a JSON queue manifest in batch mode")
    return parser.parse_args()


def contour_depth(hierarchy, index: int) -> int:
    depth = 0
    parent = int(hierarchy[index][3])
    while parent >= 0:
        depth += 1
        parent = int(hierarchy[parent][3])
    return depth


def format_number(value: float) -> str:
    rounded = round(float(value), 2)
    return str(int(rounded)) if rounded.is_integer() else f"{rounded:.2f}".rstrip("0").rstrip(".")


def points_from_contour(contour, epsilon: float) -> list[tuple[float, float]]:
    simplified = cv2.approxPolyDP(contour, epsilon, True)
    return [(float(point[0][0]), float(point[0][1])) for point in simplified]


def path_markup(identifier: str, kind: str, points: list[tuple[float, float]]) -> str:
    serialized = " ".join(f"{format_number(x)},{format_number(y)}" for x, y in points)
    commands = [f"M {format_number(points[0][0])} {format_number(points[0][1])}"]
    commands.extend(f"L {format_number(x)} {format_number(y)}" for x, y in points[1:])
    path = " ".join(commands) + " Z"
    return (
        f'    <path id="{html.escape(identifier)}" data-mask-kind="{kind}" '
        f'data-mask-smoothing="0" data-mask-points="{serialized}" d="{path}"/>'
    )


def find_base_image(mask_path: Path) -> Path | None:
    prefix = mask_path.name[: -len("-mask.png")]
    for suffix in ("-base.png", ".png", "-base.webp", ".webp"):
        candidate = mask_path.with_name(prefix + suffix)
        if candidate.exists():
            return candidate
    return None


def display_name(mask_path: Path) -> str:
    stem = mask_path.name[: -len("-mask.png")]
    return " ".join(part.capitalize() if not part.isdigit() else part for part in stem.split("-"))


def convert_mask(args: argparse.Namespace, input_path: Path, output_path: Path, title: str) -> dict:
    source = cv2.imread(str(input_path), cv2.IMREAD_GRAYSCALE)
    if source is None:
        raise RuntimeError(f"Unable to read mask: {input_path}")

    height, width = source.shape
    _, binary = cv2.threshold(source, args.threshold, 255, cv2.THRESH_BINARY)
    contours, tree = cv2.findContours(binary, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE)
    hierarchy = tree[0] if tree is not None else []

    regions: list[tuple[str, list[tuple[float, float]], float]] = []
    for index, contour in enumerate(contours):
        area = abs(float(cv2.contourArea(contour)))
        if area < args.minimum_area:
            continue
        points = points_from_contour(contour, max(0.0, args.epsilon))
        if len(points) < 3:
            continue
        kind = "subtract" if contour_depth(hierarchy, index) % 2 else "add"
        regions.append((kind, points, area))

    regions.sort(key=lambda region: (region[0] == "subtract", -region[2]))
    add_paths = []
    subtract_paths = []
    add_index = subtract_index = 0
    for kind, points, _area in regions:
        if kind == "subtract":
            subtract_index += 1
            subtract_paths.append(path_markup(f"cut-{subtract_index}", kind, points))
        else:
            add_index += 1
            add_paths.append(path_markup(f"region-{add_index}", kind, points))

    title = html.escape(title)
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{title}">',
        f"  <title>{title}</title>",
        f'  <rect width="{width}" height="{height}" fill="#000000"/>',
        '  <g id="mask-add" fill="#ffffff" shape-rendering="geometricPrecision">',
        *add_paths,
        "  </g>",
        '  <g id="mask-subtract" fill="#000000" shape-rendering="geometricPrecision">',
        *subtract_paths,
        "  </g>",
        "</svg>",
        "",
    ]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")
    node_count = sum(len(points) for _kind, points, _area in regions)
    return {
        "width": width,
        "height": height,
        "addRegions": add_index,
        "cutRegions": subtract_index,
        "nodes": node_count,
    }


def public_url(path: Path) -> str:
    resolved = path.resolve()
    public_root = Path("public").resolve()
    try:
        relative = resolved.relative_to(public_root)
    except ValueError:
        return str(path)
    return "/" + relative.as_posix()


def main() -> None:
    args = parse_args()
    if args.input.is_file():
        stats = convert_mask(args, args.input, args.output, args.title)
        print(
            f"Generated {args.output} ({stats['width']}x{stats['height']}, "
            f"{stats['addRegions']} add, {stats['cutRegions']} cut, {stats['nodes']} nodes)"
        )
        return

    if not args.input.is_dir():
        raise SystemExit(f"Input does not exist: {args.input}")

    masks = sorted(args.input.glob("*-mask.png"))
    queue = []
    for index, mask_path in enumerate(masks, start=1):
        base_path = find_base_image(mask_path)
        if base_path is None:
            print(f"Skipped {mask_path.name}: no matching base image")
            continue
        identifier = mask_path.name[: -len("-mask.png")]
        output_path = args.output / f"{identifier}-mask.svg"
        title = f"{display_name(mask_path)} garment mask"
        stats = convert_mask(args, mask_path, output_path, title)
        queue.append({
            "id": identifier,
            "label": display_name(mask_path),
            "baseImage": public_url(base_path),
            "rasterMask": public_url(mask_path),
            "svgMask": public_url(output_path),
            **stats,
        })
        print(
            f"[{index}/{len(masks)}] {identifier}: {stats['addRegions']} add, "
            f"{stats['cutRegions']} cut, {stats['nodes']} nodes"
        )

    if args.manifest:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        args.manifest.write_text(json.dumps({"version": 1, "items": queue}, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {args.manifest}")
    print(f"Generated {len(queue)} editable SVG masks")


if __name__ == "__main__":
    main()
